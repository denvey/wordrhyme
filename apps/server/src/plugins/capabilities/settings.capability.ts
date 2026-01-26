/**
 * Plugin Settings Capability
 *
 * Provides settings access for plugins, automatically scoped to:
 * - plugin_global: Plugin-wide settings
 * - plugin_tenant: Per-tenant plugin settings
 *
 * Plugins cannot access Core settings or other plugins' settings.
 */
import type {
  PluginSettingsCapability,
  PluginSettingOptions,
  PluginSettingEntry,
} from '@wordrhyme/plugin';
import { SettingsService } from '../../settings/settings.service.js';
import { FeatureFlagService } from '../../settings/feature-flag.service.js';

/**
 * Create a settings capability for a plugin
 *
 * @param pluginId - Plugin ID
 * @param organizationId - Current tenant ID (for tenant-scoped settings)
 * @param settingsService - Settings service instance
 * @param featureFlagService - Feature flag service instance
 */
export function createPluginSettingsCapability(
  pluginId: string,
  organizationId: string | undefined,
  settingsService: SettingsService,
  featureFlagService: FeatureFlagService
): PluginSettingsCapability {
  return {
    async get<T = unknown>(key: string, defaultValue?: T): Promise<T | null> {
      // Resolution order: plugin_tenant → plugin_global → defaultValue
      // SettingsService.get handles this cascade internally for plugin scopes
      const scope = organizationId ? 'plugin_tenant' : 'plugin_global';

      const value = await settingsService.get(scope, key, {
        organizationId,
        scopeId: pluginId,
        defaultValue,
      });

      return value as T | null;
    },

    async set(
      key: string,
      value: unknown,
      options?: PluginSettingOptions
    ): Promise<void> {
      const scope = options?.global ? 'plugin_global' : 'plugin_tenant';

      // For plugin_tenant scope, organizationId is required
      if (scope === 'plugin_tenant' && !organizationId) {
        throw new Error(
          'Cannot set tenant-scoped setting without organizationId in context'
        );
      }

      await settingsService.set(scope, key, value, {
        organizationId: scope === 'plugin_tenant' ? organizationId : undefined,
        scopeId: pluginId,
        encrypted: options?.encrypted,
        description: options?.description,
      });
    },

    async delete(
      key: string,
      options?: { global?: boolean }
    ): Promise<boolean> {
      const scope = options?.global ? 'plugin_global' : 'plugin_tenant';

      if (scope === 'plugin_tenant' && !organizationId) {
        throw new Error(
          'Cannot delete tenant-scoped setting without organizationId in context'
        );
      }

      return settingsService.delete(scope, key, {
        organizationId: scope === 'plugin_tenant' ? organizationId : undefined,
        scopeId: pluginId,
      });
    },

    async list(options?: {
      global?: boolean;
      keyPrefix?: string;
    }): Promise<PluginSettingEntry[]> {
      const scope = options?.global ? 'plugin_global' : 'plugin_tenant';

      if (scope === 'plugin_tenant' && !organizationId) {
        // Return empty array if no tenant context for tenant-scoped list
        return [];
      }

      const settings = await settingsService.list(scope, {
        organizationId: scope === 'plugin_tenant' ? organizationId : undefined,
        scopeId: pluginId,
        keyPrefix: options?.keyPrefix,
      });

      return settings.map((s) => ({
        key: s.key,
        value: s.value,
        scope: s.scope as 'plugin_global' | 'plugin_tenant',
        encrypted: s.encrypted,
        description: s.description ?? undefined,
      }));
    },

    async isFeatureEnabled(flagKey: string): Promise<boolean> {
      if (!organizationId) {
        // No tenant context, use global flag only
        const flag = await featureFlagService.getByKey(flagKey);
        return flag?.enabled ?? false;
      }

      // Check with full context
      return featureFlagService.check(flagKey, {
        organizationId,
        userId: '', // Plugin context may not have userId
      });
    },
  };
}
