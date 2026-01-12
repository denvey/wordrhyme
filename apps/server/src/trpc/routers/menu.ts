/**
 * Menu tRPC Router
 *
 * Provides API for reading menus from database with permission filtering.
 */
import { z } from 'zod';
import { publicProcedure, router } from '../trpc.js';
import { db } from '../../db/client.js';
import { menus, selectMenuSchema, type Menu } from '../../db/schema/definitions.js';
import { eq, and } from 'drizzle-orm';
import { getContext } from '../../context/async-local-storage.js';
import { PermissionKernel } from '../../permission/index.js';

const permissionKernel = new PermissionKernel();

/**
 * Custom Zod schemas for menu API inputs
 */

/** Menu target type: admin (dashboard) or web (public-facing) */
export const menuTargetSchema = z.enum(['admin', 'web']);

/** Input schema for listing menus */
export const menuListInput = z.object({
    target: menuTargetSchema,
    organizationId: z.string().uuid().optional(),
});

/** Input schema for getting a single menu by ID */
export const menuGetInput = z.object({
    id: z.string().uuid(),
});

/** Response type using drizzle-zod generated schema */
export type MenuResponse = z.infer<typeof selectMenuSchema>;

/**
 * Filter menus by user permissions
 * Menus without requiredPermission are visible to all authenticated users.
 * Menus with requiredPermission are only visible if user has that capability.
 */
async function filterMenusByPermission(menuList: Menu[]): Promise<Menu[]> {
    const ctx = getContext();

    console.log('[Menu Filter] Context:', {
        userId: ctx?.userId,
        tenantId: ctx?.tenantId,
        userRole: ctx?.userRole,
    });

    // If no user, return only menus without permission requirement
    if (!ctx?.userId) {
        console.log('[Menu Filter] No user, returning only public menus');
        return menuList.filter((m) => !m.requiredPermission);
    }

    // Check permissions for each menu
    const filtered: Menu[] = [];
    for (const menu of menuList) {
        if (!menu.requiredPermission) {
            // No permission required - visible to all authenticated users
            filtered.push(menu);
        } else {
            // Check if user has the required permission
            const hasPermission = await permissionKernel.can(menu.requiredPermission);
            console.log(`[Menu Filter] ${menu.label}: ${menu.requiredPermission} -> ${hasPermission}`);
            if (hasPermission) {
                filtered.push(menu);
            }
        }
    }

    console.log('[Menu Filter] Filtered menus:', filtered.map(m => m.label));
    return filtered;
}

export const menuRouter = router({
    /**
     * List menus for a target (admin or web)
     * Filters menus based on user permissions.
     */
    list: publicProcedure
        .input(menuListInput)
        .query(async ({ input }) => {
            const ctx = getContext();
            const orgId = input.organizationId ?? ctx?.tenantId ?? 'default';

            // Get all menus for this target and organization
            const allMenus = await db
                .select()
                .from(menus)
                .where(and(
                    eq(menus.target, input.target),
                    eq(menus.organizationId, orgId)
                ));

            // Filter menus by permission
            const filteredMenus = await filterMenusByPermission(allMenus);

            // Build hierarchical structure
            const rootMenus = filteredMenus
                .filter(m => !m.parentId)
                .sort((a, b) => a.order - b.order);

            const menuWithChildren = rootMenus.map(menu => ({
                ...menu,
                children: filteredMenus
                    .filter(m => m.parentId === menu.id)
                    .sort((a, b) => a.order - b.order),
            }));

            return menuWithChildren;
        }),

    /**
     * Get a single menu by ID
     */
    get: publicProcedure
        .input(menuGetInput)
        .query(async ({ input }) => {
            const result = await db
                .select()
                .from(menus)
                .where(eq(menus.id, input.id))
                .limit(1);

            return result[0] ?? null;
        }),
});
