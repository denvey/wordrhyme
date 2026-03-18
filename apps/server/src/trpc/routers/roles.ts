import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { db } from '../../db';
import { roles, rolePermissions } from '@wordrhyme/db';
import { eq, and } from 'drizzle-orm';
import { parseCapability } from '../../permission/capability-parser';
import type { CaslRule } from '@wordrhyme/db';

/**
 * Input schemas for role operations
 */
const createRoleInput = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
});

const updateRoleInput = z.object({
    roleId: z.string(),
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
});

const roleIdInput = z.object({
    roleId: z.string(),
});

/**
 * CASL rule input schema for permission assignment
 */
const caslRuleInput = z.object({
    action: z.string().min(1),
    subject: z.string().min(1),
    fields: z.array(z.string()).nullable().optional(),
    conditions: z.record(z.unknown()).nullable().optional(),
    inverted: z.boolean().optional().default(false),
});

const assignPermissionsInput = z.object({
    roleId: z.string(),
    // Support both legacy capabilities and new CASL rules
    capabilities: z.array(z.string()).optional(),
    rules: z.array(caslRuleInput).optional(),
});

/**
 * Generate slug from name
 */
function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Roles Management Router
 *
 * Provides CRUD operations for organization-scoped roles.
 * Only admins/owners can manage roles.
 */
export const rolesRouter = router({
    /**
     * List all roles in the current organization
     */
    list: protectedProcedure
        .query(async ({ ctx }) => {
            if (!ctx.organizationId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No organization context',
                });
            }

            const result = await db
                .select()
                .from(roles)
                .where(eq(roles.organizationId, ctx.organizationId))
                .orderBy(roles.isSystem, roles.name);

            return result;
        }),

    /**
     * Get a single role with its permissions (CASL format)
     */
    get: protectedProcedure
        .input(roleIdInput)
        .query(async ({ ctx, input }) => {
            if (!ctx.organizationId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No organization context',
                });
            }

            const [role] = await db
                .select()
                .from(roles)
                .where(and(
                    eq(roles.id, input.roleId),
                    eq(roles.organizationId, ctx.organizationId)
                ));

            if (!role) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Role not found',
                });
            }

            // Get permissions for this role in CASL format
            const permissions = await db
                .select({
                    action: rolePermissions.action,
                    subject: rolePermissions.subject,
                    fields: rolePermissions.fields,
                    conditions: rolePermissions.conditions,
                    inverted: rolePermissions.inverted,
                })
                .from(rolePermissions)
                .where(eq(rolePermissions.roleId, role.id));

            return {
                ...role,
                rules: permissions as CaslRule[],
            };
        }),

    /**
     * Create a new custom role
     */
    create: protectedProcedure
        .input(createRoleInput)
        .use(requirePermission('organization:manage'))
        .mutation(async ({ ctx, input }) => {
            if (!ctx.organizationId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No organization context',
                });
            }

            const slug = generateSlug(input.name);

            // Check if slug already exists
            const existing = await db
                .select({ id: roles.id })
                .from(roles)
                .where(and(
                    eq(roles.organizationId, ctx.organizationId),
                    eq(roles.slug, slug)
                ));

            if (existing.length > 0) {
                throw new TRPCError({
                    code: 'CONFLICT',
                    message: 'A role with this name already exists',
                });
            }

            const [newRole] = await db
                .insert(roles)
                .values({
                    organizationId: ctx.organizationId,
                    name: input.name,
                    slug,
                    description: input.description,
                    isSystem: false,
                })
                .returning();

            return newRole;
        }),

    /**
     * Update an existing role
     */
    update: protectedProcedure
        .input(updateRoleInput)
        .use(requirePermission('organization:manage'))
        .mutation(async ({ ctx, input }) => {
            if (!ctx.organizationId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No organization context',
                });
            }

            // Get existing role
            const [existing] = await db
                .select()
                .from(roles)
                .where(and(
                    eq(roles.id, input.roleId),
                    eq(roles.organizationId, ctx.organizationId)
                ));

            if (!existing) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Role not found',
                });
            }

            // Build update object
            const updates: Partial<typeof roles.$inferInsert> = {};
            if (input.name !== undefined) {
                updates.name = input.name;
                // Update slug only for non-system roles
                if (!existing.isSystem) {
                    updates.slug = generateSlug(input.name);
                }
            }
            if (input.description !== undefined) {
                updates.description = input.description;
            }

            const [updated] = await db
                .update(roles)
                .set(updates)
                .where(eq(roles.id, input.roleId))
                .returning();

            return updated;
        }),

    /**
     * Delete a custom role
     */
    delete: protectedProcedure
        .input(roleIdInput)
        .use(requirePermission('organization:manage'))
        .mutation(async ({ ctx, input }) => {
            if (!ctx.organizationId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No organization context',
                });
            }

            // Get existing role
            const [existing] = await db
                .select()
                .from(roles)
                .where(and(
                    eq(roles.id, input.roleId),
                    eq(roles.organizationId, ctx.organizationId)
                ));

            if (!existing) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Role not found',
                });
            }

            // Cannot delete system roles
            if (existing.isSystem) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Cannot delete system role',
                });
            }

            // Delete role (permissions cascade)
            await db
                .delete(roles)
                .where(eq(roles.id, input.roleId));

            return { success: true };
        }),

    /**
     * Assign permissions to a role (CASL format)
     * Replaces all existing permissions with the new set.
     * Supports both legacy capabilities and new CASL rules.
     */
    assignPermissions: protectedProcedure
        .input(assignPermissionsInput)
        .use(requirePermission('organization:manage'))
        .mutation(async ({ ctx, input }) => {
            if (!ctx.organizationId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No organization context',
                });
            }

            // Verify role exists and belongs to org
            const [role] = await db
                .select()
                .from(roles)
                .where(and(
                    eq(roles.id, input.roleId),
                    eq(roles.organizationId, ctx.organizationId)
                ));

            if (!role) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Role not found',
                });
            }

            // Cannot modify owner role permissions
            if (role.slug === 'owner') {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Cannot modify owner role permissions',
                });
            }

            // Delete existing permissions
            await db
                .delete(rolePermissions)
                .where(eq(rolePermissions.roleId, input.roleId));

            // Build permission records from rules or legacy capabilities
            const permissionRecords: Array<{
                roleId: string;
                action: string;
                subject: string;
                fields: string[] | null;
                conditions: Record<string, unknown> | null;
                inverted: boolean;
            }> = [];

            // Process new CASL rules if provided
            if (input.rules && input.rules.length > 0) {
                for (const rule of input.rules) {
                    permissionRecords.push({
                        roleId: input.roleId,
                        action: rule.action,
                        subject: rule.subject,
                        fields: rule.fields ?? null,
                        conditions: rule.conditions ?? null,
                        inverted: rule.inverted ?? false,
                    });
                }
            }

            // Process legacy capabilities if provided (convert to CASL format)
            if (input.capabilities && input.capabilities.length > 0) {
                for (const capability of input.capabilities) {
                    const parsed = parseCapability(capability);
                    permissionRecords.push({
                        roleId: input.roleId,
                        action: parsed.action,
                        subject: parsed.subject,
                        fields: null,
                        conditions: null,
                        inverted: false,
                    });
                }
            }

            // Insert new permissions
            if (permissionRecords.length > 0) {
                await db.insert(rolePermissions).values(permissionRecords);
            }

            return { success: true };
        }),
});
