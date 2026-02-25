/**
 * useInfraPolicy Hook
 *
 * Encapsulates infrastructure plugin policy querying and state management.
 * Provides both single-plugin and batch visibility queries.
 */
import { trpc } from '../lib/trpc';
import { useActiveOrganization } from '../lib/auth-client';

export type InfraPolicyMode = 'unified' | 'allow_override' | 'require_tenant';

export interface InfraVisibility {
  pluginId: string;
  mode: InfraPolicyMode;
  hasCustomConfig: boolean;
}

/**
 * Query visibility for a single infrastructure plugin.
 */
export function useInfraVisibility(pluginId: string | undefined) {
  return trpc.infraPolicy.getVisibility.useQuery(
    { pluginId: pluginId! },
    { enabled: !!pluginId },
  );
}

/**
 * Batch query visibility for multiple infrastructure plugins.
 * Used by the Settings page to filter tabs efficiently.
 */
export function useBatchInfraVisibility(pluginIds: string[]) {
  return trpc.infraPolicy.batchGetVisibility.useQuery(
    { pluginIds },
    { enabled: pluginIds.length > 0 },
  );
}

/**
 * Full policy management for platform admins.
 */
export function useInfraPolicy(pluginId: string | undefined) {
  const { data: activeOrg } = useActiveOrganization();
  const isPlatform = activeOrg?.id === 'platform';
  const utils = trpc.useUtils();

  const policyQuery = trpc.infraPolicy.get.useQuery(
    { pluginId: pluginId! },
    { enabled: !!pluginId && isPlatform },
  );

  const setMutation = trpc.infraPolicy.set.useMutation({
    onSuccess: () => {
      utils.infraPolicy.get.invalidate();
      utils.infraPolicy.getVisibility.invalidate();
      utils.infraPolicy.batchGetVisibility.invalidate();
    },
  });

  const setPolicy = (mode: InfraPolicyMode) => {
    if (!pluginId) return;
    return setMutation.mutateAsync({
      pluginId,
      policy: { mode },
    });
  };

  return {
    policy: policyQuery.data,
    isLoading: policyQuery.isLoading,
    isPlatform,
    setPolicy,
    isSettingPolicy: setMutation.isPending,
  };
}
