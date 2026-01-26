import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { SettingsService } from '../../settings/settings.service.js';
import {
  getSettingInputSchema,
  setSettingInputSchema,
  deleteSettingInputSchema,
  listSettingsInputSchema,
} from '../../db/schema/zod-schemas.js';
import type { SettingScope } from '../../db/schema/settings.js';
import { PermissionKernel, PermissionDeniedError } from '../../permission/index.js';

/**
 * Get the required permission capability based on scope and action
 */
function getSettingsPermission(scope: SettingScope, action: 'read' | 'write'): string {
  switch (scope) {
    case 'global':
      return `settings:${action}:global`;
    case 'tenant':
      return `settings:${action}:tenant`;
    case 'plugin_global':
      // Plugin settings are managed through PluginContext, not direct API
      return `settings:${action}:global`;
    case 'plugin_tenant':
      return `settings:${action}:tenant`;
    default:
      return `settings:${action}:global`;
  }
}

/**
 * Check settings permission and throw if denied
 */
async function checkSettingsPermission(
  scope: SettingScope,
  action: 'read' | 'write',
  ctx: {
    requestId: string;
    userId: string | undefined;
    organizationId: string | undefined;
    userRole: string | undefined;
    userRoles: string[] | undefined;
    currentTeamId: string | undefined;
  }
): Promise<void> {
  const permission = getSettingsPermission(scope, action);
  const permissionKernel = new PermissionKernel();

  try {
    await permissionKernel.require(permission, undefined, undefined, {
      requestId: ctx.requestId,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      userRole: ctx.userRole,
      userRoles: ctx.userRoles,
      currentTeamId: ctx.currentTeamId,
    });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Permission denied: ${permission}`,
        cause: error,
      });
    }
    throw error;
  }
}

// Helper to remove undefined values from objects
function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

// Singleton instance (will be set by module)
let settingsService: SettingsService;

export function setSettingsService(service: SettingsService) {
  settingsService = service;
}

/**
 * Settings tRPC Router
 *
 * Provides API for managing application settings.
 */
export const settingsRouter = router({
  /**
   * Get a setting value with cascade resolution
   * Requires: settings:read:global or settings:read:tenant based on scope
   */
  get: protectedProcedure
    .input(getSettingInputSchema)
    .query(async ({ input, ctx }) => {
      if (!settingsService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Settings service not initialized',
        });
      }

      // Check permission based on scope
      await checkSettingsPermission(input.scope, 'read', {
        requestId: ctx.requestId,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        userRole: ctx.userRole,
        userRoles: (ctx as { userRoles?: string[] }).userRoles,
        currentTeamId: (ctx as { currentTeamId?: string }).currentTeamId,
      });

      // Use tenant from context if not provided
      const organizationId = input.organizationId ?? ctx.organizationId;

      const value = await settingsService.get(input.scope, input.key, omitUndefined({
        organizationId,
        scopeId: input.scopeId,
        defaultValue: input.defaultValue,
      }));

      return { value };
    }),

  /**
   * Get setting with full metadata
   * Requires: settings:read:global or settings:read:tenant based on scope
   */
  getWithMetadata: protectedProcedure
    .input(getSettingInputSchema)
    .query(async ({ input, ctx }) => {
      if (!settingsService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Settings service not initialized',
        });
      }

      // Check permission based on scope
      await checkSettingsPermission(input.scope, 'read', {
        requestId: ctx.requestId,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        userRole: ctx.userRole,
        userRoles: (ctx as { userRoles?: string[] }).userRoles,
        currentTeamId: (ctx as { currentTeamId?: string }).currentTeamId,
      });

      const organizationId = input.organizationId ?? ctx.organizationId;

      const setting = await settingsService.getWithMetadata(input.scope, input.key, omitUndefined({
        organizationId,
        scopeId: input.scopeId,
      }));

      if (!setting) {
        return null;
      }

      return setting;
    }),

  /**
   * Set a setting value
   * Requires: settings:write:global or settings:write:tenant based on scope
   */
  set: protectedProcedure
    .input(setSettingInputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!settingsService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Settings service not initialized',
        });
      }

      // Check permission based on scope
      await checkSettingsPermission(input.scope, 'write', {
        requestId: ctx.requestId,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        userRole: ctx.userRole,
        userRoles: (ctx as { userRoles?: string[] }).userRoles,
        currentTeamId: (ctx as { currentTeamId?: string }).currentTeamId,
      });

      const organizationId = input.organizationId ?? ctx.organizationId;

      const setting = await settingsService.set(input.scope, input.key, input.value, omitUndefined({
        organizationId,
        scopeId: input.scopeId,
        encrypted: input.encrypted,
        description: input.description,
        valueType: input.valueType,
      }));

      return {
        id: setting.id,
        key: setting.key,
        scope: setting.scope,
      };
    }),

  /**
   * Delete a setting
   * Requires: settings:write:global or settings:write:tenant based on scope
   */
  delete: protectedProcedure
    .input(deleteSettingInputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!settingsService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Settings service not initialized',
        });
      }

      // Check permission based on scope
      await checkSettingsPermission(input.scope, 'write', {
        requestId: ctx.requestId,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        userRole: ctx.userRole,
        userRoles: (ctx as { userRoles?: string[] }).userRoles,
        currentTeamId: (ctx as { currentTeamId?: string }).currentTeamId,
      });

      const organizationId = input.organizationId ?? ctx.organizationId;

      const deleted = await settingsService.delete(input.scope, input.key, omitUndefined({
        organizationId,
        scopeId: input.scopeId,
      }));

      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Setting not found: ${input.key}`,
        });
      }

      return { deleted: true };
    }),

  /**
   * List settings for a scope
   * Requires: settings:read:global or settings:read:tenant based on scope
   */
  list: protectedProcedure
    .input(listSettingsInputSchema)
    .query(async ({ input, ctx }) => {
      if (!settingsService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Settings service not initialized',
        });
      }

      // Check permission based on scope
      await checkSettingsPermission(input.scope, 'read', {
        requestId: ctx.requestId,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        userRole: ctx.userRole,
        userRoles: (ctx as { userRoles?: string[] }).userRoles,
        currentTeamId: (ctx as { currentTeamId?: string }).currentTeamId,
      });

      const organizationId = input.organizationId ?? ctx.organizationId;

      const settings = await settingsService.list(input.scope, omitUndefined({
        organizationId,
        scopeId: input.scopeId,
        keyPrefix: input.keyPrefix,
      }));

      return { settings };
    }),
});

export type SettingsRouter = typeof settingsRouter;
