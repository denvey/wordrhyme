/**
 * i18n Module - Public Exports
 *
 * Provides internationalization for the admin app:
 * - I18nProvider: Context provider with tRPC backend
 * - useI18n: Access locale, direction, and language switching
 * - useTranslation: react-i18next hook (re-exported)
 * - useLanguageSwitcher: Convenience hook for language UI
 *
 * @see design.md D4: 前端 SSR 集成
 */

// Configuration and utilities
export {
  i18n,
  initI18n,
  addI18nResources,
  getCachedMessages,
  setCachedMessages,
  getCachedVersion,
  getSavedLocale,
  saveLocale,
  useTranslation,
  DEFAULT_NAMESPACES,
  DEFAULT_LOCALE,
  FALLBACK_LOCALES,
} from './config';

// Provider and hooks
export { I18nProvider, useI18n, useLanguageSwitcher } from './I18nProvider';
