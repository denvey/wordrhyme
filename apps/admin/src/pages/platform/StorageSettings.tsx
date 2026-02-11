/**
 * Platform Storage Settings
 *
 * Platform admin configures default storage provider and tenant override toggle.
 */
import { Database, HardDrive, Cloud, Check, AlertCircle } from 'lucide-react';
import {
    Badge,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Skeleton,
} from '@wordrhyme/ui';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';

export function StorageSettingsPage() {
    const utils = trpc.useUtils();

    const { data: config, isLoading } = trpc.storage.getPlatformConfig.useQuery();

    const setPlatformDefault = trpc.storage.setPlatformDefault.useMutation({
        onSuccess: () => {
            toast.success('Default provider updated');
            utils.storage.getPlatformConfig.invalidate();
        },
        onError: (err: { message?: string }) => toast.error(err.message || 'Failed'),
    });

    const setAllowOverride = trpc.storage.setAllowTenantOverride.useMutation({
        onSuccess: () => {
            toast.success('Tenant override setting updated');
            utils.storage.getPlatformConfig.invalidate();
        },
        onError: (err: { message?: string }) => toast.error(err.message || 'Failed'),
    });

    if (isLoading || !config) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center gap-3 mb-8">
                <Database className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold">Storage Settings</h1>
            </div>

            <div className="space-y-6">
                {/* Default Provider */}
                <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold">Default Storage Provider</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            All organizations will use this provider by default.
                        </p>
                    </div>
                    <Select
                        value={config.defaultProvider}
                        onValueChange={(v) => setPlatformDefault.mutate({ providerId: v })}
                    >
                        <SelectTrigger className="w-72">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {config.providers.map((p) => (
                                <SelectItem key={p.providerId} value={p.providerId}>
                                    <div className="flex items-center gap-2">
                                        {p.providerId === 'local' ? (
                                            <HardDrive className="h-4 w-4" />
                                        ) : (
                                            <Cloud className="h-4 w-4" />
                                        )}
                                        {p.displayName}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Tenant Override Toggle */}
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Allow Tenant Override</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                When enabled, organization admins can choose a different storage provider.
                            </p>
                        </div>
                        <Switch
                            checked={config.allowTenantOverride}
                            onCheckedChange={(v) => setAllowOverride.mutate({ allow: v })}
                        />
                    </div>
                </div>

                {/* Providers List */}
                <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                    <h2 className="text-lg font-semibold">Registered Providers</h2>
                    <div className="border border-border rounded-lg divide-y divide-border">
                        {config.providers.map((p) => (
                            <div key={p.providerId} className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                        {p.providerId === 'local' ? (
                                            <HardDrive className="h-4 w-4" />
                                        ) : (
                                            <Cloud className="h-4 w-4" />
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{p.displayName}</span>
                                            {config.defaultProvider === p.providerId && (
                                                <Badge variant="outline" className="text-xs">Default</Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {p.pluginId ?? 'Built-in'}
                                        </p>
                                    </div>
                                </div>
                                <Badge
                                    variant={p.status === 'ready' || p.status === 'healthy' ? 'default' : 'destructive'}
                                    className={
                                        p.status === 'ready' || p.status === 'healthy'
                                            ? 'bg-green-500/10 text-green-600 border-green-500/20'
                                            : undefined
                                    }
                                >
                                    {p.status === 'ready' || p.status === 'healthy' ? (
                                        <><Check className="h-3 w-3 mr-1" />{p.status}</>
                                    ) : (
                                        <><AlertCircle className="h-3 w-3 mr-1" />{p.status}</>
                                    )}
                                </Badge>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
