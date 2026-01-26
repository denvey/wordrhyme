/**
 * Plugin Debug Router
 *
 * API endpoints for tenant admin controlled plugin debug mode.
 * Per OBSERVABILITY_GOVERNANCE §3.3:
 * - Debug mode can be enabled temporarily by tenant admins
 * - Maximum 24 hours, auto-expires
 * - Requires audit logging
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import {
    enablePluginDebug,
    disablePluginDebug,
    getPluginDebugConfig,
} from '../../observability/plugin-logger.js';
import type { PluginDebugConfig } from '../../observability/types.js';

/**
 * Plugin Debug Router
 *
 * Provides endpoints for managing plugin debug mode.
 */
export const pluginDebugRouter = router({
    /**
     * Enable debug mode for a plugin
     *
     * POST /trpc/pluginDebug.enable
     *
     * Requires: tenant admin permission
     * Duration: Max 24 hours
     */
    enable: protectedProcedure
        .input(
            z.object({
                pluginId: z.string().min(1),
                durationMinutes: z.number().min(1).max(1440).default(60), // Max 24 hours
                reason: z.string().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const { pluginId, durationMinutes, reason } = input;

            // Verify user has admin permission for the tenant
            // In MVP, we allow any authenticated user
            if (!ctx.userId || !ctx.organizationId) {
                throw new Error('Authentication required');
            }

            // TODO: Add proper permission check
            // await ctx.permissions.require('plugin:debug:manage');

            // Calculate expiry time
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + durationMinutes);

            const debugConfig: PluginDebugConfig = {
                pluginId,
                organizationId: ctx.organizationId,
                enabled: true,
                expiresAt,
                enabledBy: ctx.userId,
                reason,
            };

            const config = enablePluginDebug(debugConfig);

            ctx.logger.info('Plugin debug mode enabled', {
                pluginId,
                organizationId: ctx.organizationId,
                enabledBy: ctx.userId,
                durationMinutes,
                expiresAt: config.expiresAt.toISOString(),
                reason,
            });

            return {
                success: true,
                config: {
                    pluginId: config.pluginId,
                    organizationId: config.organizationId,
                    enabled: config.enabled,
                    expiresAt: config.expiresAt.toISOString(),
                    enabledBy: config.enabledBy,
                    reason: config.reason,
                },
            };
        }),

    /**
     * Disable debug mode for a plugin
     *
     * POST /trpc/pluginDebug.disable
     */
    disable: protectedProcedure
        .input(
            z.object({
                pluginId: z.string().min(1),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const { pluginId } = input;

            if (!ctx.userId || !ctx.organizationId) {
                throw new Error('Authentication required');
            }

            const wasEnabled = disablePluginDebug(pluginId, ctx.organizationId);

            ctx.logger.info('Plugin debug mode disabled', {
                pluginId,
                organizationId: ctx.organizationId,
                disabledBy: ctx.userId,
                wasEnabled,
            });

            return {
                success: true,
                wasEnabled,
            };
        }),

    /**
     * Get debug mode status for a plugin
     *
     * GET /trpc/pluginDebug.status
     */
    status: protectedProcedure
        .input(
            z.object({
                pluginId: z.string().min(1),
            })
        )
        .query(async ({ input, ctx }) => {
            const { pluginId } = input;

            if (!ctx.organizationId) {
                throw new Error('Tenant context required');
            }

            const config = getPluginDebugConfig(pluginId, ctx.organizationId);

            if (!config) {
                return {
                    enabled: false,
                    pluginId,
                    organizationId: ctx.organizationId,
                };
            }

            // Check if expired
            const now = new Date();
            const isExpired = config.expiresAt < now;

            return {
                enabled: config.enabled && !isExpired,
                pluginId: config.pluginId,
                organizationId: config.organizationId,
                expiresAt: config.expiresAt.toISOString(),
                enabledBy: config.enabledBy,
                reason: config.reason,
                isExpired,
            };
        }),
});

export type PluginDebugRouter = typeof pluginDebugRouter;
