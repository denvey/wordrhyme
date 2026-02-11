/**
 * Storage Settings Tab (Tenant Level)
 *
 * Shows effective provider and allows override when platform permits.
 */
import { HardDrive, Cloud, Check, Info } from 'lucide-react';
import {
    Badge,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Skeleton,
} from '@wordrhyme/ui';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';

export function StorageSettingsTab() {
    const utils = trpc.useUtils();

    const { data: config, isLoading } = trpc.storage.getTenantConfig.useQuery();

    const setTenantProvider = trpc.storage.setTenantProvider.useMutation({
        onSuccess: () => {
            toast.success('Storage provider updated');
            utils.storage.getTenantConfig.invalidate();
            utils.storage.getDefaultProvider.invalidate();
        },
        onError: (err: { message?: string }) => toast.error(err.message || 'Failed'),
    });

    if (isLoading || !config) {
        return (
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-16 w-full" />
            </div>
        );
    }

    const providerLabel = (id: string) =>
        config.providers.find((p) => p.providerId === id)?.displayName ?? id;

    const handleChange = (value: string) => {
        if (value === '__platform__') {
            setTenantProvider.mutate({ providerId: null });
        } else {
            setTenantProvider.mutate({ providerId: value });
        }
    };

    return (
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
            <div>
                <h2 className="text-lg font-semibold">Storage Configuration</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Current storage provider for this organization.
                </p>
            </div>

            {/* Effective provider */}
            <div className="p-4 bg-muted/50 rounded-lg flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    {config.effectiveProvider === 'local' ? (
                        <HardDrive className="h-4 w-4" />
                    ) : (
                        <Cloud className="h-4 w-4" />
                    )}
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-medium">{providerLabel(config.effectiveProvider)}</span>
                        <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                            <Check className="h-3 w-3 mr-1" />Active
                        </Badge>
                        {!config.tenantOverride && (
                            <Badge variant="secondary" className="text-xs">Platform Default</Badge>
                        )}
                    </div>
                </div>
            </div>

            {/* Override section */}
            {config.allowOverride ? (
                <div className="space-y-2">
                    <label className="text-sm font-medium">Override Storage Provider</label>
                    <Select
                        value={config.tenantOverride ?? '__platform__'}
                        onValueChange={handleChange}
                    >
                        <SelectTrigger className="w-72">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__platform__">
                                <div className="flex items-center gap-2">
                                    <HardDrive className="h-4 w-4" />
                                    Use platform default ({providerLabel(config.platformDefault)})
                                </div>
                            </SelectItem>
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
            ) : (
                <div className="text-sm text-muted-foreground bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 flex items-center gap-2">
                    <Info className="h-4 w-4 shrink-0" />
                    Storage provider is managed by the platform administrator.
                </div>
            )}
        </div>
    );
}
