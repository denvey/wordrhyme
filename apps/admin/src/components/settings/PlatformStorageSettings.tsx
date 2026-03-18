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

export function PlatformStorageSettings() {
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



    </div>
  );
}
