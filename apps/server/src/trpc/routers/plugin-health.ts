/**
 * Plugin Health Router
 *
 * API endpoints for plugin health monitoring.
 * Per OBSERVABILITY_GOVERNANCE §13:
 * - Health status API for monitoring plugin health
 * - Manual reset capability for suspended plugins
 * - Health metrics for all monitored plugins
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import {
    getHealthMonitor,
    type PluginHealthStatus,
    type PluginHealthState,
} from '../../observability/plugin-health-monitor.js';

/**
 * Plugin Health Router
 *
 * Provides endpoints for monitoring and managing plugin health.
 */
export const pluginHealthRouter = router({
    /**
     * Get health status for a specific plugin
     *
     * GET /trpc/pluginHealth.status
     */
    status: protectedProcedure
        .input(
            z.object({
                pluginId: z.string().min(1),
            })
        )
        .query(async ({ input, ctx }): Promise<PluginHealthStatus> => {
            const { pluginId } = input;

            if (!ctx.tenantId) {
                throw new Error('Tenant context required');
            }

            const monitor = getHealthMonitor();
            return monitor.getStatus(pluginId, ctx.tenantId);
        }),

    /**
     * Get health status for all monitored plugins in the tenant
     *
     * GET /trpc/pluginHealth.list
     */
    list: protectedProcedure.query(async ({ ctx }): Promise<PluginHealthStatus[]> => {
        if (!ctx.tenantId) {
            throw new Error('Tenant context required');
        }

        const monitor = getHealthMonitor();
        return monitor.getMonitoredPlugins(ctx.tenantId);
    }),

    /**
     * Reset health status for a suspended plugin
     *
     * POST /trpc/pluginHealth.reset
     *
     * This manually resets a plugin's health state to 'healthy'.
     * Use with caution - only reset after fixing the underlying issue.
     */
    reset: protectedProcedure
        .input(
            z.object({
                pluginId: z.string().min(1),
                reason: z.string().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const { pluginId, reason } = input;

            if (!ctx.userId || !ctx.tenantId) {
                throw new Error('Authentication required');
            }

            // TODO: Add proper permission check
            // await ctx.permissions.require('plugin:health:manage');

            const monitor = getHealthMonitor();
            const previousStatus = monitor.getStatus(pluginId, ctx.tenantId);

            monitor.resetHealth(pluginId, ctx.tenantId);

            ctx.logger.info('Plugin health reset', {
                pluginId,
                tenantId: ctx.tenantId,
                resetBy: ctx.userId,
                previousState: previousStatus.state,
                reason,
            });

            return {
                success: true,
                previousState: previousStatus.state as PluginHealthState,
                newState: 'healthy' as PluginHealthState,
            };
        }),

    /**
     * Check if a plugin invocation should be allowed
     *
     * GET /trpc/pluginHealth.shouldAllow
     *
     * This is primarily for internal use, but exposed for debugging.
     */
    shouldAllow: protectedProcedure
        .input(
            z.object({
                pluginId: z.string().min(1),
            })
        )
        .query(async ({ input, ctx }) => {
            const { pluginId } = input;

            if (!ctx.tenantId) {
                throw new Error('Tenant context required');
            }

            const monitor = getHealthMonitor();
            const status = monitor.getStatus(pluginId, ctx.tenantId);
            const allowed = monitor.shouldAllow(pluginId, ctx.tenantId);

            return {
                allowed,
                state: status.state,
                errorRate: status.errorRate,
                reason: !allowed
                    ? status.state === 'suspended'
                        ? 'Plugin is suspended due to high error rate'
                        : 'Plugin is degraded, request was rate-limited'
                    : undefined,
            };
        }),

    /**
     * Get health summary for dashboard
     *
     * GET /trpc/pluginHealth.summary
     */
    summary: protectedProcedure.query(async ({ ctx }) => {
        if (!ctx.tenantId) {
            throw new Error('Tenant context required');
        }

        const monitor = getHealthMonitor();
        const plugins = monitor.getMonitoredPlugins(ctx.tenantId);

        const summary = {
            total: plugins.length,
            healthy: 0,
            degraded: 0,
            suspended: 0,
            totalRequests: 0,
            totalErrors: 0,
        };

        for (const plugin of plugins) {
            summary.totalRequests += plugin.totalRequests;
            summary.totalErrors += plugin.errorCount;

            switch (plugin.state) {
                case 'healthy':
                    summary.healthy++;
                    break;
                case 'degraded':
                    summary.degraded++;
                    break;
                case 'suspended':
                    summary.suspended++;
                    break;
            }
        }

        return {
            ...summary,
            overallErrorRate: summary.totalRequests > 0
                ? summary.totalErrors / summary.totalRequests
                : 0,
        };
    }),
});

export type PluginHealthRouter = typeof pluginHealthRouter;
