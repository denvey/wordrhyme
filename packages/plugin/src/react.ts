/**
 * React utilities for plugin admin UIs.
 *
 * At runtime, this module is shared via Module Federation from the admin host.
 * Plugins should configure MF shared with `import: false` for this package.
 */
import React from 'react';

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

// ============================================================
// PluginSlot — runtime-injected from Admin Host
// ============================================================

export interface PluginSlotProps {
    /** Slot name, e.g. 'shop.product.detail.actions' */
    name: string;
    /** Context data passed to extensions rendered in this slot */
    context?: Record<string, unknown>;
    /** Layout mode */
    layout?: 'inline' | 'stack' | 'tabs' | 'grid';
    /** Additional CSS class */
    className?: string;
    /** Fallback when no extensions registered */
    fallback?: React.ReactNode;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _PluginSlotImpl: React.ComponentType<PluginSlotProps> | null = null;

/**
 * Called by the Admin Host at startup to inject the PluginSlot component.
 * Plugin code should NOT call this directly.
 * @internal
 */
export function __setPluginSlot(component: React.ComponentType<PluginSlotProps>) {
    _PluginSlotImpl = component;
}

/**
 * Renders all plugin extensions registered for the given slot.
 *
 * @example
 * ```tsx
 * import { PluginSlot } from '@wordrhyme/plugin/react';
 *
 * function ProductDetailPage({ productId }) {
 *     return (
 *         <div>
 *             <h1>Product Detail</h1>
 *             <PluginSlot
 *                 name="shop.product.detail.actions"
 *                 layout="inline"
 *                 context={{ productId }}
 *             />
 *         </div>
 *     );
 * }
 * ```
 */
export function PluginSlot(props: PluginSlotProps): React.ReactElement | null {
    if (!_PluginSlotImpl) {
        // Silently render nothing if host hasn't injected yet
        return null;
    }
    return React.createElement(_PluginSlotImpl, props);
}

