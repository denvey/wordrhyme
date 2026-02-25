/**
 * Infrastructure Config Resolution & Masking
 *
 * Resolves effective infrastructure config based on policy mode:
 * - unified: platform config only (tenant data ignored)
 * - allow_override: tenant config if exists, otherwise platform config
 * - require_tenant: tenant config only, null if not configured
 *
 * Provides sensitive field masking for tenant visibility.
 */
import type { SettingsService } from '../../settings/settings.service';
import type { InfraPolicyMode } from '../../trpc/routers/infra-policy';

const INFRA_POLICY_KEY = 'infra.policy';
const INFRA_CONFIG_KEY = 'infra.config';

/**
 * Read the infra policy mode for a plugin. Defaults to 'unified'.
 */
export async function readInfraPolicyMode(
  settingsService: SettingsService,
  pluginId: string,
): Promise<InfraPolicyMode> {
  const raw = await settingsService.get('plugin_global', INFRA_POLICY_KEY, {
    scopeId: pluginId,
    defaultValue: null,
  });
  if (raw && typeof raw === 'object' && 'mode' in raw) {
    const mode = (raw as { mode: string }).mode;
    if (mode === 'unified' || mode === 'allow_override' || mode === 'require_tenant') {
      return mode;
    }
  }
  return 'unified';
}

/**
 * Resolve the effective infrastructure config for a plugin + tenant combination.
 *
 * Returns { config, source } where source indicates where the config came from.
 */
export async function resolveInfraConfig(
  settingsService: SettingsService,
  pluginId: string,
  organizationId: string | undefined,
): Promise<{ config: unknown; source: 'platform' | 'tenant' | null }> {
  const mode = await readInfraPolicyMode(settingsService, pluginId);

  switch (mode) {
    case 'unified': {
      const config = await settingsService.get('plugin_global', INFRA_CONFIG_KEY, {
        scopeId: pluginId,
        defaultValue: null,
      });
      return { config, source: config !== null ? 'platform' : null };
    }

    case 'allow_override': {
      if (organizationId) {
        const tenantConfig = await settingsService.get('plugin_tenant', INFRA_CONFIG_KEY, {
          scopeId: pluginId,
          organizationId,
          defaultValue: null,
        });
        if (tenantConfig !== null) {
          return { config: tenantConfig, source: 'tenant' };
        }
      }
      const platformConfig = await settingsService.get('plugin_global', INFRA_CONFIG_KEY, {
        scopeId: pluginId,
        defaultValue: null,
      });
      return { config: platformConfig, source: platformConfig !== null ? 'platform' : null };
    }

    case 'require_tenant': {
      if (organizationId) {
        const tenantConfig = await settingsService.get('plugin_tenant', INFRA_CONFIG_KEY, {
          scopeId: pluginId,
          organizationId,
          defaultValue: null,
        });
        if (tenantConfig !== null) {
          return { config: tenantConfig, source: 'tenant' };
        }
      }
      return { config: null, source: null };
    }
  }
}

/**
 * Mask sensitive fields in a config object.
 *
 * Only top-level fields listed in sensitiveFields are replaced with '********'.
 * Non-sensitive fields pass through unchanged for reference display.
 */
export function maskSensitiveFields(
  config: unknown,
  sensitiveFields: string[],
): unknown {
  if (!config || typeof config !== 'object' || sensitiveFields.length === 0) {
    return config;
  }

  const result = { ...(config as Record<string, unknown>) };
  for (const field of sensitiveFields) {
    if (field in result && result[field] !== null && result[field] !== undefined) {
      result[field] = '********';
    }
  }
  return result;
}

/**
 * Check if a tenant is allowed to perform settings operations
 * on an infrastructure plugin based on the current policy.
 *
 * Returns null if allowed, or an error message if denied.
 */
export async function checkInfraPolicyAccess(
  settingsService: SettingsService,
  pluginId: string,
  organizationId: string | undefined,
  operation: 'get' | 'set' | 'delete' | 'list',
): Promise<string | null> {
  // Platform admins are never restricted
  if (!organizationId || organizationId === 'platform') {
    return null;
  }

  const mode = await readInfraPolicyMode(settingsService, pluginId);

  switch (mode) {
    case 'unified':
      return `Infrastructure plugin "${pluginId}" is in unified mode. Tenant ${operation} operations are not permitted.`;

    case 'allow_override':
      return null; // Allowed

    case 'require_tenant':
      return null; // Allowed (tenant must configure)
  }
}
