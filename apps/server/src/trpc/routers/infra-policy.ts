/**
 * Infrastructure Plugin Policy Router
 *
 * Manages per-plugin tenant configuration policies for infrastructure plugins.
 *
 * Two tiers of endpoints:
 * 1. Platform-only: Full policy CRUD (requires manage:Settings + platform org)
 * 2. Tenant-safe: Minimal visibility queries (any authenticated user)
 *
 * Data model:
 * - infra.policy (plugin_global scope): { mode: 'unified' | 'allow_override' | 'require_tenant' }
 * - infra.config (plugin_global scope): Platform default config
 * - infra.config (plugin_tenant scope): Tenant override config
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import type { SettingsService } from '../../settings/settings.service';
import type { PluginManifest } from '@wordrhyme/plugin';

// ─── Schema ───

export const infraPolicyModeSchema = z.enum([
  'unified',
  'allow_override',
  'require_tenant',
]);

export type InfraPolicyMode = z.infer<typeof infraPolicyModeSchema>;

export const infraPolicySchema = z.object({
  mode: infraPolicyModeSchema,
});

export type InfraPolicy = z.infer<typeof infraPolicySchema>;

// ─── Settings keys ───

const INFRA_POLICY_KEY = 'infra.policy';
const INFRA_CONFIG_KEY = 'infra.config';

// ─── DI ───

let settingsService: SettingsService | null = null;
let getPluginManifest: ((pluginId: string) => PluginManifest | undefined) | null = null;

export function setInfraPolicyServices(
  settings: SettingsService,
  manifestResolver: (pluginId: string) => PluginManifest | undefined,
): void {
  settingsService = settings;
  getPluginManifest = manifestResolver;
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
      message: 'Only platform administrators can manage infrastructure policies',
    });
  }
}

function validateInfraPlugin(pluginId: string): void {
  if (!getPluginManifest) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Plugin manifest resolver not initialized',
    });
  }
  const manifest = getPluginManifest(pluginId);
  if (!manifest?.infrastructure?.tenantOverride) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Plugin "${pluginId}" is not an infrastructure plugin or does not support tenant override`,
    });
  }
}

// ─── Helpers ───

async function readPolicy(svc: SettingsService, pluginId: string): Promise<InfraPolicy> {
  const raw = await svc.get('plugin_global', INFRA_POLICY_KEY, {
    scopeId: pluginId,
    defaultValue: null,
  });
  if (!raw) {
    return { mode: 'unified' };
  }
  const parsed = infraPolicySchema.safeParse(raw);
  return parsed.success ? parsed.data : { mode: 'unified' };
}

async function hasTenantConfig(
  svc: SettingsService,
  pluginId: string,
  organizationId: string,
): Promise<boolean> {
  const value = await svc.get('plugin_tenant', INFRA_CONFIG_KEY, {
    scopeId: pluginId,
    organizationId,
    defaultValue: null,
  });
  return value !== null;
}

// ─── Router ───

export const infraPolicyRouter = router({
  /**
   * Get full policy for an infrastructure plugin (platform admin only)
   */
  get: protectedProcedure
    .meta({ permission: { action: 'manage', subject: 'Settings' } })
    .input(z.object({ pluginId: z.string() }))
    .query(async ({ input, ctx }) => {
      requirePlatformOrg(ctx.organizationId);
      validateInfraPlugin(input.pluginId);
      const svc = requireSettingsService();
      return readPolicy(svc, input.pluginId);
    }),

  /**
   * Set policy for an infrastructure plugin (platform admin only)
   */
  set: protectedProcedure
    .meta({ permission: { action: 'manage', subject: 'Settings' } })
    .input(z.object({
      pluginId: z.string(),
      policy: infraPolicySchema,
    }))
    .mutation(async ({ input, ctx }) => {
      requirePlatformOrg(ctx.organizationId);
      validateInfraPlugin(input.pluginId);
      const svc = requireSettingsService();

      await svc.set('plugin_global', INFRA_POLICY_KEY, input.policy, {
        scopeId: input.pluginId,
        description: `Infrastructure tenant policy for ${input.pluginId}`,
      });

      return { success: true };
    }),

  /**
   * Get visibility info for a single plugin (any authenticated user)
   *
   * Returns minimal derived state — no internal policy details exposed.
   */
  getVisibility: protectedProcedure
    .input(z.object({ pluginId: z.string() }))
    .query(async ({ input, ctx }) => {
      const svc = requireSettingsService();
      const policy = await readPolicy(svc, input.pluginId);

      let hasCustom = false;
      if (ctx.organizationId && ctx.organizationId !== 'platform') {
        hasCustom = await hasTenantConfig(svc, input.pluginId, ctx.organizationId);
      }

      return {
        pluginId: input.pluginId,
        mode: policy.mode,
        hasCustomConfig: hasCustom,
      };
    }),

  /**
   * Batch get visibility for multiple plugins (any authenticated user)
   *
   * Avoids N+1 requests from the Settings page.
   */
  batchGetVisibility: protectedProcedure
    .input(z.object({ pluginIds: z.array(z.string()).min(1).max(50) }))
    .query(async ({ input, ctx }) => {
      const svc = requireSettingsService();

      const results = await Promise.all(
        input.pluginIds.map(async (pluginId) => {
          // Skip non-infrastructure plugins
          const manifest = getPluginManifest?.(pluginId);
          if (!manifest?.infrastructure?.tenantOverride) {
            return { pluginId, mode: null as null, hasCustomConfig: false };
          }

          const policy = await readPolicy(svc, pluginId);

          let hasCustom = false;
          if (ctx.organizationId && ctx.organizationId !== 'platform') {
            hasCustom = await hasTenantConfig(svc, pluginId, ctx.organizationId);
          }

          return {
            pluginId,
            mode: policy.mode as InfraPolicyMode | null,
            hasCustomConfig: hasCustom,
          };
        }),
      );

      return results;
    }),
});

export type InfraPolicyRouter = typeof infraPolicyRouter;
