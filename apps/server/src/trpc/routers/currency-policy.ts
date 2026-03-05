/**
 * Currency Tenant Policy Router
 *
 * Manages the currency tenant configuration policy (core feature, not plugin).
 *
 * Endpoints:
 * 1. Platform-only: get / set (requires manage:Settings + platform org)
 * 2. Tenant-safe: getVisibility (any authenticated user)
 *
 * Data model:
 * - core.currency.policy (global scope): { mode: 'unified' | 'allow_override' | 'require_tenant' }
 * - Currency data lives in `currencies` / `exchange_rates` tables (not Settings)
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc.js';
import type { SettingsService } from '../../settings/settings.service';
import { infraPolicyModeSchema, infraPolicySchema, type InfraPolicy } from './infra-policy.js';
import { refreshPolicyMode } from '../infra-policy-guard';
import { currencies } from '@wordrhyme/db';
import { db } from '../../db';

// ─── Settings key ───

const CURRENCY_POLICY_KEY = 'core.currency.policy';

// ─── DI ───

let settingsService: SettingsService | null = null;

export function setCurrencyPolicySettingsService(svc: SettingsService): void {
  settingsService = svc;
}

function requireSettingsService(): SettingsService {
  if (!settingsService) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'SettingsService not initialized',
    });
  }
  return settingsService;
}

function requirePlatformOrg(organizationId: string | undefined): void {
  if (organizationId !== 'platform') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only platform administrators can manage currency policies',
    });
  }
}

// ─── Helpers ───

async function readPolicy(svc: SettingsService): Promise<InfraPolicy> {
  const raw = await svc.get('global', CURRENCY_POLICY_KEY, {
    defaultValue: null,
  });
  if (!raw) {
    return { mode: 'unified' };
  }
  const parsed = infraPolicySchema.safeParse(raw);
  return parsed.success ? parsed.data : { mode: 'unified' };
}

async function hasTenantCurrencies(organizationId: string): Promise<boolean> {
  const result = await db
    .select({ id: currencies.id })
    .from(currencies)
    .where(eq(currencies.organizationId, organizationId))
    .limit(1);
  return result.length > 0;
}

// ─── Router ───

export const currencyPolicyRouter = router({
  get: protectedProcedure
    .meta({ permission: { action: 'manage', subject: 'Settings' } })
    .query(async ({ ctx }) => {
      requirePlatformOrg(ctx.organizationId);
      const svc = requireSettingsService();
      return readPolicy(svc);
    }),

  set: protectedProcedure
    .meta({ permission: { action: 'manage', subject: 'Settings' } })
    .input(z.object({ mode: infraPolicyModeSchema }))
    .mutation(async ({ input, ctx }) => {
      requirePlatformOrg(ctx.organizationId);
      const svc = requireSettingsService();

      // Write legacy key (backward compat, removed after migration Task 5.1)
      await svc.set('global', CURRENCY_POLICY_KEY, { mode: input.mode }, {
        description: 'Currency tenant policy mode',
      });

      // Write v2 key for infra-policy-guard cache
      await svc.set('global', 'infra.policy.currency', { mode: input.mode }, {
        description: 'Currency tenant policy mode (v2)',
      });

      // Refresh guard in-memory cache
      await refreshPolicyMode('currency');

      return { success: true };
    }),

  getVisibility: protectedProcedure
    .query(async ({ ctx }) => {
      const svc = requireSettingsService();
      const policy = await readPolicy(svc);

      let hasCustomConfig = false;
      if (ctx.organizationId && ctx.organizationId !== 'platform') {
        hasCustomConfig = await hasTenantCurrencies(ctx.organizationId);
      }

      return {
        mode: policy.mode,
        hasCustomConfig,
      };
    }),
});

// ─── Exported Helpers ───

export type CurrencyPolicyMode = 'unified' | 'allow_override' | 'require_tenant';

export async function getCurrencyPolicyMode(): Promise<CurrencyPolicyMode> {
  const svc = requireSettingsService();
  const policy = await readPolicy(svc);
  return policy.mode;
}

export async function resolveEffectiveOrgId(
  organizationId: string,
  mode: CurrencyPolicyMode,
): Promise<{ orgId: string; source: 'platform' | 'tenant' }> {
  if (organizationId === 'platform') {
    return { orgId: 'platform', source: 'platform' };
  }
  switch (mode) {
    case 'unified':
      return { orgId: 'platform', source: 'platform' };
    case 'require_tenant':
      return { orgId: organizationId, source: 'tenant' };
    case 'allow_override': {
      const hasTenant = await hasTenantCurrencies(organizationId);
      return hasTenant
        ? { orgId: organizationId, source: 'tenant' }
        : { orgId: 'platform', source: 'platform' };
    }
  }
}

export { readPolicy as readCurrencyPolicy };
