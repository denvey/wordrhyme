import { router } from './trpc';
import { pluginRouter } from './routers/plugin';
import { menuRouter } from './routers/menu';

/**
 * Core Router (static routes)
 */
const coreRouter = router({
    plugin: pluginRouter,
    menu: menuRouter,
});

/**
 * Plugin Routers (dynamically merged)
 * Key: pluginId (e.g., "hello-world")
 * Value: plugin's tRPC router
 */
const pluginRouters = new Map<string, any>();

/**
 * Bidirectional mapping: normalizedId <-> original pluginId
 */
const normalizedToPluginId = new Map<string, string>();

/**
 * Current App Router (rebuilt when plugins change)
 */
let _appRouter: any = coreRouter;

/**
 * Get current app router
 */
export function getAppRouter() {
    return _appRouter;
}

/**
 * Register plugin router
 *
 * Called by PluginManager when loading a plugin.
 * Plugin routes will be available at: /trpc/pluginApis.{pluginId}.{procedure}
 * Example: /trpc/pluginApis.hello-world.sayHello
 * 
 * Note: We use pluginApis instead of plugin to avoid conflicts with plugin.list etc.
 */
export function registerPluginRouter(pluginId: string, pluginRouterInstance: any) {
    // Normalize pluginId: "com.wordrhyme.hello-world" -> "hello-world"
    const normalizedId = pluginId.replace(/^com\.wordrhyme\./, '').replace(/\./g, '-');
    pluginRouters.set(normalizedId, pluginRouterInstance);
    normalizedToPluginId.set(normalizedId, pluginId);
    _appRouter = rebuildAppRouter();
    console.log(`[tRPC] Plugin router registered: ${normalizedId} (original: ${pluginId})`);
    console.log(`[tRPC] Available plugin routes: ${Array.from(pluginRouters.keys()).join(', ')}`);
}

/**
 * Unregister plugin router
 *
 * Called by PluginManager when unloading a plugin.
 */
export function unregisterPluginRouter(pluginId: string) {
    const normalizedId = pluginId.replace(/^com\.wordrhyme\./, '').replace(/\./g, '-');
    pluginRouters.delete(normalizedId);
    normalizedToPluginId.delete(normalizedId);
    _appRouter = rebuildAppRouter();
    console.log(`[tRPC] Plugin router unregistered: ${normalizedId}`);
}

/**
 * Resolve normalizedId back to original pluginId
 * Used by context.ts to map tRPC path segments to real plugin IDs
 */
export function resolvePluginId(normalizedId: string): string | undefined {
    return normalizedToPluginId.get(normalizedId);
}

/**
 * Rebuild app router by merging core + all plugins
 *
 * Structure:
 * - /trpc/plugin.list (core plugin management routes)
 * - /trpc/pluginApis.hello-world.sayHello (plugin-specific routes)
 * 
 * MVP: Put all plugin routers under 'pluginApis' namespace to avoid conflicts
 */
function rebuildAppRouter() {
    // If no plugins, just return core router
    if (pluginRouters.size === 0) {
        return coreRouter;
    }

    // Build plugin routes object
    const pluginApiRoutes: Record<string, any> = {};
    for (const [pluginId, pluginRouterInstance] of pluginRouters) {
        pluginApiRoutes[pluginId] = pluginRouterInstance;
    }

    // Create pluginApis router with all plugin routers
    const pluginApisRouter = router(pluginApiRoutes);

    return router({
        plugin: pluginRouter,
        menu: menuRouter,
        // All plugin-specific APIs under pluginApis namespace
        pluginApis: pluginApisRouter,
    });
}

/**
 * Export type for client
 * Using coreRouter type directly for stable type inference
 */
export type AppRouter = typeof coreRouter;
