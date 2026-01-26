/**
 * Role Menu Visibility Router
 *
 * Manages menu visibility configuration for roles.
 * - Platform admin: manages global defaults (organizationId = NULL)
 * - Tenant admin: manages tenant overrides (organizationId = organizationId)
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { db } from '../../db';
import { roleMenuVisibility, menus, roles } from '../../db/schema/definitions';
import { eq, and, isNull, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

/**
 * Input schemas
 */
const listInput = z.object({
    roleId: z.string().uuid(),
    organizationId: z.string().min(1).nullable().optional(), // null = global scope
});

const updateInput = z.object({
    roleId: z.string().uuid(),
    organizationId: z.string().min(1).nullable(), // null = global scope
    visibleMenuIds: z.array(z.string()), // IDs of menus that should be visible
});

const getEffectiveInput = z.object({
    target: z.enum(['admin', 'web']),
});

/**
 * Menu visibility item with effective state
 */
interface MenuVisibilityItem {
    menuId: string;
    code: string;
    label: string;
    path: string | null;
    icon: string | null;
    parentCode: string | null;
    order: number;
    tenantVisible: boolean | null;
    globalVisible: boolean | null;
    effectiveVisible: boolean;
}

export const roleMenuVisibilityRouter = router({
    /**
     * List menu visibility configuration for a role
     * Returns all menus with their visibility states (tenant override + global default)
     */
    list: protectedProcedure
        .input(listInput)
        .query(async ({ ctx, input }) => {
            const orgId = input.organizationId ?? ctx.organizationId;

            // Authorization check
            if (input.organizationId === null) {
                // Global scope - require platform admin
                if (ctx.userRole !== 'admin') {
                    throw new TRPCError({
                        code: 'FORBIDDEN',
                        message: 'Only platform admin can manage global menu visibility',
                    });
                }
            } else if (orgId !== ctx.organizationId) {
                // Cross-tenant access forbidden
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Cannot access other organization menu configurations',
                });
            }

            // Verify role exists
            const [role] = await db
                .select()
                .from(roles)
                .where(eq(roles.id, input.roleId));

            if (!role) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Role not found',
                });
            }

            // Create aliases for self-joins
            const tenantVis = alias(roleMenuVisibility, 'tenant_vis');
            const globalVis = alias(roleMenuVisibility, 'global_vis');

            // Query menus with visibility from both scopes
            const results = await db
                .select({
                    menuId: menus.id,
                    code: menus.code,
                    label: menus.label,
                    path: menus.path,
                    icon: menus.icon,
                    parentCode: menus.parentCode,
                    order: menus.order,
                    tenantVisible: tenantVis.visible,
                    globalVisible: globalVis.visible,
                })
                .from(menus)
                .leftJoin(
                    tenantVis,
                    and(
                        eq(tenantVis.roleId, input.roleId),
                        eq(tenantVis.menuId, menus.id),
                        orgId ? eq(tenantVis.organizationId, orgId) : sql`false`
                    )
                )
                .leftJoin(
                    globalVis,
                    and(
                        eq(globalVis.roleId, input.roleId),
                        eq(globalVis.menuId, menus.id),
                        isNull(globalVis.organizationId)
                    )
                )
                .where(and(
                    eq(menus.target, 'admin'),
                    // Only show global menus (NULL) or menus for current organization
                    // Exclude platform-specific menus for non-platform organizations
                    or(
                        isNull(menus.organizationId),
                        orgId ? eq(menus.organizationId, orgId) : sql`false`
                    )
                ))
                .orderBy(menus.order);

            // Calculate effective visibility
            const items: MenuVisibilityItem[] = results.map(row => ({
                menuId: row.menuId,
                code: row.code,
                label: row.label,
                path: row.path,
                icon: row.icon,
                parentCode: row.parentCode,
                order: row.order,
                tenantVisible: row.tenantVisible,
                globalVisible: row.globalVisible,
                // Resolution: tenant override > global default > default false
                effectiveVisible: row.tenantVisible ?? row.globalVisible ?? false,
            }));

            // Merge menus with same code (org override takes priority over global)
            const mergedMap = new Map<string, MenuVisibilityItem>();
            for (const item of items) {
                const existing = mergedMap.get(item.code);
                if (!existing) {
                    mergedMap.set(item.code, item);
                } else {
                    // If current item is org-specific (has tenantVisible), it overrides global
                    if (item.tenantVisible !== null) {
                        mergedMap.set(item.code, item);
                    }
                }
            }

            return Array.from(mergedMap.values()).sort((a, b) => a.order - b.order);
        }),

    /**
     * Update menu visibility for a role
     * Replaces all visibility settings for the given scope
     */
    update: protectedProcedure
        .input(updateInput)
        .mutation(async ({ ctx, input }) => {
            // Authorization check
            if (input.organizationId === null) {
                // Global scope - require platform admin
                if (ctx.userRole !== 'admin') {
                    throw new TRPCError({
                        code: 'FORBIDDEN',
                        message: 'Only platform admin can manage global menu visibility',
                    });
                }
            } else if (input.organizationId !== ctx.organizationId) {
                // Cross-tenant access forbidden
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Cannot modify other organization menu configurations',
                });
            }

            // Verify role exists
            const [role] = await db
                .select()
                .from(roles)
                .where(eq(roles.id, input.roleId));

            if (!role) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Role not found',
                });
            }

            // Get all admin menus
            const allMenus = await db
                .select({ id: menus.id })
                .from(menus)
                .where(eq(menus.target, 'admin'));

            const allMenuIds = new Set(allMenus.map(m => m.id));
            const visibleSet = new Set(input.visibleMenuIds);

            // Validate provided menu IDs
            for (const menuId of input.visibleMenuIds) {
                if (!allMenuIds.has(menuId)) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Invalid menu ID: ${menuId}`,
                    });
                }
            }

            // Transaction: delete old + insert new
            await db.transaction(async (tx) => {
                // Delete existing visibility records for this role+scope
                if (input.organizationId === null) {
                    await tx
                        .delete(roleMenuVisibility)
                        .where(and(
                            eq(roleMenuVisibility.roleId, input.roleId),
                            isNull(roleMenuVisibility.organizationId)
                        ));
                } else {
                    await tx
                        .delete(roleMenuVisibility)
                        .where(and(
                            eq(roleMenuVisibility.roleId, input.roleId),
                            eq(roleMenuVisibility.organizationId, input.organizationId)
                        ));
                }

                // Insert new visibility records (only for visible menus)
                // We store visible=true records; absence means not visible
                if (input.visibleMenuIds.length > 0) {
                    const records = input.visibleMenuIds.map(menuId => ({
                        roleId: input.roleId,
                        menuId,
                        organizationId: input.organizationId,
                        visible: true,
                    }));

                    await tx.insert(roleMenuVisibility).values(records);
                }
            });

            return { success: true };
        }),

    /**
     * Get effective visible menus for current user
     * Used by menu.list to filter menus based on role visibility config
     */
    getEffective: protectedProcedure
        .input(getEffectiveInput)
        .query(async ({ ctx, input }) => {
            if (!ctx.userId) {
                return [];
            }

            const orgId = ctx.organizationId;
            const userRoles = (ctx as any).userRoles as string[] | undefined;

            if (!userRoles || userRoles.length === 0) {
                return [];
            }

            // Find role IDs for the user's role slugs
            const roleRecords = await db
                .select({ id: roles.id, slug: roles.slug })
                .from(roles)
                .where(and(
                    inArray(roles.slug, userRoles),
                    orgId ? eq(roles.organizationId, orgId) : sql`true`
                ));

            if (roleRecords.length === 0) {
                return [];
            }

            const roleIds = roleRecords.map(r => r.id);

            // Create aliases for self-joins
            const tenantVis = alias(roleMenuVisibility, 'tenant_vis');
            const globalVis = alias(roleMenuVisibility, 'global_vis');

            // Query menus with visibility aggregated across all user roles
            // visible if ANY role has visible=true
            const results = await db
                .select({
                    menuId: menus.id,
                    code: menus.code,
                    label: menus.label,
                    path: menus.path,
                    icon: menus.icon,
                    parentCode: menus.parentCode,
                    order: menus.order,
                    source: menus.source,
                    metadata: menus.metadata,
                    // Aggregate visibility: true if any role grants visibility
                    hasVisibility: sql<boolean>`
                        bool_or(
                            COALESCE(${tenantVis.visible}, ${globalVis.visible}, false)
                        )
                    `.as('has_visibility'),
                })
                .from(menus)
                .leftJoin(
                    tenantVis,
                    and(
                        inArray(tenantVis.roleId, roleIds),
                        eq(tenantVis.menuId, menus.id),
                        orgId ? eq(tenantVis.organizationId, orgId) : sql`false`
                    )
                )
                .leftJoin(
                    globalVis,
                    and(
                        inArray(globalVis.roleId, roleIds),
                        eq(globalVis.menuId, menus.id),
                        isNull(globalVis.organizationId)
                    )
                )
                .where(eq(menus.target, input.target))
                .groupBy(
                    menus.id,
                    menus.code,
                    menus.label,
                    menus.path,
                    menus.icon,
                    menus.parentCode,
                    menus.order,
                    menus.source,
                    menus.metadata
                )
                .orderBy(menus.order);

            // Filter to visible menus
            const visibleMenus = results.filter(r => r.hasVisibility);

            // Enforce parent-child rule: hidden parent hides children
            const visibleCodes = new Set(visibleMenus.map(m => m.code));
            const finalMenus = visibleMenus.filter(menu => {
                if (!menu.parentCode) return true;
                // Check if parent menu is visible by matching parentCode with code
                return visibleCodes.has(menu.parentCode);
            });

            return finalMenus.map(m => ({
                id: m.menuId,
                label: m.label,
                path: m.path,
                icon: m.icon,
                parentCode: m.parentCode,
                order: m.order,
                source: m.source,
                metadata: m.metadata,
            }));
        }),
});
