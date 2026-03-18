/**
 * @wordrhyme/core - Core API Client for Plugins
 *
 * This package provides a type-safe client for plugins to call Core APIs.
 */

import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { PluginContext } from '@wordrhyme/plugin';

/**
 * Create Core API client for plugins
 *
 * Note: Type safety requires the plugin to import AppRouter type from server.
 * This is used in development mode where plugins are monorepo packages.
 *
 * @param ctx - Plugin context (provides pluginId, tenantId, userId)
 * @returns Core API client
 *
 * @example
 * ```ts
 * import { createClient } from '@wordrhyme/core';
 *
 * const api = createClient(ctx);
 * const result = await api.plugin.list.query();
 * ```
 */
export function createClient(ctx: PluginContext) {
    const baseUrl = process.env['WORDRHYME_API_URL'] ?? 'http://localhost:3000/trpc';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createTRPCProxyClient<any>({
        links: [
            httpBatchLink({
                url: baseUrl,
                headers: () => ({
                    'x-plugin-id': ctx.pluginId,
                    'x-tenant-id': ctx.organizationId ?? '',
                    'x-user-id': ctx.userId ?? '',
                }),
            }),
        ],
    });
}

// Re-export for convenience
export type { PluginContext } from '@wordrhyme/plugin';
