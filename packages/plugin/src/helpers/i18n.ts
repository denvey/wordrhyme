/**
 * I18n Helper Utilities for Plugins
 *
 * These helpers simplify working with JSONB translation fields in plugin tables.
 * Plugins should use JSONB fields to store content translations (e.g., product titles).
 *
 * @example
 * ```typescript
 * // Store product with translations
 * const product = {
 *   title: setI18nValue(null, 'zh-CN', '手机'),
 *   description: setI18nValue(null, 'zh-CN', '智能手机')
 * };
 *
 * // Add English translation
 * product.title = setI18nValue(product.title, 'en-US', 'Phone');
 *
 * // Get translation for current locale
 * const title = getI18nValue(product.title, ctx.locale, 'zh-CN');
 * // Returns: "Phone" (if ctx.locale='en-US') or "手机" (fallback)
 * ```
 *
 * @packageDocumentation
 */

/**
 * Get a localized value from a JSONB translation field
 *
 * @param jsonbField - The JSONB field containing translations (e.g., { "zh-CN": "手机", "en-US": "Phone" })
 * @param locale - Desired locale (e.g., "en-US", "zh-CN")
 * @param fallbackLocale - Fallback locale if desired locale not found
 * @returns The translation value, or undefined if not found
 *
 * @remarks
 * Resolution order:
 * 1. Exact locale match (e.g., "en-US")
 * 2. Fallback locale (e.g., "zh-CN")
 * 3. First available translation (any locale)
 * 4. undefined (if jsonbField is null/empty)
 *
 * @example
 * ```typescript
 * const title = { "zh-CN": "手机", "en-US": "Phone", "fr-FR": "Téléphone" };
 *
 * getI18nValue(title, 'en-US', 'zh-CN');  // "Phone"
 * getI18nValue(title, 'ja-JP', 'zh-CN');  // "手机" (fallback)
 * getI18nValue(title, 'de-DE', 'xx-XX');  // "手机" (first available)
 * getI18nValue(null, 'en-US', 'zh-CN');   // undefined
 * ```
 */
export function getI18nValue<T = string>(
  jsonbField: Record<string, T> | null | undefined,
  locale: string,
  fallbackLocale: string
): T | undefined {
  if (!jsonbField || Object.keys(jsonbField).length === 0) {
    return undefined;
  }

  // 1. Try exact locale match
  if (jsonbField[locale]) {
    return jsonbField[locale];
  }

  // 2. Try fallback locale
  if (jsonbField[fallbackLocale]) {
    return jsonbField[fallbackLocale];
  }

  // 3. Return first available translation
  const firstValue = Object.values(jsonbField)[0];
  return firstValue;
}

/**
 * Set or update a translation in a JSONB field
 *
 * @param current - Current JSONB field value (can be null for new fields)
 * @param locale - Locale to set (e.g., "en-US")
 * @param value - Translation value
 * @returns Updated JSONB object
 *
 * @remarks
 * This is an immutable operation - returns a new object without modifying the input.
 *
 * @example
 * ```typescript
 * // Initialize with Chinese
 * let title = setI18nValue(null, 'zh-CN', '手机');
 * // title = { "zh-CN": "手机" }
 *
 * // Add English
 * title = setI18nValue(title, 'en-US', 'Phone');
 * // title = { "zh-CN": "手机", "en-US": "Phone" }
 *
 * // Update Chinese
 * title = setI18nValue(title, 'zh-CN', '智能手机');
 * // title = { "zh-CN": "智能手机", "en-US": "Phone" }
 * ```
 */
export function setI18nValue<T = string>(
  current: Record<string, T> | null | undefined,
  locale: string,
  value: T
): Record<string, T> {
  return {
    ...(current || {}),
    [locale]: value,
  };
}

/**
 * Remove a translation from a JSONB field
 *
 * @param current - Current JSONB field value
 * @param locale - Locale to remove
 * @returns Updated JSONB object (or null if all translations removed)
 *
 * @example
 * ```typescript
 * const title = { "zh-CN": "手机", "en-US": "Phone", "fr-FR": "Téléphone" };
 *
 * const updated = removeI18nValue(title, 'fr-FR');
 * // { "zh-CN": "手机", "en-US": "Phone" }
 *
 * const empty = removeI18nValue({ "en-US": "Phone" }, 'en-US');
 * // null (no translations left)
 * ```
 */
export function removeI18nValue<T = string>(
  current: Record<string, T> | null | undefined,
  locale: string
): Record<string, T> | null {
  if (!current) return null;

  const { [locale]: removed, ...rest } = current;

  return Object.keys(rest).length > 0 ? rest : null;
}

/**
 * Get all available locales in a JSONB field
 *
 * @param jsonbField - The JSONB field containing translations
 * @returns Array of locale codes (e.g., ["zh-CN", "en-US"])
 *
 * @example
 * ```typescript
 * const title = { "zh-CN": "手机", "en-US": "Phone" };
 * getI18nLocales(title);  // ["zh-CN", "en-US"]
 * getI18nLocales(null);   // []
 * ```
 */
export function getI18nLocales<T = string>(
  jsonbField: Record<string, T> | null | undefined
): string[] {
  if (!jsonbField) return [];
  return Object.keys(jsonbField);
}

/**
 * Check if a JSONB field has a translation for a specific locale
 *
 * @param jsonbField - The JSONB field containing translations
 * @param locale - Locale to check
 * @returns true if translation exists
 *
 * @example
 * ```typescript
 * const title = { "zh-CN": "手机", "en-US": "Phone" };
 * hasI18nValue(title, 'en-US');  // true
 * hasI18nValue(title, 'fr-FR');  // false
 * hasI18nValue(null, 'en-US');   // false
 * ```
 */
export function hasI18nValue<T = string>(
  jsonbField: Record<string, T> | null | undefined,
  locale: string
): boolean {
  return !!jsonbField && locale in jsonbField;
}

/**
 * Merge multiple JSONB translation fields
 *
 * @param fields - Array of JSONB fields to merge
 * @returns Merged JSONB object (later fields override earlier ones)
 *
 * @remarks
 * Useful when combining translations from multiple sources.
 * Later fields take precedence in case of conflicts.
 *
 * @example
 * ```typescript
 * const defaults = { "zh-CN": "默认", "en-US": "Default" };
 * const custom = { "en-US": "Custom" };
 *
 * mergeI18nValues([defaults, custom]);
 * // { "zh-CN": "默认", "en-US": "Custom" }
 * ```
 */
export function mergeI18nValues<T = string>(
  ...fields: Array<Record<string, T> | null | undefined>
): Record<string, T> {
  return fields.reduce<Record<string, T>>(
    (merged, field) => ({ ...merged, ...(field || {}) }),
    {}
  );
}
