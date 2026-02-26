/**
 * Infrastructure Policy Guard
 *
 * Registry + global middleware guard for infra policy enforcement.
 *
 * Usage:
 * 1. Module init: registerInfraPolicyResolver('currency', { getMode, hasCustomData })
 * 2. Procedure meta: meta({ infraPolicy: { module: 'currency' } })
 * 3. Global middleware auto-enforces mutation guard
 */
import { TRPCError } from '@trpc/server';

export type InfraPolicyMode = 'unified' | 'allow_override' | 'require_tenant';

export interface InfraPolicyResolver {
  /** Read current policy mode from Settings (runtime) */
  getMode: () => Promise<InfraPolicyMode>;
  /** Check if tenant has custom data (for allow_override mode) */
  hasCustomData: (organizationId: string) => Promise<boolean>;
}

// ─── Registry ───

const resolvers = new Map<string, InfraPolicyResolver>();

export function registerInfraPolicyResolver(
  module: string,
  resolver: InfraPolicyResolver,
): void {
  resolvers.set(module, resolver);
}

export function getInfraPolicyResolver(
  module: string,
): InfraPolicyResolver | undefined {
  return resolvers.get(module);
}

// ─── Guard ───

const WRITE_ACTIONS = new Set(['create', 'update', 'delete', 'manage']);

/**
 * Enforce infra policy mutation guard.
 *
 * Called by the global middleware — module developers never call this directly.
 */
export async function enforceInfraPolicy(
  module: string,
  organizationId: string | undefined,
  action: string | undefined,
): Promise<void> {
  // Skip: no org, platform org, or read-only actions
  if (!organizationId || organizationId === 'platform') return;
  if (!action || !WRITE_ACTIONS.has(action)) return;

  const resolver = resolvers.get(module);
  if (!resolver) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Infra policy resolver not registered for module: ${module}`,
    });
  }

  const mode = await resolver.getMode();

  if (mode === 'unified') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Configuration is managed by the platform',
    });
  }

  if (mode === 'allow_override') {
    const hasCustom = await resolver.hasCustomData(organizationId);
    if (!hasCustom) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Switch to custom configuration first',
      });
    }
  }

  // require_tenant → always allowed
}
