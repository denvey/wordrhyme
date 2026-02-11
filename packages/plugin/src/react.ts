/**
 * React utilities for plugin admin UIs.
 *
 * At runtime, this module is shared via Module Federation from the admin host.
 * Plugins should configure MF shared with `import: false` for this package.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _trpc: any = null;

/**
 * Called by the Admin Host at startup to inject the host's tRPC React client.
 * Plugin code should NOT call this directly.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function __setTrpc(trpc: any) {
    _trpc = trpc;
}

/**
 * Hook for plugin components to access their tRPC namespace with React Query hooks.
 * Must be called within a component rendered inside the Admin Host.
 *
 * @param pluginId - Short plugin ID (e.g., 'storage-s3') or full ID (e.g., 'com.wordrhyme.storage-s3')
 * @returns tRPC proxy with useQuery/useMutation hooks
 *
 * @example
 * ```tsx
 * import { usePluginTrpc } from '@wordrhyme/plugin/react';
 *
 * function MyPluginPage() {
 *     const api = usePluginTrpc('my-plugin');
 *     const { data, isLoading } = api.listItems.useQuery();
 *     const createItem = api.createItem.useMutation();
 * }
 * ```
 */
export function usePluginTrpc(pluginId: string) {
    if (!_trpc) {
        throw new Error(
            '[plugin/react] tRPC not initialized. ' +
            'Ensure plugin is loaded within Admin Host context.',
        );
    }
    const normalizedId = pluginId.replace(/^com\.wordrhyme\./, '');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (_trpc as any).pluginApis[normalizedId];
}
