import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { roles, rolePermissions } from '@wordrhyme/db';
import { eq, and } from 'drizzle-orm';
import {
  getResourceTree,
  getResourceDetail,
  type ResourceTreeNode,
  type ConditionPresetKey,
} from '../../permission/resource-definitions';
import {
  CONDITION_PRESETS,
  getPresetsForSubject,
  combinePresets,
} from '../../permission/condition-presets';
import { PermissionCache } from '../../permission/permission-cache';
import { CacheManager } from '../../cache/cache-manager';
import { Actions, Subjects } from '../../permission/constants';

/**
 * Permission cache instance
 */
let permissionCacheInstance: PermissionCache | null = null;

function getPermissionCache(): PermissionCache | null {
  if (!permissionCacheInstance) {
    try {
      const cacheManager = new CacheManager();
      permissionCacheInstance = new PermissionCache(cacheManager);
    } catch (error) {
      console.error('[PermissionConfigRouter] Failed to initialize PermissionCache:', error);
      return null;
    }
  }
  return permissionCacheInstance;
}

/**
 * Input schemas
 */
const savePermissionsInput = z.object({
  roleId: z.string(),
  permissions: z.record(z.object({
    actions: z.array(z.string()),
    preset: z.enum(['none', 'own', 'team', 'department', 'public', 'draft', 'published', 'assigned', 'not_archived']).nullable().optional(),
    customConditions: z.record(z.unknown()).nullable().optional(),
  })),
});

/**
 * Permission Config Router
 *
 * Provides APIs for the permission configuration UI:
 * - Resource tree for left navigation
 * - Resource detail for advanced config panel
 * - Role permissions CRUD
 */
export const permissionConfigRouter = router({
  /**
   * Get resource tree for left navigation
   * Requires: Role read permission
   */
  getResourceTree: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .query(async () => {
      return getResourceTree();
    }),

  /**
   * Get resource detail for advanced config panel
   * Requires: Role read permission
   */
  getResourceDetail: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .input(z.object({
      subject: z.string(),
    }))
    .query(async ({ input }) => {
      const detail = getResourceDetail(input.subject);
      if (!detail) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Resource not found: ${input.subject}`,
        });
      }

      // Get applicable presets
      const presets = getPresetsForSubject(input.subject).map(p => ({
        key: p.key,
        label: p.label,
        description: p.description,
        icon: p.icon,
      }));

      return {
        ...detail,
        presets,
      };
    }),

  /**
   * Get all available presets
   * Requires: Role read permission
   */
  getPresets: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .query(async () => {
      return Object.values(CONDITION_PRESETS).map(p => ({
        key: p.key,
        label: p.label,
        description: p.description,
        icon: p.icon,
        applicableSubjects: p.applicableSubjects ?? null,
        combinable: p.combinable,
      }));
    }),

  /**
   * Get role permissions for a specific role
   * Requires: Role read permission
   */
  getRolePermissions: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .input(z.object({
      roleId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No organization context',
        });
      }

      // Verify role belongs to organization
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

      // Get all permissions for this role
      const permissions = await db
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, input.roleId));

      // Group by subject
      const grouped: Record<string, {
        actions: string[];
        preset: ConditionPresetKey | null;
        conditions: Record<string, unknown> | null;
      }> = {};

      for (const perm of permissions) {
        if (!grouped[perm.subject]) {
          grouped[perm.subject] = {
            actions: [],
            preset: null,
            conditions: null,
          };
        }

        const group = grouped[perm.subject];
        group.actions.push(perm.action);

        // Extract preset from conditions if available
        if (perm.conditions) {
          group.conditions = perm.conditions as Record<string, unknown>;
          // Try to detect preset from conditions
          group.preset = detectPresetFromConditions(perm.conditions as Record<string, unknown>);
        }
      }

      return grouped;
    }),

  /**
   * Save permissions for a role
   * Requires: Role update permission
   */
  savePermissions: protectedProcedure
    .meta({ permission: { action: Actions.update, subject: Subjects.Role } })
    .input(savePermissionsInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No organization context',
        });
      }

      const { roleId, permissions } = input;

      // Verify role belongs to organization
      const [role] = await db
        .select()
        .from(roles)
        .where(and(
          eq(roles.id, roleId),
          eq(roles.organizationId, ctx.organizationId)
        ));

      if (!role) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Role not found',
        });
      }

      if (role.isSystem && role.slug === 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot modify owner role permissions',
        });
      }

      // Delete existing permissions for this role
      await db
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId));

      // Build new permission records
      const records: Array<{
        roleId: string;
        action: string;
        subject: string;
        fields: string[] | null;
        conditions: Record<string, unknown> | null;
        inverted: boolean;
      }> = [];

      for (const [subject, config] of Object.entries(permissions)) {
        // Calculate conditions from preset or custom
        let conditions: Record<string, unknown> | null = null;

        if (config.customConditions) {
          conditions = config.customConditions;
        } else if (config.preset && config.preset !== 'none') {
          conditions = combinePresets([config.preset as ConditionPresetKey]);
        }

        // Create a record for each action
        for (const action of config.actions) {
          records.push({
            roleId,
            action,
            subject,
            fields: null,
            conditions,
            inverted: false,
          });
        }
      }

      // Insert new permissions
      if (records.length > 0) {
        await db.insert(rolePermissions).values(records);
      }

      // Invalidate permission cache
      const cache = getPermissionCache();
      if (cache) {
        await cache.invalidateOrganization(ctx.organizationId);
      }

      return { success: true, count: records.length };
    }),

  /**
   * Preview conditions from preset
   * Requires: Role read permission
   */
  previewConditions: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Role } })
    .input(z.object({
      preset: z.enum(['none', 'own', 'team', 'department', 'public', 'draft', 'published', 'assigned', 'not_archived']),
    }))
    .query(async ({ input }) => {
      if (input.preset === 'none') {
        return { conditions: null, json: 'null' };
      }

      const conditions = combinePresets([input.preset as ConditionPresetKey]);
      return {
        conditions,
        json: JSON.stringify(conditions, null, 2),
      };
    }),
});

/**
 * Try to detect which preset was used from conditions
 */
function detectPresetFromConditions(conditions: Record<string, unknown>): ConditionPresetKey | null {
  if (!conditions || Object.keys(conditions).length === 0) {
    return 'none';
  }

  // Check for common patterns
  if ('creatorId' in conditions && conditions.creatorId === '${user.id}') {
    return 'own';
  }
  if ('teamId' in conditions && conditions.teamId === '${user.currentTeamId}') {
    return 'team';
  }
  if ('departmentId' in conditions && conditions.departmentId === '${user.departmentId}') {
    return 'department';
  }
  if ('visibility' in conditions && conditions.visibility === 'public') {
    return 'public';
  }

  // If we can't detect, return null (custom)
  return null;
}
