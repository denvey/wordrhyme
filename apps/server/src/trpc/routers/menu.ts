/**
 * Menu tRPC Router (Future-Ready for Plan D)
 *
 * Uses MenuService with code-based logical references.
 * Implements Copy-on-Write for tenant customization.
 *
 * Soft Lock: System menu hierarchy changes are blocked (Plan B behavior)
 * TODO: Remove soft lock to enable Plan D (Full Customization)
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, protectedProcedure, router } from '../trpc';
import { db } from '../../db';
import {
    menus,
    type Menu,
} from '../../db/schema/definitions';
import { createMenuSchema, updateMenuSchema } from '../../db/schema/menus';
import { eq, and, inArray, asc } from 'drizzle-orm';
import { menuService, type ResolvedMenu, type MenuTreeNode } from '../../services/menu.service';
import { PermissionKernel } from '../../permission';

/**
 * Zod Schemas (auto-generated from Drizzle schema)
 */

/** Menu target type: admin (dashboard) or web (public-facing) */
export const menuTargetSchema = z.enum(['admin', 'web']);

/** Menu open mode: route (internal), external (new tab) */
export const menuOpenModeSchema = z.enum(['route', 'external']);

/** Input schema for listing menus (sidebar) */
export const menuListInput = z.object({
    target: menuTargetSchema,
});

/** Input schema for getting a single menu by code */
export const menuGetInput = z.object({
    code: z.string(),
});

/** Input schema for listing all menus (admin management) */
export const menuListAllInput = z.object({
    target: menuTargetSchema.optional(),
});

/** Input schema for creating a menu (from Drizzle schema) */
export const menuCreateInput = createMenuSchema;

/** Input schema for updating a menu (from Drizzle schema) */
export const menuUpdateInput = updateMenuSchema.extend({
    code: z.string(), // Add code for identifying which menu to update
});

/** Input schema for deleting a menu */
export const menuDeleteInput = z.object({
    code: z.string(),
});

/** Input schema for toggling visibility */
export const menuToggleVisibilityInput = z.object({
    code: z.string(),
    visible: z.boolean(),
});

/**
 * Permission kernel instance for menu visibility checks
 */
const permissionKernel = new PermissionKernel();

/**
 * Filter menus by requiredPermission using CASL permission checks.
 *
 * - Menus with requiredPermission (format "Subject:action") are checked via PermissionKernel.can()
 * - Menus with null requiredPermission (directory menus) are visible if any child is visible
 * - Works bottom-up: first filter leaf menus, then prune empty directories
 */
async function filterMenusByPermission(
    menuList: MenuTreeNode[],
    ctx: { userId?: string | undefined; organizationId?: string | undefined; userRoles?: string[] | undefined; userRole?: string | undefined; requestId: string; currentTeamId?: string | undefined }
): Promise<MenuTreeNode[]> {
    if (!ctx.userId || !ctx.organizationId) {
        return [];
    }

    // Build permission context for PermissionKernel
    const permCtx = {
        requestId: ctx.requestId,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        userRole: ctx.userRole,
        userRoles: ctx.userRoles,
        currentTeamId: ctx.currentTeamId,
    };

    // Check a single menu's permission
    async function canSeeMenu(menu: MenuTreeNode): Promise<boolean> {
        const perm = menu.requiredPermission;
        if (!perm) {
            // No permission required — visibility determined by children
            return true;
        }

        // Parse "Subject:action" format (e.g. "Member:read" → action='read', subject='Member')
        const colonIdx = perm.indexOf(':');
        if (colonIdx === -1) {
            // Fallback: treat as legacy capability string
            return permissionKernel.can(perm, undefined, undefined, permCtx, true);
        }

        const subject = perm.substring(0, colonIdx);
        const action = perm.substring(colonIdx + 1);
        return permissionKernel.can(action, subject, undefined, permCtx, true);
    }

    // Recursively filter tree bottom-up:
    // 1. Filter children first
    // 2. For directory menus (no requiredPermission, no path): visible only if has visible children
    // 3. For leaf menus: visible if permission check passes
    async function filterTree(nodes: MenuTreeNode[]): Promise<MenuTreeNode[]> {
        const result: MenuTreeNode[] = [];

        for (const node of nodes) {
            // First, recursively filter children
            const filteredChildren = await filterTree(node.children);
            const isDirectory = !node.requiredPermission && !node.path;

            if (isDirectory) {
                // Directory menus: only show if at least one child is visible
                if (filteredChildren.length > 0) {
                    result.push({ ...node, children: filteredChildren });
                }
            } else {
                // Leaf / resource menus: check permission
                const allowed = await canSeeMenu(node);
                if (allowed) {
                    result.push({ ...node, children: filteredChildren });
                }
            }
        }

        return result;
    }

    return filterTree(menuList);
}

/**
 * Helper: Remove undefined values from object
 * Converts Zod optional fields to DTO format
 */
function filterUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined)
    ) as Partial<T>;
}

export const menuRouter = router({
    /**
     * List menus for sidebar (with visibility filtering)
     * Returns hierarchical tree structure
     */
    list: publicProcedure
        .input(menuListInput)
        .query(async ({ input, ctx }) => {
            const organizationId = ctx.organizationId;

            if (!organizationId) {
                return [];
            }

            // Get menu tree from service
            const tree = await menuService.getTree(organizationId, input.target);

            // Filter by permission
            const filteredTree = await filterMenusByPermission(tree, {
                userId: ctx.userId,
                organizationId: ctx.organizationId,
                userRoles: ctx.userRoles,
                userRole: ctx.userRole,
                requestId: ctx.requestId,
                currentTeamId: (ctx as { currentTeamId?: string }).currentTeamId,
            });

            // Force complete JSON serialization to avoid any circular references
            return JSON.parse(JSON.stringify(filteredTree));
        }),

    /**
     * Get a single menu by code
     */
    get: publicProcedure
        .input(menuGetInput)
        .query(async ({ input, ctx }) => {
            const organizationId = ctx.organizationId ?? 'default';

            // Get from service (handles tenant override)
            const list = await menuService.getList(organizationId);
            const menu = list.find(m => m.code === input.code);

            return menu ?? null;
        }),

    /**
     * List all menus for management (admin page)
     * Returns flat list with all menus, no visibility filtering
     */
    listAll: protectedProcedure
        .input(menuListAllInput)
        .query(async ({ input, ctx }) => {
            const organizationId = ctx.organizationId;

            if (!organizationId) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'Tenant ID required',
                });
            }

            const list = await menuService.getList(organizationId, input.target);

            return list;
        }),

    /**
     * Create a new custom menu
     */
    create: protectedProcedure
        .input(menuCreateInput)
        .mutation(async ({ input, ctx }) => {
            const organizationId = ctx.organizationId;

            if (!organizationId) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'Tenant ID required',
                });
            }

            const newMenu = await menuService.createItem(organizationId, {
                code: input.code,
                label: input.label,
                path: input.path ?? null,
                icon: input.icon ?? null,
                openMode: input.openMode,
                parentCode: input.parentCode ?? null,
                order: input.order,
                target: input.target,
                metadata: input.metadata ?? null,
            });

            return newMenu;
        }),

    /**
     * Update an existing menu
     * Uses Copy-on-Write for global menus
     * Soft Lock: System menu hierarchy changes are blocked
     */
    update: protectedProcedure
        .input(menuUpdateInput)
        .mutation(async ({ input, ctx }) => {
            const organizationId = ctx.organizationId;
            const isPlatformAdmin = ctx.userRole === 'admin';

            if (!organizationId) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'Tenant ID required',
                });
            }

            const { code, ...inputData } = input;
            const updateData = filterUndefined(inputData);

            const updated = await menuService.updateItem(
                organizationId,
                code,
                updateData,
                isPlatformAdmin
            );

            return updated;
        }),

    /**
     * Delete a menu
     * Only custom menus can be deleted
     */
    delete: protectedProcedure
        .input(menuDeleteInput)
        .mutation(async ({ input, ctx }) => {
            const organizationId = ctx.organizationId;

            if (!organizationId) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'Tenant ID required',
                });
            }

            await menuService.deleteItem(organizationId, input.code);

            return { success: true };
        }),

    /**
     * Toggle menu visibility
     * Creates an override for system menus
     */
    toggleVisibility: protectedProcedure
        .input(menuToggleVisibilityInput)
        .mutation(async ({ input, ctx }) => {
            const organizationId = ctx.organizationId;

            if (!organizationId) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'Tenant ID required',
                });
            }

            const updated = await menuService.toggleVisibility(
                organizationId,
                input.code,
                input.visible
            );

            return updated;
        }),
});
