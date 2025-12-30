import type { PluginManifest } from './manifest';
import type { PluginContext } from './types';

/**
 * Plugin Definition - Type-safe plugin configuration
 */
export interface PluginDefinition {
    /** Plugin manifest (required fields only) */
    manifest: Pick<PluginManifest, 'pluginId' | 'version' | 'name' | 'vendor' | 'engines'> & Partial<PluginManifest>;

    /** Server-side exports */
    server?: {
        /** tRPC router (optional) */
        router?: unknown;

        /** Lifecycle hooks */
        onInstall?: (ctx: PluginContext) => Promise<void>;
        onEnable?: (ctx: PluginContext) => Promise<void>;
        onDisable?: (ctx: PluginContext) => Promise<void>;
        onUninstall?: (ctx: PluginContext) => Promise<void>;
    };
}

/**
 * Define a plugin with type safety
 *
 * @example
 * ```ts
 * import { definePlugin } from '@wordrhyme/plugin';
 *
 * export default definePlugin({
 *   manifest: {
 *     pluginId: 'com.example.hello',
 *     version: '1.0.0',
 *     name: 'Hello World',
 *     vendor: 'Example Inc',
 *     engines: { wordrhyme: '^0.1.0' },
 *   },
 *   server: {
 *     router: myRouter,
 *     onEnable: async (ctx) => {
 *       ctx.logger.info('Plugin enabled!');
 *     },
 *   },
 * });
 * ```
 */
export function definePlugin(definition: PluginDefinition): PluginDefinition {
    return definition;
}
