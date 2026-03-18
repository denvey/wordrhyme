import { ArrowUp, PackageCheck, PackagePlus, Power, PowerOff, Puzzle, Trash2 } from 'lucide-react';
import { usePlugins, useTenantPluginActions } from '../hooks/usePlugins';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@wordrhyme/ui';
import { cn } from '../lib/utils';

export function PluginsPage() {
    const { plugins, isLoading, error } = usePlugins();
    const {
        installPluginForTenant,
        uninstallPluginForTenant,
        enablePluginForTenant,
        disablePluginForTenant,
        isLoading: isTenantMutating,
        pendingPluginId: pendingTenantPluginId,
    } = useTenantPluginActions();
    const installedPlugins = plugins.filter((plugin) => plugin.installationStatus === 'installed');
    const enabledPlugins = installedPlugins.filter((plugin) => plugin.activationStatus === 'enabled');
    const upgradablePlugins = 0;

    const getStatusText = (plugin: (typeof plugins)[number]) => {
        if (plugin.effectiveStatus === 'unavailable') {
            return '平台当前不可用';
        }
        if (plugin.installationStatus === 'suspended') {
            return '当前组织已暂停';
        }
        if (plugin.installationStatus === 'uninstalled') {
            return '当前组织未安装';
        }
        if (plugin.activationStatus === 'enabled') {
            return '当前组织已启用';
        }
        if (plugin.activationStatus === 'disabled') {
            return '当前组织已停用';
        }
        return '当前组织可用';
    };

    const getInstanceStatusText = (plugin: (typeof plugins)[number]) => {
        switch (plugin.instanceStatus) {
            case 'loaded':
                return '实例已启用';
            case 'installed':
                return '实例已安装，未启用';
            case 'failed':
                return '实例加载失败';
            case 'not_installed':
                return '实例未安装';
        }
    };

    const renderPluginRow = (plugin: (typeof plugins)[number]) => (
        <div key={plugin.id} className="flex items-center justify-between gap-4 p-4">
            <div className="flex min-w-0 items-center gap-4">
                <div className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    plugin.effectiveStatus === 'enabled'
                        ? 'bg-green-500/10 text-green-600'
                        : plugin.effectiveStatus === 'unavailable'
                            ? 'bg-amber-500/10 text-amber-600'
                            : 'bg-muted text-muted-foreground',
                )}>
                    <Puzzle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="truncate font-medium">{plugin.name}</h3>
                        {plugin.installationStatus === 'installed' ? (
                            <Badge variant="secondary">已安装</Badge>
                        ) : plugin.installationStatus === 'suspended' ? (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">已暂停</Badge>
                        ) : (
                            <Badge variant="outline">未安装</Badge>
                        )}
                        {plugin.effectiveStatus === 'unavailable' && (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">
                                平台不可用
                            </Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        v{plugin.version} • {getStatusText(plugin)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        平台：{getInstanceStatusText(plugin)} · 安装：{plugin.installationStatus} · 启用：{plugin.activationStatus}
                    </p>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                {plugin.installationStatus === 'suspended' ? (
                    <Button size="sm" variant="outline" disabled title="当前组织已暂停该插件">
                        已暂停
                    </Button>
                ) : plugin.installationStatus === 'uninstalled' ? (
                    <Button
                        size="sm"
                        disabled={plugin.effectiveStatus === 'unavailable' || (isTenantMutating && pendingTenantPluginId === plugin.id)}
                        onClick={() => installPluginForTenant(plugin.id)}
                        title={plugin.effectiveStatus === 'unavailable' ? '平台当前不可用，无法安装' : '为当前组织安装'}
                    >
                        <PackagePlus className="mr-2 h-4 w-4" />
                        安装
                    </Button>
                ) : (
                    <>
                        {plugin.activationStatus === 'enabled' ? (
                            <Button
                                size="sm"
                                variant="destructive"
                                disabled={isTenantMutating && pendingTenantPluginId === plugin.id}
                                onClick={() => disablePluginForTenant(plugin.id)}
                                title="为当前组织停用"
                            >
                                <PowerOff className="mr-2 h-4 w-4" />
                                停用
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={plugin.effectiveStatus === 'unavailable' || (isTenantMutating && pendingTenantPluginId === plugin.id)}
                                onClick={() => enablePluginForTenant(plugin.id)}
                                title={plugin.effectiveStatus === 'unavailable' ? '平台当前不可用，无法启用' : '为当前组织启用'}
                            >
                                <Power className="mr-2 h-4 w-4" />
                                启用
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="ghost"
                            disabled={isTenantMutating && pendingTenantPluginId === plugin.id}
                            onClick={() => uninstallPluginForTenant(plugin.id)}
                            title="为当前组织卸载"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            卸载
                        </Button>
                    </>
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Puzzle className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">插件</h1>
                </div>
                <div className="text-sm text-muted-foreground">
                    查看当前组织的插件安装、启用与后续升级状态
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">市场插件</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold">{installedPlugins.length}</div>
                        <p className="text-xs text-muted-foreground">当前组织已建立安装关系的插件数量</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">已启用</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold">{enabledPlugins.length}</div>
                        <p className="text-xs text-muted-foreground">当前组织正在生效中的插件数量</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">可升级</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-semibold">{upgradablePlugins}</div>
                        <p className="text-xs text-muted-foreground">待接入市场版本源后展示真实可升级数量</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="overflow-hidden">
                <CardHeader className="border-b border-border">
                    <div className="flex items-center gap-2">
                        <PackageCheck className="h-4 w-4 text-primary" />
                        <CardTitle className="text-base">插件列表</CardTitle>
                        <Badge variant="secondary">{plugins.length}</Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
                        </div>
                    ) : error ? (
                        <div className="p-10 text-center text-muted-foreground">
                            <Puzzle className="mx-auto mb-4 h-10 w-10 opacity-50" />
                            <p>插件列表暂时不可用。</p>
                            <p className="mt-1 text-sm">{error.message}</p>
                        </div>
                    ) : plugins.length === 0 ? (
                        <div className="p-10 text-center text-muted-foreground">
                            <Puzzle className="mx-auto mb-4 h-10 w-10 opacity-50" />
                            <p>当前还没有插件记录。</p>
                            <p className="mt-1 text-sm">后续接入真正的市场与升级源后，这里会展示更完整的插件资产列表。</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {plugins.map((plugin) => (
                                <div key={plugin.id} className="relative">
                                    {upgradablePlugins > 0 && (
                                        <div className="absolute right-4 top-4">
                                            <Badge variant="outline" className="gap-1 border-blue-500 text-blue-600">
                                                <ArrowUp className="h-3 w-3" />
                                                可升级
                                            </Badge>
                                        </div>
                                    )}
                                    {renderPluginRow(plugin)}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
