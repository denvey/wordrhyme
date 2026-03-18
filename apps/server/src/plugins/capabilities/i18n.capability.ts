/**
 * i18n Capability
 *
 * Provides internationalization capabilities to plugins:
 * - Translation loading on install
 * - Translation cleanup on uninstall
 * - Runtime translation access
 * - Settings-based feature control (graceful degradation when disabled)
 *
 * @see GLOBALIZATION_GOVERNANCE.md
 * @see design.md D6: Plugin SDK
 */
import { type PluginManifest } from '@wordrhyme/plugin';
import { db } from '../../db';
import { i18nMessages } from '@wordrhyme/db';
import { and, eq, sql } from 'drizzle-orm';
import type { SettingsService } from '../../settings/settings.service';
import type { I18nMessageType, TranslationsObject } from '@wordrhyme/db';

type PluginI18nConfig = {
  namespace?: string;
  messages?: Record<string, Record<string, string>>;
  localesFile?: string;
  onUninstall?: 'delete' | 'archive' | 'retain';
};

/**
 * i18n Capability for plugins
 */
export interface I18nCapability {
  /**
   * Get a translation for the plugin's namespace
   */
  t: (key: string, locale: string, fallbackLocale?: string) => Promise<string | undefined>;

  /**
   * Get all translations for a locale
   */
  getMessages: (locale: string) => Promise<Record<string, string>>;

  /**
   * Check if i18n feature is enabled for the organization
   *
   * @returns true if multi-language support is enabled, false otherwise
   *
   * @remarks
   * Use this to conditionally show translation UI in plugins.
   * The `t()` and `getMessages()` methods gracefully degrade when disabled.
   *
   * @example
   * ```typescript
   * if (await ctx.i18n.isEnabled()) {
   *   // Show translation button in UI
   * }
   * ```
   */
  isEnabled: () => Promise<boolean>;

  /**
   * Get the plugin's namespace
   */
  namespace: string;
}

/**
 * Create i18n capability for a plugin
 *
 * @param pluginId - Plugin identifier
 * @param organizationId - Organization ID for scoping
 * @param manifest - Plugin manifest
 * @param settingsService - Optional settings service (for feature check)
 */
export function createI18nCapability(
  pluginId: string,
  organizationId: string,
  manifest: PluginManifest,
  settingsService?: SettingsService
): I18nCapability {
  // Normalize plugin namespace
  const normalizedPluginId = pluginId.replace(/^com\.wordrhyme\./, '').replace(/\./g, '-');
  const manifestI18n = (manifest as PluginManifest & { i18n?: PluginI18nConfig }).i18n;
  const namespace = manifestI18n?.namespace || `plugin.${normalizedPluginId}`;

  /**
   * Check if i18n feature is enabled for this organization
   * Uses Settings System instead of Feature Flags
   */
  const checkEnabled = async (): Promise<boolean> => {
    if (!organizationId || !settingsService) {
      return false;
    }
    try {
      // Check tenant-level setting with global fallback
      const enabled = await settingsService.get(
        'tenant',
        'features.i18n.enabled',
        { organizationId, defaultValue: false }
      ) as boolean | null;
      return enabled === true;
    } catch (error) {
      console.warn(`[i18n] Failed to check setting:`, error);
      return false; // Fail-safe: assume disabled on error
    }
  };

  return {
    namespace,

    async isEnabled(): Promise<boolean> {
      return checkEnabled();
    },

    async t(key: string, locale: string, fallbackLocale?: string): Promise<string | undefined> {
      // Feature flag check: graceful degradation
      const enabled = await checkEnabled();
      if (!enabled) {
        return undefined; // Return undefined, not throw error
      }
      const fullKey = key.startsWith(`${namespace}.`) ? key : `${namespace}.${key}`;

      // 优化查询: Tenant-specific → Global fallback (单次查询)
      const result = await db
        .select({
          translations: i18nMessages.translations,
          organizationId: i18nMessages.organizationId
        })
        .from(i18nMessages)
        .where(
          and(
            eq(i18nMessages.namespace, namespace),
            eq(i18nMessages.key, fullKey),
            eq(i18nMessages.isEnabled, true)
          )
        )
        .orderBy(
          // NULL organization_id (全局) 排最后
          sql`CASE WHEN ${i18nMessages.organizationId} = ${organizationId} THEN 0 ELSE 1 END`
        )
        .limit(1);

      if (result.length === 0) {
        return undefined;
      }

      const translations = result[0]!.translations as Record<string, string>;

      // Try exact locale
      if (translations[locale]) {
        return translations[locale];
      }

      // Try fallback locale
      if (fallbackLocale && translations[fallbackLocale]) {
        return translations[fallbackLocale];
      }

      // Try language code only
      const langCode = locale.split('-')[0];
      if (langCode) {
        for (const key of Object.keys(translations)) {
          if (key === langCode || key.startsWith(`${langCode}-`)) {
            return translations[key];
          }
        }
      }

      // Return first available
      const firstKey = Object.keys(translations)[0];
      return firstKey ? translations[firstKey] : undefined;
    },

    async getMessages(locale: string): Promise<Record<string, string>> {
      // Feature flag check: graceful degradation
      const enabled = await checkEnabled();
      if (!enabled) {
        return {}; // Return empty object, not throw error
      }

      // 优化查询: 获取 tenant-specific 和 global，使用 DISTINCT ON 去重
      // 租户级覆盖优先，全局默认其次
      const results = await db.execute(sql<{
        key: string;
        translations: Record<string, string>;
        organization_id: string | null;
      }>`
        SELECT DISTINCT ON (key) key, translations, organization_id
        FROM ${i18nMessages}
        WHERE (organization_id = ${organizationId} OR organization_id IS NULL)
          AND namespace = ${namespace}
          AND is_enabled = true
        ORDER BY key,
          CASE WHEN organization_id = ${organizationId} THEN 0 ELSE 1 END
      `);

      const messages: Record<string, string> = {};

      for (const row of results) {
        const typedRow = row as {
          key: string;
          translations: Record<string, string>;
        };
        const translations = typedRow['translations'];
        const value = translations[locale] || translations[locale.split('-')[0] || ''] || Object.values(translations)[0];
        if (value) {
          // Strip namespace prefix for simpler keys
          const key = typedRow['key'];
          const simpleKey = key.startsWith(`${namespace}.`)
            ? key.slice(namespace.length + 1)
            : key;
          messages[simpleKey] = value;
        }
      }

      return messages;
    },
  };
}

/**
 * Install plugin translations
 *
 * Called during plugin installation to load translations into i18n_messages.
 */
export async function installPluginTranslations(
  pluginId: string,
  organizationId: string,
  i18nConfig: PluginI18nConfig,
  pluginDir: string
): Promise<void> {
  if (!i18nConfig) return;

  const normalizedPluginId = pluginId.replace(/^com\.wordrhyme\./, '').replace(/\./g, '-');
  const namespace = i18nConfig.namespace || `plugin.${normalizedPluginId}`;

  // Get messages from inline config or load from files
  let messages = i18nConfig.messages || {};

  // If localesFile is specified, load from files
  if (i18nConfig.localesFile && Object.keys(messages).length === 0) {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const localesDir = path.join(pluginDir, i18nConfig.localesFile);

      // Read all locale files
      const files = await fs.readdir(localesDir);
      const localeData: Record<string, Record<string, string>> = {};

      for (const file of files) {
        if (file.endsWith('.json')) {
          const locale = file.replace('.json', '');
          const content = await fs.readFile(path.join(localesDir, file), 'utf-8');
          localeData[locale] = JSON.parse(content);
        }
      }

      // Convert locale-first to key-first format
      // From: { "en-US": { "greeting": "Hello" } }
      // To: { "greeting": { "en-US": "Hello" } }
      for (const [locale, translations] of Object.entries(localeData)) {
        for (const [key, value] of Object.entries(translations)) {
          if (!messages[key]) {
            messages[key] = {};
          }
          messages[key]![locale] = value;
        }
      }
    } catch (error) {
      console.warn(`[i18n] Failed to load locale files for plugin ${pluginId}:`, error);
    }
  }

  // Insert messages into database
  const now = new Date();
  const inserts = Object.entries(messages).map(([key, translations]) => ({
    organizationId,
    key: `${namespace}.${key}`,
    namespace,
    type: 'api' as I18nMessageType,
    translations: translations as TranslationsObject,
    source: 'plugin' as const,
    sourceId: pluginId,
    userModified: false,
    isEnabled: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }));

  if (inserts.length > 0) {
    // Use upsert to handle reinstalls
    for (const insert of inserts) {
      await db
        .insert(i18nMessages)
        .values(insert)
        .onConflictDoUpdate({
          target: [i18nMessages.organizationId, i18nMessages.namespace, i18nMessages.key],
          set: {
            translations: insert.translations,
            updatedAt: now,
            // Only update if not user-modified
          },
        });
    }

    console.log(`[i18n] Installed ${inserts.length} translations for plugin ${pluginId}`);
  }
}

/**
 * Uninstall plugin translations
 *
 * Called during plugin uninstallation to remove translations.
 */
export async function uninstallPluginTranslations(
  pluginId: string,
  organizationId: string,
  i18nConfig: PluginI18nConfig
): Promise<void> {
  if (!i18nConfig || i18nConfig.onUninstall === 'retain') {
    return;
  }

  const normalizedPluginId = pluginId.replace(/^com\.wordrhyme\./, '').replace(/\./g, '-');
  const namespace = i18nConfig.namespace || `plugin.${normalizedPluginId}`;

  // Delete plugin translations that haven't been user-modified
  const deleted = await db
    .delete(i18nMessages)
    .where(
      and(
        eq(i18nMessages.organizationId, organizationId),
        eq(i18nMessages.namespace, namespace),
        eq(i18nMessages.source, 'plugin'),
        eq(i18nMessages.sourceId, pluginId),
        eq(i18nMessages.userModified, false)
      )
    )
    .returning({ id: i18nMessages.id });

  console.log(`[i18n] Removed ${deleted.length} translations for plugin ${pluginId}`);

  // Invalidate cache
  // Cache invalidation is handled by higher-level services when available.
}
