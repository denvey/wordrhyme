/**
 * i18n Module - Public Exports
 *
 * This module provides internationalization capabilities for WordRhyme.
 *
 * UI Translations:
 * - Use t('key', { ns: 'namespace' }) for UI text
 * - Managed via i18n_messages table and tRPC router
 *
 * Content Data:
 * - Use getI18nValue(field, locale) for entity field translations
 * - Stored as JSONB in entity tables
 *
 * @see DATA_MODEL_GOVERNANCE.md Section 3.1
 * @see docs/i18n-architecture-final.md
 */

// Types
export * from './types';

// Context Resolution
export { ContextResolver } from './context-resolver';

// Cache Service
export { I18nCacheService, type CachedTranslations } from './i18n-cache.service';

// Content i18n Helper
export {
  getI18nValue,
  hasI18nValue,
  getI18nLocales,
  setI18nValue,
  removeI18nValue,
  mergeI18nFields,
  type I18nField,
} from './get-i18n-value';
