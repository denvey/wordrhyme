import { trpc } from '../lib/trpc';

interface Plugin {
    id: string;
    name: string;
    version: string;
    status: 'enabled' | 'disabled' | 'error';
    description?: string;
}

/**
 * Hook for loading plugins from server via tRPC
 */
export function usePlugins() {
    const { data, isLoading, error } = trpc.plugin.list.useQuery();

    const plugins: Plugin[] = (data ?? []).map((p) => ({
        id: p.pluginId,
        name: p.manifest.name ?? p.pluginId,
        version: p.manifest.version ?? '0.0.0',
        status: p.status === 'enabled' ? 'enabled' : (p.status === 'invalid' || p.status === 'crashed') ? 'error' : 'disabled',
        description: p.manifest.description,
    }));

    return { plugins, isLoading, error: error ?? null };
}

/**
 * Hook for plugin operations
 */
export function usePluginActions() {
    const utils = trpc.useUtils();
    const enableMutation = trpc.plugin.enable.useMutation({
        onSuccess: () => utils.plugin.list.invalidate(),
    });
    const disableMutation = trpc.plugin.disable.useMutation({
        onSuccess: () => utils.plugin.list.invalidate(),
    });

    const enablePlugin = (pluginId: string) => enableMutation.mutate({ pluginId });
    const disablePlugin = (pluginId: string) => disableMutation.mutate({ pluginId });

    return {
        enablePlugin,
        disablePlugin,
        isLoading: enableMutation.isPending || disableMutation.isPending,
    };
}
