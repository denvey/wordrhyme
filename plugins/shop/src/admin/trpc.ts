/**
 * tRPC hook entry for Shop plugin.
 *
 * Uses the shared plugin tRPC bridge to access the shop namespace
 * with React Query hooks (useQuery / useMutation).
 */
import { usePluginTrpc } from '@wordrhyme/plugin/react';

/**
 * Access shop plugin tRPC router with React Query hooks.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *     const api = useShopApi();
 *     const { data } = api.products.list.useQuery({ limit: 20, offset: 0 });
 *     const create = api.products.create.useMutation();
 * }
 * ```
 */
export function useShopApi() {
    return usePluginTrpc('shop');
}
