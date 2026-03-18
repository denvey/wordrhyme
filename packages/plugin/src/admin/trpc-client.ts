import { createTRPCClient, httpBatchLink } from '@trpc/client';

/**
 * Factory to create a typed tRPC client for a plugin's admin UI.
 * Automatically resolves the plugin's normalized ID to the correct URL prefix.
 *
 * Usage: `const api = createPluginTrpcClient<ShopRouter>('shop')`
 */
export function createPluginTrpcClient<TRouter>(pluginId: string) {
    const normalizedId = pluginId.replace(/^com\.wordrhyme\./, '').replace(/\./g, '-');
    // @ts-expect-error -- generic factory; Router constraint is satisfied by consumer's type argument
    return createTRPCClient<TRouter>({
        links: [
            httpBatchLink({
                url: `/trpc/pluginApis.${normalizedId}`,
            }),
        ],
    });
}
