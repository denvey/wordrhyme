import { initTRPC } from '@trpc/server';
import type { PluginContext, PluginPermissionCapability, PluginSettingsCapability } from './types';

/**
 * tRPC builders for plugins
 *
 * Plugins use these to define their API routes, just like a normal tRPC project.
 */
const t = initTRPC.context<PluginContext>().create();

type PluginProcedureMiddleware = (opts: any) => Promise<any>;

const pluginProcedureBase = t.procedure.use(async (opts) => {
    const pluginProcedureMiddlewares = ((opts.ctx as Record<string, unknown> | undefined)?.['__pluginProcedureMiddlewares'] ??
        []) as PluginProcedureMiddleware[];

    const run = (index: number, accumulatedOverrides: Record<string, unknown>) => {
        if (index >= pluginProcedureMiddlewares.length) {
            return opts.next(accumulatedOverrides as any);
        }

        const middleware = pluginProcedureMiddlewares[index]!;
        return middleware({
            ...opts,
            ...accumulatedOverrides,
            next: (nextOverrides?: Record<string, unknown>) =>
                run(index + 1, {
                    ...accumulatedOverrides,
                    ...(nextOverrides ?? {}),
                }),
        });
    };

    return run(0, {});
});

/**
 * Plugin router builder
 *
 * @example
 * ```ts
 * import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin';
 *
 * export const router = pluginRouter({
 *   hello: pluginProcedure.query(() => 'Hello from plugin!'),
 * });
 * ```
 */
export const pluginRouter = t.router;

/**
 * Plugin procedure builder (with context)
 *
 * Use this to define procedures that have access to PluginContext.
 */
export const pluginProcedure = pluginProcedureBase;

/**
 * Default no-op permission capability (for standalone plugin development)
 */
const defaultPermissions: PluginPermissionCapability = {
    can: async () => false,
    require: async () => {
        throw new Error('Permission capability not available');
    },
    hasDeclared: () => false,
};

/**
 * Default no-op settings capability (for standalone plugin development)
 */
const defaultSettings: PluginSettingsCapability = {
    get: async () => null,
    set: async () => {
        throw new Error('Settings capability not available');
    },
    delete: async () => {
        throw new Error('Settings capability not available');
    },
    list: async () => [],
    isFeatureEnabled: async () => false,
};

/**
 * Create plugin context (used by Core to inject context)
 *
 * This is called by PluginManager when invoking plugin handlers.
 */
export function createPluginContext(partial: Partial<PluginContext> & { pluginId: string }): PluginContext {
    return {
        pluginId: partial.pluginId,
        organizationId: partial.organizationId,
        userId: partial.userId,
        logger: partial.logger ?? {
            info: (msg, meta) => console.log(`[${partial.pluginId}]`, msg, meta),
            warn: (msg, meta) => console.warn(`[${partial.pluginId}]`, msg, meta),
            error: (msg, meta) => console.error(`[${partial.pluginId}]`, msg, meta),
            debug: (msg, meta) => console.debug(`[${partial.pluginId}]`, msg, meta),
        },
        permissions: partial.permissions ?? defaultPermissions,
        db: partial.db,
        settings: partial.settings ?? defaultSettings,
    };
}

// Re-export tRPC types for convenience
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
