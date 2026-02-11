/**
 * Content i18n Helper - getI18nValue
 *
 * Extracts localized content from entity JSONB fields.
 *
 * This is for CONTENT DATA (product names, article titles, etc.),
 * NOT for UI translations (use t() for those).
 *
 * @see DATA_MODEL_GOVERNANCE.md Section 3.1
 * @see spec.md "Requirement: Content Data i18n Helper"
 *
 * @example
 * ```ts
 * import { getI18nValue } from '@wordrhyme/core';
 *
 * // Basic usage
 * const title = getI18nValue(product.title, 'zh-CN');
 *
 * // With fallback
 * const title = getI18nValue(product.title, 'ja-JP', 'en-US');
 *
 * // Get all translations
 * const allTitles = getI18nValue(product.title);
 * ```
 */

/**
 * Translations object type
 * Key: BCP 47 locale code (e.g., "en-US", "zh-CN")
 * Value: Translated text
 */
export type I18nField = Record<string, string> | null | undefined;

/**
 * Get localized value from a JSONB i18n field
 *
 * @param field - JSONB field containing translations { "en-US": "...", "zh-CN": "..." }
 * @param locale - Target locale to extract (optional, returns all if omitted)
 * @param fallbackLocale - Fallback locale if target not found
 * @returns Localized string, all translations, or undefined
 *
 * @example Get value for current locale
 * ```ts
 * const title = getI18nValue(product.title, 'zh-CN');
 * // Returns: "冬季夹克"
 * ```
 *
 * @example With fallback
 * ```ts
 * const title = getI18nValue(product.title, 'ja-JP', 'en-US');
 * // If ja-JP doesn't exist, returns en-US value
 * ```
 *
 * @example Get all translations
 * ```ts
 * const allTitles = getI18nValue(product.title);
 * // Returns: { "en-US": "Winter Jacket", "zh-CN": "冬季夹克" }
 * ```
 */
export function getI18nValue(field: I18nField): Record<string, string> | undefined;
export function getI18nValue(field: I18nField, locale: string): string | undefined;
export function getI18nValue(
  field: I18nField,
  locale: string,
  fallbackLocale: string
): string | undefined;
export function getI18nValue(
  field: I18nField,
  locale?: string,
  fallbackLocale?: string
): string | Record<string, string> | undefined {
  // Handle null/undefined field
  if (!field || typeof field !== 'object') {
    return undefined;
  }

  // Handle empty object
  const keys = Object.keys(field);
  if (keys.length === 0) {
    return undefined;
  }

  // No locale specified - return all translations
  if (!locale) {
    return field;
  }

  // Try exact locale match
  if (field[locale] !== undefined) {
    return field[locale];
  }

  // Try fallback locale
  if (fallbackLocale && field[fallbackLocale] !== undefined) {
    return field[fallbackLocale];
  }

  // Try language code only (e.g., "en" from "en-US")
  const languageCode = locale.split('-')[0];
  if (languageCode) {
    // Find any locale starting with this language code
    for (const key of keys) {
      if (key === languageCode || key.startsWith(languageCode + '-')) {
        return field[key];
      }
    }
  }

  // Return first available value as last resort
  const firstKey = keys[0];
  return firstKey ? field[firstKey] : undefined;
}

/**
 * Check if a field has a translation for a specific locale
 *
 * @param field - JSONB i18n field
 * @param locale - Locale to check
 * @returns true if translation exists
 */
export function hasI18nValue(field: I18nField, locale: string): boolean {
  if (!field || typeof field !== 'object') {
    return false;
  }
  return field[locale] !== undefined && field[locale] !== '';
}

/**
 * Get all available locales from an i18n field
 *
 * @param field - JSONB i18n field
 * @returns Array of locale codes
 */
export function getI18nLocales(field: I18nField): string[] {
  if (!field || typeof field !== 'object') {
    return [];
  }
  return Object.keys(field).filter((key) => field[key] !== undefined && field[key] !== '');
}

/**
 * Set a translation value in an i18n field (immutable)
 *
 * @param field - Original JSONB i18n field
 * @param locale - Locale to set
 * @param value - Translation value
 * @returns New field object with updated translation
 */
export function setI18nValue(
  field: I18nField,
  locale: string,
  value: string
): Record<string, string> {
  return {
    ...(field || {}),
    [locale]: value,
  };
}

/**
 * Remove a translation from an i18n field (immutable)
 *
 * @param field - Original JSONB i18n field
 * @param locale - Locale to remove
 * @returns New field object without the specified locale
 */
export function removeI18nValue(
  field: I18nField,
  locale: string
): Record<string, string> {
  if (!field) {
    return {};
  }
  const result = { ...field };
  delete result[locale];
  return result;
}

/**
 * Merge two i18n fields (immutable)
 *
 * @param base - Base field
 * @param override - Override field (takes precedence)
 * @returns Merged field
 */
export function mergeI18nFields(
  base: I18nField,
  override: I18nField
): Record<string, string> {
  return {
    ...(base || {}),
    ...(override || {}),
  };
}
