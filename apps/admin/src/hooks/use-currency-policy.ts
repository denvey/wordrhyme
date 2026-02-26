/**
 * useCurrencyPolicy Hook
 *
 * Currency tenant policy querying and state management.
 * Similar to useInfraPolicy but for core currency feature (no pluginId).
 */
import { trpc } from '../lib/trpc';
import { useActiveOrganization } from '../lib/auth-client';
import type { InfraPolicyMode } from './use-infra-policy';

export interface CurrencyVisibility {
  mode: InfraPolicyMode;
  hasCustomConfig: boolean;
}

/**
 * Query currency policy visibility for the current tenant.
 */
export function useCurrencyVisibility() {
  return trpc.currency.policy.getVisibility.useQuery();
}

/**
 * Full currency policy management for platform admins.
 */
export function useCurrencyPolicy() {
  const { data: activeOrg } = useActiveOrganization();
  const isPlatform = activeOrg?.id === 'platform';
  const utils = trpc.useUtils();

  const policyQuery = trpc.currency.policy.get.useQuery(
    undefined,
    { enabled: isPlatform },
  );

  const setMutation = trpc.currency.policy.set.useMutation({
    onSuccess: () => {
      utils.currency.policy.get.invalidate();
      utils.currency.policy.getVisibility.invalidate();
      utils.currency.currencies.list.invalidate();
      utils.currency.rates.list.invalidate();
    },
  });

  const setPolicy = (mode: InfraPolicyMode) => {
    return setMutation.mutateAsync({ mode });
  };

  return {
    policy: policyQuery.data,
    isLoading: policyQuery.isLoading,
    isPlatform,
    setPolicy,
    isSettingPolicy: setMutation.isPending,
  };
}
