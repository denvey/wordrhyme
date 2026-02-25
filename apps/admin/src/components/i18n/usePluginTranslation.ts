/**
 * Plugin Translation Hook
 *
 * Provides translation capabilities for plugin UI components.
 * Automatically scopes translations to the plugin's namespace
 * and lazily loads the namespace via I18nProvider.addNamespace().
 *
 * @example
 * ```tsx
 * import { usePluginTranslation } from '@wordrhyme/plugin-ui';
 *
 * function MyPluginComponent() {
 *   const { t, locale, isLoading } = usePluginTranslation('hello-world');
 *   return <h1>{t('greeting')}</h1>;
 * }
 * ```
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useI18n } from '../../lib/i18n';

interface UsePluginTranslationReturn {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
  isLoading: boolean;
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
 * On mount, registers the plugin's namespace with I18nProvider
 * so its translations are fetched from the backend.
 */
export function usePluginTranslation(
  pluginId: string,
  customNamespace?: string
): UsePluginTranslationReturn {
  const namespace = customNamespace || normalizePluginNamespace(pluginId);
  const { t: globalT, locale, isLoading, addNamespace } = useI18n();

  // Register plugin namespace on mount
  useEffect(() => {
    addNamespace(namespace);
  }, [namespace, addNamespace]);

  // Scoped t() that prepends namespace prefix to keys
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const fullKey = key.startsWith(`${namespace}.`) ? key : `${namespace}.${key}`;
      return globalT(fullKey, params);
    },
    [globalT, namespace]
  );

  return useMemo(
    () => ({ t, locale, isLoading, namespace }),
    [t, locale, isLoading, namespace]
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
      return translated !== key && translated !== `${namespace}.${key}`;
    },
    [t, namespace]
  );
}

export default usePluginTranslation;
