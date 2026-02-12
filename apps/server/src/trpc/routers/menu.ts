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
import { publicProcedure, protectedProcedure, router } from '../trpc.js';
import { db } from '../../db';
import {
    menus,
    roles,
    roleMenuVisibility,
    type Menu,
    createMenuSchema,
    updateMenuSchema,
} from '../../db/schema/definitions.js';
import { eq, and, or, inArray, sql, isNull, asc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { menuService, type ResolvedMenu, type MenuTreeNode } from '../../services/menu.service.js';

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
 * Filter menus by role-based visibility configuration
 * Uses role_menu_visibility table to determine which menus are visible to the user.
 *
 * For override menus: checks visibility using the original menu's ID (code for system menus)
 */
async function filterMenusByRoleVisibility(
    menuList: MenuTreeNode[],
    ctx: { userId?: string; organizationId?: string; userRoles?: string[] }
): Promise<MenuTreeNode[]> {
    if (!ctx.userId || !ctx.organizationId || !ctx.userRoles?.length) {
        return [];
    }

    // Find role IDs for the user's role slugs
    const roleRecords = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(
            inArray(roles.slug, ctx.userRoles),
            eq(roles.organizationId, ctx.organizationId)
        ));

    if (roleRecords.length === 0) {
        return [];
    }

    const roleIds = roleRecords.map(r => r.id);

    // Flatten tree and collect visibility lookup IDs
    // For overrides: use the code (which equals the original menu ID for system menus)
    // For non-overrides: use the id
    const flattenMenus = (nodes: MenuTreeNode[]): MenuTreeNode[] => {
        const result: MenuTreeNode[] = [];
        for (const node of nodes) {
            result.push(node);
            if (node.children.length > 0) {
                result.push(...flattenMenus(node.children));
            }
        }
        return result;
    };
    const flatMenus = flattenMenus(menuList);

    if (flatMenus.length === 0) {
        return [];
    }

    // Build lookup: for each menu, what ID should we check visibility for?
    // For system menu overrides, the visibility record uses the original menu ID (= code)
    const visibilityLookupIds = new Set<string>();
    const menuToVisibilityId = new Map<string, string>(); // menu.id -> visibility lookup ID

    for (const menu of flatMenus) {
        // For overrides of system menus, use code (which equals original menu ID)
        // For custom menus, use their actual ID
        const lookupId = menu.isOverride ? menu.code : menu.id;
        visibilityLookupIds.add(lookupId);
        menuToVisibilityId.set(menu.id, lookupId);
    }

    // Query visibility for the lookup IDs
    const lookupIdArray = Array.from(visibilityLookupIds);

    const visibilityResults = await db
        .select({
            menuId: roleMenuVisibility.menuId,
            hasVisibility: sql<boolean>`
                bool_or(COALESCE(${roleMenuVisibility.visible}, false))
            `.as('has_visibility'),
        })
        .from(roleMenuVisibility)
        .where(and(
            inArray(roleMenuVisibility.menuId, lookupIdArray),
            inArray(roleMenuVisibility.roleId, roleIds),
            or(
                isNull(roleMenuVisibility.organizationId),
                eq(roleMenuVisibility.organizationId, ctx.organizationId)
            )
        ))
        .groupBy(roleMenuVisibility.menuId);

    // Build visibility map
    const visibilityMap = new Map<string, boolean>();
    for (const row of visibilityResults) {
        visibilityMap.set(row.menuId, row.hasVisibility ?? false);
    }

    // Filter tree recursively using the lookup mapping
    const filterTree = (nodes: MenuTreeNode[]): MenuTreeNode[] => {
        return nodes
            .filter(node => {
                const lookupId = menuToVisibilityId.get(node.id) ?? node.id;
                return visibilityMap.get(lookupId) ?? false;
            })
            .map(node => ({
                ...node,
                children: filterTree(node.children),
            }));
    };

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

            // Filter by role visibility
            const filteredTree = await filterMenusByRoleVisibility(tree, {
                userId: ctx.userId,
                organizationId: ctx.organizationId,
                userRoles: ctx.userRoles,
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

    /**
     * Get visible roles for a menu
     * Returns list of roles that can see this menu
     */
    getVisibleRoles: protectedProcedure
        .input(z.object({
            code: z.string(),
        }))
        .query(async ({ input, ctx }) => {
            const organizationId = ctx.organizationId;

            if (!organizationId) {
                return [];
            }

            // Get menu by code first
            const list = await menuService.getList(organizationId);
            const menu = list.find(m => m.code === input.code);

            if (!menu) {
                return [];
            }

            // Get visibility records for this menu
            const visibilityRecords = await db
                .select({
                    roleId: roleMenuVisibility.roleId,
                    organizationId: roleMenuVisibility.organizationId,
                    visible: roleMenuVisibility.visible,
                })
                .from(roleMenuVisibility)
                .where(eq(roleMenuVisibility.menuId, menu.id));

            // Get role details
            const roleIds = visibilityRecords.map(v => v.roleId);
            const roleDetails = roleIds.length > 0 ? await db
                .select({
                    id: roles.id,
                    name: roles.name,
                    slug: roles.slug,
                    organizationId: roles.organizationId,
                })
                .from(roles)
                .where(inArray(roles.id, roleIds)) : [];

            // Combine visibility info with role details
            return roleDetails.map(role => {
                const tenantVis = visibilityRecords.find(
                    v => v.roleId === role.id && v.organizationId === organizationId
                );
                const globalVis = visibilityRecords.find(
                    v => v.roleId === role.id && v.organizationId === null
                );

                return {
                    ...role,
                    visible: tenantVis?.visible ?? globalVis?.visible ?? false,
                    scope: tenantVis ? 'tenant' : globalVis ? 'global' : 'none',
                };
            });
        }),
});
