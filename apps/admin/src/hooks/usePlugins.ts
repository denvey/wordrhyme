import { trpc } from '../lib/trpc';
import { toast } from 'sonner';

interface Plugin {
    id: string;
    name: string;
    version: string;
    runtimeStatus: 'enabled' | 'disabled' | 'invalid' | 'crashed';
    instanceStatus: 'not_installed' | 'installed' | 'loaded' | 'failed';
    installationStatus: 'installed' | 'uninstalled' | 'suspended';
    activationStatus: 'enabled' | 'disabled';
    tenantStatus: 'uninstalled' | 'enabled' | 'disabled';
    effectiveStatus: 'enabled' | 'disabled' | 'unavailable';
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
        runtimeStatus: p.runtimeStatus,
        instanceStatus: p.instanceStatus,
        installationStatus: p.installationStatus,
        activationStatus: p.activationStatus,
        tenantStatus: p.tenantStatus,
        effectiveStatus: p.effectiveStatus,
        description: p.manifest.description,
    }));

    return { plugins, isLoading, error: error ?? null };
}

/**
 * Hook for plugin operations
 */
export function useTenantPluginActions() {
    const utils = trpc.useUtils();
    const invalidateMenus = async () => {
        await Promise.all([
            utils.menu.list.invalidate({ target: 'admin' }),
            utils.menu.list.invalidate({ target: 'web' }),
        ]);
    };
    const installMutation = trpc.plugin.installForTenant.useMutation({
        onSuccess: async (_, variables) => {
            await utils.plugin.list.invalidate();
            await invalidateMenus();
            toast.success(`当前组织已安装插件: ${variables.pluginId}`);
        },
        onError: (error, variables) => {
            toast.error(`当前组织安装失败: ${variables.pluginId} - ${error.message}`);
        },
    });
    const uninstallMutation = trpc.plugin.uninstallForTenant.useMutation({
        onSuccess: async (_, variables) => {
            await utils.plugin.list.invalidate();
            await invalidateMenus();
            toast.success(`当前组织已卸载插件: ${variables.pluginId}`);
        },
        onError: (error, variables) => {
            toast.error(`当前组织卸载失败: ${variables.pluginId} - ${error.message}`);
        },
    });
    const enableMutation = trpc.plugin.enableForTenant.useMutation({
        onSuccess: async (_, variables) => {
            await utils.plugin.list.invalidate();
            await invalidateMenus();
            toast.success(`当前组织已启用插件: ${variables.pluginId}`);
        },
        onError: (error, variables) => {
            toast.error(`当前组织启用失败: ${variables.pluginId} - ${error.message}`);
        },
    });
    const disableMutation = trpc.plugin.disableForTenant.useMutation({
        onSuccess: async (_, variables) => {
            await utils.plugin.list.invalidate();
            await invalidateMenus();
            toast.success(`当前组织已停用插件: ${variables.pluginId}`);
        },
        onError: (error, variables) => {
            toast.error(`当前组织停用失败: ${variables.pluginId} - ${error.message}`);
        },
    });

    const installPluginForTenant = (pluginId: string) => installMutation.mutate({ pluginId });
    const uninstallPluginForTenant = (pluginId: string) => uninstallMutation.mutate({ pluginId });
    const enablePluginForTenant = (pluginId: string) => enableMutation.mutate({ pluginId });
    const disablePluginForTenant = (pluginId: string) => disableMutation.mutate({ pluginId });

    return {
        installPluginForTenant,
        uninstallPluginForTenant,
        enablePluginForTenant,
        disablePluginForTenant,
        pendingPluginId: installMutation.variables?.pluginId
            ?? uninstallMutation.variables?.pluginId
            ?? enableMutation.variables?.pluginId
            ?? disableMutation.variables?.pluginId
            ?? null,
        isLoading: installMutation.isPending
            || uninstallMutation.isPending
            || enableMutation.isPending
            || disableMutation.isPending,
    };
}

export function useInstancePluginActions() {
    const utils = trpc.useUtils();
    const enableMutation = trpc.plugin.enableInInstance.useMutation({
        onSuccess: async (_, variables) => {
            await utils.plugin.list.invalidate();
            toast.success(`当前实例已启用插件: ${variables.pluginId}`);
        },
        onError: (error, variables) => {
            toast.error(`当前实例启用失败: ${variables.pluginId} - ${error.message}`);
        },
    });
    const disableMutation = trpc.plugin.disableInInstance.useMutation({
        onSuccess: async (_, variables) => {
            await utils.plugin.list.invalidate();
            toast.success(`当前实例已停用插件: ${variables.pluginId}`);
        },
        onError: (error, variables) => {
            toast.error(`当前实例停用失败: ${variables.pluginId} - ${error.message}`);
        },
    });

    const enablePluginInInstance = (pluginId: string) => enableMutation.mutate({ pluginId });
    const disablePluginInInstance = (pluginId: string) => disableMutation.mutate({ pluginId });

    return {
        enablePluginInInstance,
        disablePluginInInstance,
        pendingPluginId: enableMutation.variables?.pluginId ?? disableMutation.variables?.pluginId ?? null,
        isLoading: enableMutation.isPending || disableMutation.isPending,
    };
}

export const usePluginActions = useTenantPluginActions;
