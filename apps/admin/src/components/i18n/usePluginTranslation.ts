/**
 * Plugin Translation Hook
 *
 * Provides translation capabilities for plugin UI components.
 * Automatically scopes translations to the plugin's namespace.
 *
 * @see design.md D6: Plugin SDK
 *
 * @example
 * ```tsx
 * // In plugin component
 * import { usePluginTranslation } from '@wordrhyme/plugin-ui';
 *
 * function MyPluginComponent() {
 *   const { t, locale, isLoading } = usePluginTranslation('hello-world');
 *
 *   return (
 *     <div>
 *       <h1>{t('greeting')}</h1>
 *       <p>{t('description', { name: 'User' })}</p>
 *     </div>
 *   );
 * }
 * ```
 */

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useI18n } from '../../lib/i18n';

/**
 * Plugin translation hook return type
 */
interface UsePluginTranslationReturn {
  /**
   * Translate a key within the plugin's namespace
   */
  t: (key: string, params?: Record<string, string | number>) => string;

  /**
   * Current locale
   */
  locale: string;

  /**
   * Text direction
   */
  direction: 'ltr' | 'rtl';

  /**
   * Whether translations are still loading
   */
  isLoading: boolean;

  /**
   * Whether translations are ready
   */
  isReady: boolean;

  /**
   * Plugin's namespace
   */
  namespace: string;
}

/**
 * Normalize plugin ID to namespace format
 *
 * "com.wordrhyme.hello-world" -> "plugin.hello-world"
 * "hello-world" -> "plugin.hello-world"
 */
function normalizePluginNamespace(pluginId: string): string {
  const normalized = pluginId
    .replace(/^com\.wordrhyme\./, '')
    .replace(/\./g, '-');
  return `plugin.${normalized}`;
}

/**
 * Hook for plugin translations
 *
 * @param pluginId - Plugin identifier (e.g., "hello-world" or "com.wordrhyme.hello-world")
 * @param customNamespace - Optional custom namespace (overrides default)
 */
export function usePluginTranslation(
  pluginId: string,
  customNamespace?: string
): UsePluginTranslationReturn {
  const namespace = customNamespace || normalizePluginNamespace(pluginId);
  const { t: i18nT, ready } = useTranslation(namespace);
  const { locale, direction, isLoading, isReady } = useI18n();

  /**
   * Translate a key with optional interpolation
   */
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      // Handle nested keys
      const fullKey = key.includes(':') ? key : key;

      const result = i18nT(fullKey, params as Record<string, string>);

      // If translation not found, return key as fallback
      if (result === fullKey || result === `${namespace}:${key}`) {
        console.warn(`[Plugin i18n] Missing translation: ${namespace}.${key}`);
        return key;
      }

      return result as string;
    },
    [i18nT, namespace]
  );

  return useMemo(
    () => ({
      t,
      locale,
      direction,
      isLoading,
      isReady: isReady && ready,
      namespace,
    }),
    [t, locale, direction, isLoading, isReady, ready, namespace]
  );
}

/**
 * Hook for checking if plugin has specific translation
 */
export function usePluginHasTranslation(pluginId: string): (key: string) => boolean {
  const { t, namespace } = usePluginTranslation(pluginId);

  return useCallback(
    (key: string): boolean => {
      const translated = t(key);
      // If translation returns the key itself, it doesn't exist
      return translated !== key && translated !== `${namespace}:${key}`;
    },
    [t, namespace]
  );
}

export default usePluginTranslation;
