/**
 * Menu Service (Future-Ready for Plan D)
 *
 * Implements the "Ferrari Engine with Speed Limiter" approach:
 * - Full Plan D logic implemented (hierarchy changes, cycle detection, inbox)
 * - Soft Lock applied to restrict to Plan B behavior initially
 *
 * Key Features:
 * - Code-based logical references (not UUID)
 * - Copy-on-Write for tenant customization
 * - Auto-Inbox for orphaned system menus
 * - Cycle detection algorithm
 */

import { Injectable } from '@nestjs/common';
import { db, rawDb } from '../db';
import { menus, SYS_INBOX_CODE, type Menu, type InsertMenu, createMenuSchema, updateMenuSchema } from '@wordrhyme/db';
import { eq, and, or, isNull, asc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import type { z } from 'zod';
import { generateCoreMenus } from '../db/core-menus';

// Note: AuditService is no longer needed - audit is automatic via scoped-db

/**
 * Merged menu item with resolution info
 */
export interface ResolvedMenu extends Menu {
    isOverride: boolean; // true if tenant-specific override
    originalOrganizationId: string | null; // original organizationId before merge
}

/**
 * Menu tree node with children
 */
export interface MenuTreeNode extends ResolvedMenu {
    children: MenuTreeNode[];
}

/**
 * DTO types (auto-generated from Drizzle schema via drizzle-zod)
 * Single source of truth: database schema → Zod schema → TypeScript types
 */
export type CreateMenuDto = z.infer<typeof createMenuSchema>;
export type UpdateMenuDto = z.infer<typeof updateMenuSchema>;

@Injectable()
export class MenuService {
    // Note: AuditService dependency removed - audit is now automatic via scoped-db
    constructor() {}

    /**
     * Sync core system menus from code definitions to database.
     *
     * - Dev mode: called on every server startup
     * - Production: called during install/update (seed script)
     *
     * Strategy: delete all core system menus (organizationId = NULL) then re-insert.
     * This is necessary because PostgreSQL unique indexes don't match NULL values,
     * so ON CONFLICT (code, organization_id) cannot work for global menus.
     */
    async ensureCoreMenus(): Promise<void> {
        const coreMenuDefs = generateCoreMenus();

        if (coreMenuDefs.length === 0) return;

        // Use rawDb to bypass LBAC scoped-db:
        // - wrapInsert would force-override organizationId to request context
        // - wrapDelete would inject tenant filter
        // Both break global menus (organizationId = NULL)
        await rawDb.delete(menus).where(and(
            eq(menus.type, 'system'),
            eq(menus.source, 'core')
        ));

        // Insert fresh from code definitions
        for (const def of coreMenuDefs) {
            await rawDb.insert(menus).values({
                code: def.code,
                type: def.type,
                source: def.source,
                organizationId: def.organizationId,
                label: def.label,
                icon: def.icon ?? null,
                path: def.path ?? null,
                openMode: 'route',
                parentCode: def.parentCode ?? null,
                order: def.order ?? 0,
                visible: true,
                requiredPermission: def.requiredPermission ?? null,
                target: def.target,
            });
        }
    }

    /**
     * Get merged menu tree for a tenant
     *
     * Resolution Strategy:
     * 1. Get global menus (organizationId = NULL)
     * 2. Get tenant-specific menus
     * 3. Merge: tenant overrides global with same code
     * 4. Build tree with Auto-Inbox for orphans
     */
    async getTree(organizationId: string, target: 'admin' | 'web'): Promise<MenuTreeNode[]> {
        // Step 1: Get global menus (templates, organizationId = NULL)
        // Use rawDb to bypass LBAC tenant filter which would exclude NULL org menus
        const globalMenus = await rawDb
            .select()
            .from(menus)
            .where(and(
                isNull(menus.organizationId),
                eq(menus.target, target)
            ));

        // Step 2: Get tenant-specific menus
        const tenantMenus = await db
            .select()
            .from(menus)
            .where(and(
                eq(menus.organizationId, organizationId),
                eq(menus.target, target)
            ));

        // Step 3: Merge with tenant priority
        const mergedMenus = this.mergeMenus(globalMenus, tenantMenus);

        // Step 4: Filter visible only
        const visibleMenus = mergedMenus.filter(m => m.visible);

        // Step 5: Build tree with Auto-Inbox
        return this.buildTreeWithInbox(visibleMenus);
    }

    /**
     * Get flat list of menus for management UI
     * Returns merged list: tenant overrides replace global menus with same code
     */
    async getList(organizationId: string, target?: 'admin' | 'web'): Promise<ResolvedMenu[]> {
        // Get global menus (organizationId = NULL)
        // Use rawDb to bypass LBAC tenant filter which would exclude NULL org menus
        const globalConditions = [isNull(menus.organizationId)];
        if (target) {
            globalConditions.push(eq(menus.target, target));
        }
        const globalMenus = await rawDb
            .select()
            .from(menus)
            .where(and(...globalConditions))
            .orderBy(asc(menus.order));

        // Get tenant-specific menus
        const tenantConditions = [eq(menus.organizationId, organizationId)];
        if (target) {
            tenantConditions.push(eq(menus.target, target));
        }
        const tenantMenus = await db
            .select()
            .from(menus)
            .where(and(...tenantConditions))
            .orderBy(asc(menus.order));

        // Merge: tenant overrides replace global with same code
        const tenantCodeMap = new Map<string, typeof tenantMenus[0]>();
        for (const menu of tenantMenus) {
            tenantCodeMap.set(menu.code, menu);
        }

        const globalCodes = new Set(globalMenus.map(m => m.code));
        const result: ResolvedMenu[] = [];

        // Add global menus (or their tenant overrides)
        for (const globalMenu of globalMenus) {
            const tenantOverride = tenantCodeMap.get(globalMenu.code);
            if (tenantOverride) {
                result.push({
                    ...tenantOverride,
                    isOverride: true,
                    originalOrganizationId: tenantOverride.organizationId,
                });
                tenantCodeMap.delete(globalMenu.code); // Mark as processed
            } else {
                result.push({
                    ...globalMenu,
                    isOverride: false,
                    originalOrganizationId: null,
                });
            }
        }

        // Add remaining tenant-only menus (custom)
        for (const tenantMenu of tenantCodeMap.values()) {
            result.push({
                ...tenantMenu,
                isOverride: false,
                originalOrganizationId: tenantMenu.organizationId,
            });
        }

        // Sort by order
        result.sort((a, b) => a.order - b.order);

        return result;
    }

    /**
     * Update a menu (Copy-on-Write for global menus)
     *
     * SOFT LOCK: System menu hierarchy changes are blocked
     */
    async updateItem(
        organizationId: string,
        code: string,
        dto: UpdateMenuDto,
        isPlatformAdmin = false
    ): Promise<Menu> {
        // 1. Fetch current item (prefer tenant-specific, fallback to global)
        const item = await this.getMenuByCode(organizationId, code);

        if (!item) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: `Menu with code "${code}" not found`,
            });
        }

        // 2. [SYSTEM MENU RESTRICTIONS]
        if (item.type === 'system') {
            // 2a. Path is never modifiable for system menus (breaks routing)
            if (dto.path !== undefined && dto.path !== item.path) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'System menu path cannot be modified. It would break routing to the feature.',
                });
            }

            // 2b. [THE SOFT LOCK] - Hierarchy changes blocked for now
            if (dto.parentCode !== undefined && dto.parentCode !== item.parentCode) {
                // TODO: Remove this block to enable Plan D (Full Customization) in the future
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'System menu hierarchy is currently locked. You cannot move system menus.',
                });
            }
        }

        // 3. Cycle Detection (Ready for Plan D)
        if (dto.parentCode !== undefined && dto.parentCode !== null) {
            await this.detectCycle(organizationId, code, dto.parentCode);
        }

        // 4. Determine if we need Copy-on-Write
        const isGlobalMenu = item.organizationId === null;
        const needsCopyOnWrite = isGlobalMenu && !isPlatformAdmin;

        if (needsCopyOnWrite) {
            // Create tenant-specific override
            return this.createOverride(organizationId, item, dto);
        } else if (isGlobalMenu && isPlatformAdmin) {
            // Platform admin updates global template directly
            return this.updateMenuDirect(item.id, dto);
        } else {
            // Update tenant's own menu directly
            return this.updateMenuDirect(item.id, dto);
        }
    }

    /**
     * Create a new custom menu
     * Automatically grants visibility to owner and admin roles
     */
    async createItem(organizationId: string, dto: CreateMenuDto): Promise<Menu> {
        // Validate code format for custom menus
        if (!dto.code.startsWith('custom:')) {
            dto.code = `custom:${dto.code}`;
        }

        // Check for duplicate code in this tenant
        const existing = await this.getMenuByCode(organizationId, dto.code);
        if (existing) {
            throw new TRPCError({
                code: 'CONFLICT',
                message: `Menu with code "${dto.code}" already exists`,
            });
        }

        // Validate parentCode if provided
        if (dto.parentCode) {
            const parent = await this.getMenuByCode(organizationId, dto.parentCode);
            if (!parent) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Parent menu "${dto.parentCode}" not found`,
                });
            }
        }

        // Create menu
        const result = await db
            .insert(menus)
            .values({
                code: dto.code,
                type: 'custom',
                source: 'custom',
                organizationId: organizationId,
                label: dto.label,
                path: dto.path ?? null, // NULL for directory menus
                icon: dto.icon ?? null,
                openMode: dto.openMode ?? 'route',
                parentCode: dto.parentCode ?? null,
                order: dto.order ?? 0,
                visible: true,
                target: dto.target,
                metadata: dto.metadata ?? null,
            })
            .returning();

        if (!result || result.length === 0) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to create menu',
            });
        }

        const newMenu = result[0];
        if (!newMenu) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to create menu',
            });
        }

        // Note: Audit is now automatic via scoped-db Layer 1 (DB_INSERT)
        // To add business semantics, use .meta({ audit: { action: 'MENU_CREATE' } }) in tRPC router

        return newMenu;
    }


    /**
     * Delete a menu
     * Only custom menus can be deleted
     * System menus can only be hidden (visible=false)
     */
    async deleteItem(organizationId: string, code: string): Promise<void> {
        const item = await this.getMenuByCode(organizationId, code);

        if (!item) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: `Menu with code "${code}" not found`,
            });
        }

        if (item.type === 'system') {
            throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'System menus cannot be deleted. Use visibility toggle to hide them.',
            });
        }

        // Check for children
        const children = await db
            .select({ code: menus.code })
            .from(menus)
            .where(and(
                eq(menus.parentCode, code),
                or(isNull(menus.organizationId), eq(menus.organizationId, organizationId))
            ))
            .limit(1);

        if (children.length > 0) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Cannot delete menu with children. Delete children first.',
            });
        }

        await db
            .delete(menus)
            .where(eq(menus.id, item.id));

        // Note: Audit is now automatic via scoped-db Layer 1 (DB_DELETE)
    }

    /**
     * Hide/Show a system menu for a tenant
     * Creates an override with visible=false
     */
    async toggleVisibility(organizationId: string, code: string, visible: boolean): Promise<Menu> {
        return this.updateItem(organizationId, code, { visible }, false);
    }

    // ==================== Private Methods ====================

    /**
     * Merge global and tenant menus
     * Tenant menus with same code override global ones
     */
    private mergeMenus(globalMenus: Menu[], tenantMenus: Menu[]): ResolvedMenu[] {
        const tenantCodeMap = new Map<string, Menu>();
        for (const menu of tenantMenus) {
            tenantCodeMap.set(menu.code, menu);
        }

        const result: ResolvedMenu[] = [];

        // Add global menus (or their tenant overrides)
        for (const globalMenu of globalMenus) {
            const tenantOverride = tenantCodeMap.get(globalMenu.code);
            if (tenantOverride) {
                result.push({
                    ...tenantOverride,
                    isOverride: true,
                    originalOrganizationId: tenantOverride.organizationId,
                });
                tenantCodeMap.delete(globalMenu.code); // Mark as processed
            } else {
                result.push({
                    ...globalMenu,
                    isOverride: false,
                    originalOrganizationId: null,
                });
            }
        }

        // Add remaining tenant-only menus (custom)
        for (const tenantMenu of tenantCodeMap.values()) {
            result.push({
                ...tenantMenu,
                isOverride: false,
                originalOrganizationId: tenantMenu.organizationId,
            });
        }

        return result;
    }

    /**
     * Build tree with Auto-Inbox for orphaned system menus
     */
    private buildTreeWithInbox(menuList: ResolvedMenu[]): MenuTreeNode[] {
        const menuMap = new Map<string, MenuTreeNode>();
        const rootNodes: MenuTreeNode[] = [];

        // Initialize all nodes
        for (const menu of menuList) {
            menuMap.set(menu.code, { ...menu, children: [] });
        }

        // Build tree structure
        for (const menu of menuList) {
            const node = menuMap.get(menu.code)!;

            if (!menu.parentCode) {
                // Root level menu
                rootNodes.push(node);
            } else {
                const parent = menuMap.get(menu.parentCode);
                if (parent) {
                    parent.children.push(node);
                } else {
                    // Orphaned menu - parent doesn't exist or is hidden
                    if (menu.type === 'system') {
                        // Auto-Inbox: System menus go to SYS_INBOX
                        // For now, just add to root with a flag
                        node.parentCode = SYS_INBOX_CODE;
                        rootNodes.push(node);
                        console.log(`[MenuService] Auto-Inbox: "${menu.label}" (parent "${menu.parentCode}" not found)`);
                    } else {
                        // Custom menus become root
                        rootNodes.push(node);
                    }
                }
            }
        }

        // Sort children by order
        const sortChildren = (nodes: MenuTreeNode[]): MenuTreeNode[] => {
            return nodes
                .sort((a, b) => a.order - b.order)
                .map(node => ({
                    ...node,
                    children: sortChildren(node.children),
                }));
        };

        return sortChildren(rootNodes);
    }

    /**
     * Detect cycle in menu hierarchy
     * Uses iterative approach to follow parentCode chain
     */
    private async detectCycle(organizationId: string, code: string, newParentCode: string): Promise<void> {
        // Cannot be own parent
        if (code === newParentCode) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'A menu cannot be its own parent',
            });
        }

        // Follow the parent chain to detect cycle
        const visited = new Set<string>([code]);
        let currentCode = newParentCode;

        while (currentCode) {
            if (visited.has(currentCode)) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Cycle detected: "${code}" -> "${newParentCode}" would create a circular reference`,
                });
            }

            visited.add(currentCode);

            // Get parent of current
            const parentMenu = await this.getMenuByCode(organizationId, currentCode);
            if (!parentMenu || !parentMenu.parentCode) {
                break; // Reached root
            }

            currentCode = parentMenu.parentCode;
        }
    }

    /**
     * Get menu by code (prefer tenant-specific, fallback to global)
     */
    private async getMenuByCode(organizationId: string, code: string): Promise<Menu | null> {
        // Try tenant-specific first
        const [tenantMenu] = await db
            .select()
            .from(menus)
            .where(and(
                eq(menus.code, code),
                eq(menus.organizationId, organizationId)
            ))
            .limit(1);

        if (tenantMenu) {
            return tenantMenu;
        }

        // Fallback to global
        const [globalMenu] = await db
            .select()
            .from(menus)
            .where(and(
                eq(menus.code, code),
                isNull(menus.organizationId)
            ))
            .limit(1);

        return globalMenu ?? null;
    }

    /**
     * Create tenant-specific override (Copy-on-Write)
     */
    private async createOverride(organizationId: string, original: Menu, dto: UpdateMenuDto): Promise<Menu> {
        const overrideData: InsertMenu = {
            code: original.code,
            type: original.type,
            source: original.source,
            organizationId: organizationId,
            label: dto.label ?? original.label,
            icon: dto.icon !== undefined ? dto.icon : original.icon,
            path: dto.path ?? original.path,
            openMode: dto.openMode ?? original.openMode,
            parentCode: dto.parentCode !== undefined ? dto.parentCode : original.parentCode,
            order: dto.order ?? original.order,
            visible: dto.visible ?? original.visible,
            requiredPermission: original.requiredPermission,
            target: original.target,
            metadata: dto.metadata !== undefined ? dto.metadata : original.metadata,
        };

        const result = await db
            .insert(menus)
            .values(overrideData)
            .returning();

        if (!result || result.length === 0) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to create menu override',
            });
        }

        return result[0]!;
    }

    /**
     * Update menu directly
     */
    private async updateMenuDirect(id: string, dto: UpdateMenuDto): Promise<Menu> {
        // Get old menu for audit
        const oldMenu = await db
            .select()
            .from(menus)
            .where(eq(menus.id, id))
            .limit(1);

        const updateData: Partial<InsertMenu> = {};

        if (dto.label !== undefined) updateData.label = dto.label;
        if (dto.icon !== undefined) updateData.icon = dto.icon;
        if (dto.path !== undefined) updateData.path = dto.path;
        if (dto.openMode !== undefined) updateData.openMode = dto.openMode;
        if (dto.parentCode !== undefined) updateData.parentCode = dto.parentCode;
        if (dto.order !== undefined) updateData.order = dto.order;
        if (dto.visible !== undefined) updateData.visible = dto.visible;
        if (dto.metadata !== undefined) updateData.metadata = dto.metadata;

        updateData.updatedAt = new Date();

        const result = await db
            .update(menus)
            .set(updateData)
            .where(eq(menus.id, id))
            .returning();

        if (!result || result.length === 0) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Menu not found or update failed',
            });
        }

        // Note: Audit is now automatic via scoped-db Layer 1 (DB_UPDATE)

        return result[0]!;
    }
}

// Singleton instance
// Note: AuditService dependency removed - audit is now automatic via scoped-db
let menuServiceInstance: MenuService | null = null;

export async function getMenuService(): Promise<MenuService> {
    if (!menuServiceInstance) {
        menuServiceInstance = new MenuService();
    }
    return menuServiceInstance;
}

// Legacy export for backward compatibility
export const menuService = new MenuService();
