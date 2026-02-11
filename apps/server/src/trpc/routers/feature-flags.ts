/**
 * Feature Flags tRPC Router
 *
 * Provides API for managing feature flags.
 */
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, requirePermission } from '../trpc.js';
import { FeatureFlagService } from '../../settings/feature-flag.service.js';
import {
  featureFlagSchema,
  checkFeatureFlagQuery,
  getFeatureFlagQuery,
  updateFeatureFlagMutation,
  deleteFeatureFlagMutation,
  setFlagOverrideMutation,
  removeFlagOverrideMutation,
  listFlagOverridesQuery,
} from '@wordrhyme/db';

// Helper to remove undefined values from objects
function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

// Singleton instance (will be set by module)
let featureFlagService: FeatureFlagService;

export function setFeatureFlagService(service: FeatureFlagService) {
  featureFlagService = service;
}

export const featureFlagsRouter = router({
  /**
   * Check if a feature flag is enabled
   * Requires: feature-flags:read
   */
  check: protectedProcedure
    .input(checkFeatureFlagQuery)
    .use(requirePermission('feature-flags:read'))
    .query(async ({ input, ctx }) => {
      if (!featureFlagService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Feature flag service not initialized',
        });
      }

      const context = omitUndefined({
        organizationId: input.organizationId ?? ctx.organizationId ?? '',
        userId: input.userId ?? ctx.userId ?? '',
        userRole: input.userRole ?? ctx.userRole,
        tenantPlan: input.tenantPlan,
      });

      const result = await featureFlagService.checkWithDetails(input.key, context);

      return result;
    }),

  /**
   * List all feature flags
   * Requires: feature-flags:read
   */
  list: protectedProcedure
    .use(requirePermission('feature-flags:read'))
    .query(async () => {
    if (!featureFlagService) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Feature flag service not initialized',
      });
    }

    const flags = await featureFlagService.list();
    return { flags };
  }),

  /**
   * Get a feature flag by key
   * Requires: feature-flags:read
   */
  get: protectedProcedure
    .input(getFeatureFlagQuery)
    .use(requirePermission('feature-flags:read'))
    .query(async ({ input }) => {
      if (!featureFlagService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Feature flag service not initialized',
        });
      }

      const flag = await featureFlagService.getByKey(input.key);
      if (!flag) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Feature flag not found: ${input.key}`,
        });
      }

      return flag;
    }),

  /**
   * Create a new feature flag
   * 直接用 featureFlagSchema (base schema)
   * Requires: feature-flags:manage
   */
  create: protectedProcedure
    .input(featureFlagSchema)
    .use(requirePermission('feature-flags:manage'))
    .mutation(async ({ input }) => {
      if (!featureFlagService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Feature flag service not initialized',
        });
      }

      const flag = await featureFlagService.create(omitUndefined({
        key: input.key,
        name: input.name,
        description: input.description,
        enabled: input.enabled,
        rolloutPercentage: input.rolloutPercentage,
        conditions: input.conditions,
      }));
      return flag;
    }),

  /**
   * Update a feature flag
   * Requires: feature-flags:manage
   */
  update: protectedProcedure
    .input(updateFeatureFlagMutation)
    .use(requirePermission('feature-flags:manage'))
    .mutation(async ({ input }) => {
      if (!featureFlagService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Feature flag service not initialized',
        });
      }

      const { id, ...data } = input;
      const flag = await featureFlagService.update(id, omitUndefined(data));

      if (!flag) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Feature flag not found: ${id}`,
        });
      }

      return flag;
    }),

  /**
   * Delete a feature flag
   * Requires: feature-flags:manage
   */
  delete: protectedProcedure
    .input(deleteFeatureFlagMutation)
    .use(requirePermission('feature-flags:manage'))
    .mutation(async ({ input }) => {
      if (!featureFlagService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Feature flag service not initialized',
        });
      }

      const deleted = await featureFlagService.delete(input.id);

      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Feature flag not found: ${input.id}`,
        });
      }

      return { deleted: true };
    }),

  /**
   * Set tenant override for a flag
   * Requires: feature-flags:override:tenant
   */
  setOverride: protectedProcedure
    .input(setFlagOverrideMutation)
    .use(requirePermission('feature-flags:override:tenant'))
    .mutation(async ({ input }) => {
      if (!featureFlagService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Feature flag service not initialized',
        });
      }

      try {
        const override = await featureFlagService.setOverride(
          input.flagKey,
          input.organizationId,
          omitUndefined({
            enabled: input.enabled,
            rolloutPercentage: input.rolloutPercentage,
            conditions: input.conditions,
          })
        );
        return override;
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Remove tenant override for a flag
   * Requires: feature-flags:override:tenant
   */
  removeOverride: protectedProcedure
    .input(removeFlagOverrideMutation)
    .use(requirePermission('feature-flags:override:tenant'))
    .mutation(async ({ input }) => {
      if (!featureFlagService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Feature flag service not initialized',
        });
      }

      const removed = await featureFlagService.removeOverride(
        input.flagKey,
        input.organizationId
      );

      if (!removed) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Override not found for flag: ${input.flagKey}`,
        });
      }

      return { removed: true };
    }),

  /**
   * List all overrides for a tenant
   * Requires: feature-flags:read
   */
  listOverrides: protectedProcedure
    .input(listFlagOverridesQuery)
    .use(requirePermission('feature-flags:read'))
    .query(async ({ input }) => {
      if (!featureFlagService) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Feature flag service not initialized',
        });
      }

      const overrides = await featureFlagService.listOverrides(input.organizationId);
      return { overrides };
    }),
});

export type FeatureFlagsRouter = typeof featureFlagsRouter;
