/**
 * Infrastructure Policy Guard
 *
 * Registry + global middleware guard for infra policy enforcement.
 *
 * Usage:
 * 1. Module init: registerInfraPolicyResolver('currency', { getMode, hasCustomData })
 * 2. Subject mapping: registerInfraSubjects('currency', ['Currency', 'ExchangeRate'])
 * 3. Global middleware auto-detects module from permission.subject and enforces guard + context swap
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

// ─── Subject → Module Mapping ───

const subjectToModule = new Map<string, string>();

/**
 * Register permission subjects that belong to an infra policy module.
 *
 * When a tRPC procedure has `meta.permission.subject` matching a registered subject,
 * the global middleware automatically applies the infra policy guard and context swap.
 *
 * @example
 * registerInfraSubjects('currency', ['Currency', 'ExchangeRate']);
 */
export function registerInfraSubjects(module: string, subjects: string[]): void {
  for (const subject of subjects) {
    subjectToModule.set(subject, module);
  }
}

/**
 * Look up which infra policy module a permission subject belongs to.
 * Returns undefined if the subject is not registered (no infra policy applies).
 */
export function getModuleForSubject(subject: string): string | undefined {
  return subjectToModule.get(subject);
}

// ─── Guard ───

export const WRITE_ACTIONS = new Set(['create', 'update', 'delete', 'manage']);

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

// ─── Effective Org Resolution ───

/**
 * Resolve the effective organization ID based on infra policy mode.
 *
 * Used by the global middleware to determine which org's data to read:
 * - unified → 'platform' (tenant reads platform data)
 * - require_tenant → organizationId (tenant reads own data)
 * - allow_override + has custom → organizationId (tenant has forked data)
 * - allow_override + no custom → 'platform' (tenant reads platform data)
 */
export async function resolveEffectiveOrg(
  module: string,
  organizationId: string,
): Promise<string> {
  if (organizationId === 'platform') return 'platform';

  const resolver = resolvers.get(module);
  if (!resolver) return organizationId;

  const mode = await resolver.getMode();
  switch (mode) {
    case 'unified': return 'platform';
    case 'require_tenant': return organizationId;
    case 'allow_override': {
      const hasCustom = await resolver.hasCustomData(organizationId);
      return hasCustom ? organizationId : 'platform';
    }
  }
}
