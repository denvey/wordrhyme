import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { getPluginManager } from '../../plugins/plugin.module';

/**
 * Custom Zod schemas for non-DB inputs
 */

/** Plugin ID format: vendor.plugin-name (e.g., com.example.analytics) */
export const pluginIdSchema = z.string()
    .min(3, 'Plugin ID must be at least 3 characters')
    .max(128, 'Plugin ID must be at most 128 characters')
    .regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/, 'Plugin ID must be in reverse domain notation (e.g., com.example.plugin)');

/** Input schema for single plugin operations */
export const pluginOperationInput = z.object({
    pluginId: pluginIdSchema,
});

/**
 * Plugin Management Router
 *
 * Returns loaded plugins from PluginManager (in-memory).
 */
export const pluginRouter = router({
    /**
     * List all loaded plugins (from memory, not DB)
     */
    list: publicProcedure.query(async () => {
        const pluginManager = getPluginManager();
        if (!pluginManager) {
            return [];
        }

        // Return plugins with their manifests for client to use
        return pluginManager.getLoadedPlugins().map(p => ({
            pluginId: p.manifest.pluginId,
            status: p.status,
            error: p.error,
            manifest: p.manifest,
        }));
    }),

    /**
     * Get plugin info by ID
     */
    getInfo: publicProcedure
        .input(pluginOperationInput)
        .query(async ({ input }) => {
            const pluginManager = getPluginManager();
            if (!pluginManager) {
                return null;
            }

            const plugin = pluginManager.getPlugin(input.pluginId);
            if (!plugin) {
                return null;
            }

            return {
                pluginId: plugin.manifest.pluginId,
                status: plugin.status,
                error: plugin.error,
                manifest: plugin.manifest,
            };
        }),

    /**
     * Enable a plugin
     */
    enable: publicProcedure
        .input(pluginOperationInput)
        .mutation(async ({ input }) => {
            // TODO: Implement enable via PluginManager
            return { success: true };
        }),

    /**
     * Disable a plugin
     */
    disable: publicProcedure
        .input(pluginOperationInput)
        .mutation(async ({ input }) => {
            // TODO: Implement disable via PluginManager
            return { success: true };
        }),
});
