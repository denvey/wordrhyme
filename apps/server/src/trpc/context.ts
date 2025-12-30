import { inferAsyncReturnType } from '@trpc/server';
import { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { getContext, createDefaultContext } from '../context/async-local-storage.js';
import { createCapabilitiesForPlugin } from '../plugins/capabilities';

/**
 * Mock permissions for MVP - allows all permissions
 */
const mockPermissions = {
    can: async (_capability: string) => true,
    require: async (_capability: string) => { },
    hasDeclared: (_capability: string) => true,
};

/**
 * Create logger for plugin context
 */
function createPluginLogger(pluginId: string) {
    return {
        info: (msg: string, meta?: Record<string, unknown>) => console.log(`[${pluginId}]`, msg, meta ?? ''),
        warn: (msg: string, meta?: Record<string, unknown>) => console.warn(`[${pluginId}]`, msg, meta ?? ''),
        error: (msg: string, meta?: Record<string, unknown>) => console.error(`[${pluginId}]`, msg, meta ?? ''),
        debug: (msg: string, meta?: Record<string, unknown>) => console.debug(`[${pluginId}]`, msg, meta ?? ''),
    };
}

/**
 * Extract pluginId from tRPC request path
 * 
 * Path format: /trpc/pluginApis.{pluginId}.{procedure}
 * Example: /trpc/pluginApis.hello-world.sayHello -> hello-world -> com.wordrhyme.hello-world
 */
function extractPluginIdFromPath(url: string): string | undefined {
    const match = url.match(/\/trpc\/pluginApis\.([^.]+)\./);
    if (match && match[1]) {
        const shortId = match[1];
        // Convert short ID back to full plugin ID
        // hello-world -> com.wordrhyme.hello-world
        return `com.wordrhyme.${shortId}`;
    }
    return undefined;
}

/**
 * Create tRPC context from Fastify request
 *
 * Context is available in all tRPC procedures.
 */
export async function createContext({ req, res }: CreateFastifyContextOptions) {
    // Extract pluginId from request URL for plugin API calls
    const pluginId = extractPluginIdFromPath(req.url);

    // Get context from AsyncLocalStorage (set by middleware)
    try {
        const ctx = getContext();

        // If this is a plugin API call, create full plugin context with db capability
        if (pluginId) {
            // Create a minimal manifest for capability creation
            const minimalManifest = {
                pluginId,
                version: '1.0.0',
                name: pluginId,
                vendor: 'WordRhyme',
                type: 'full' as const,
                runtime: 'node' as const,
                engines: { wordrhyme: '^0.1.0' },
                permissions: { definitions: [] },
                capabilities: { data: { read: true, write: true } },
            };

            // Build request context, only including defined values
            const requestContext: { tenantId?: string; userId?: string } = {};
            if (ctx.tenantId) requestContext.tenantId = ctx.tenantId;
            if (ctx.userId) requestContext.userId = ctx.userId;

            const pluginCapabilities = createCapabilitiesForPlugin(
                pluginId,
                minimalManifest,
                requestContext
            );

            return {
                req,
                res,
                ...ctx,
                pluginId,
                permissions: pluginCapabilities.permissions,
                logger: pluginCapabilities.logger,
                db: pluginCapabilities.db,
            };
        }

        return {
            req,
            res,
            ...ctx,
            // Add permissions for plugin procedures (MVP: allow all)
            permissions: mockPermissions,
            // Add logger factory
            logger: createPluginLogger('core'),
            // No pluginId for core routes
            pluginId: undefined,
        };
    } catch {
        // Fallback for requests without context (e.g., health checks)
        return {
            req,
            res,
            ...createDefaultContext(),
            permissions: mockPermissions,
            logger: createPluginLogger('core'),
            pluginId: undefined,
        };
    }
}

export type Context = inferAsyncReturnType<typeof createContext>;

