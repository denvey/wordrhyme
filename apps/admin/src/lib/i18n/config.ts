/**
 * i18n Configuration and Setup
 *
 * Configures react-i18next with:
 * - Backend: tRPC for loading translations
 * - LocalStorage caching with version validation
 * - SSR-friendly initialization
 *
 * @see design.md D3, D4
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Default namespaces to load
 */
export const DEFAULT_NAMESPACES = ['core', 'admin'];

/**
 * Default locale
 */
export const DEFAULT_LOCALE = 'zh-CN';

/**
 * Supported locales (fetched from backend, these are fallbacks)
 */
export const FALLBACK_LOCALES = ['zh-CN', 'en-US'];

/**
 * LocalStorage keys
 */
const STORAGE_KEYS = {
  locale: 'wr_i18n_locale',
  messages: (locale: string, ns: string) => `wr_i18n_messages_${locale}_${ns}`,
  version: (locale: string, ns: string) => `wr_i18n_version_${locale}_${ns}`,
};

/**
 * Get cached messages from LocalStorage
 */
export function getCachedMessages(
  locale: string,
  namespace: string
): { messages: Record<string, string>; version: string } | null {
  try {
    const messagesKey = STORAGE_KEYS.messages(locale, namespace);
    const versionKey = STORAGE_KEYS.version(locale, namespace);

    const messagesJson = localStorage.getItem(messagesKey);
    const version = localStorage.getItem(versionKey);

    if (messagesJson && version) {
      return {
        messages: JSON.parse(messagesJson),
        version,
      };
    }
  } catch (e) {
    console.warn('[i18n] Failed to read cache:', e);
  }
  return null;
}

/**
 * Set cached messages to LocalStorage
 */
export function setCachedMessages(
  locale: string,
  namespace: string,
  messages: Record<string, string>,
  version: string
): void {
  try {
    const messagesKey = STORAGE_KEYS.messages(locale, namespace);
    const versionKey = STORAGE_KEYS.version(locale, namespace);

    localStorage.setItem(messagesKey, JSON.stringify(messages));
    localStorage.setItem(versionKey, version);
  } catch (e) {
    console.warn('[i18n] Failed to write cache:', e);
  }
}

/**
 * Get cached version from LocalStorage
 */
export function getCachedVersion(locale: string, namespace: string): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.version(locale, namespace));
  } catch {
    return null;
  }
}

/**
 * Get saved locale preference
 */
export function getSavedLocale(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.locale) || DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Save locale preference
 */
export function saveLocale(locale: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.locale, locale);
    document.documentElement.lang = locale;
  } catch (e) {
    console.warn('[i18n] Failed to save locale:', e);
  }
}

/**
 * Initialize i18next instance
 *
 * Note: This is called once on app startup with initial messages.
 * Subsequent language changes use changeLanguage().
 */
export function initI18n(
  initialLocale: string,
  initialMessages: Record<string, Record<string, string>>
): typeof i18n {
  // Build resources from initial messages
  const resources: Record<string, Record<string, Record<string, string>>> = {};

  for (const [namespace, messages] of Object.entries(initialMessages)) {
    if (!resources[initialLocale]) {
      resources[initialLocale] = {};
    }
    resources[initialLocale][namespace] = messages;
  }

  i18n.use(initReactI18next).init({
    resources,
    lng: initialLocale,
    fallbackLng: DEFAULT_LOCALE,
    ns: Object.keys(initialMessages),
    defaultNS: 'core',

    interpolation: {
      escapeValue: false, // React already escapes
    },

    react: {
      useSuspense: false, // Disable suspense for SSR compatibility
    },
  });

  // Update document lang attribute
  document.documentElement.lang = initialLocale;

  return i18n;
}

/**
 * Add resources to existing i18n instance
 */
export function addI18nResources(
  locale: string,
  namespace: string,
  messages: Record<string, string>
): void {
  i18n.addResourceBundle(locale, namespace, messages, true, true);
}

/**
 * Export configured i18n instance
 */
export { i18n };

/**
 * Export useTranslation hook for convenience
 */
export { useTranslation } from 'react-i18next';
