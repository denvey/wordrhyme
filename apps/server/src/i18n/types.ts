/**
 * Globalization Context Types
 *
 * These types define the global context for internationalization,
 * including locale, currency, timezone, and text direction.
 *
 * @see DATA_MODEL_GOVERNANCE.md Section 3.1 for content i18n rules
 */

/**
 * Text direction for RTL/LTR languages
 */
export type TextDirection = 'ltr' | 'rtl';

/**
 * Globalization Context
 *
 * Contains all locale-related information for the current request.
 * This is resolved by the Context Resolver Pipeline.
 */
export interface GlobalizationContext {
  /**
   * BCP 47 locale code (e.g., 'en-US', 'zh-CN', 'ar-SA')
   */
  locale: string;

  /**
   * ISO 4217 currency code (e.g., 'USD', 'CNY', 'EUR')
   */
  currency: string;

  /**
   * IANA timezone identifier (e.g., 'America/New_York', 'Asia/Shanghai')
   */
  timezone: string;

  /**
   * Text direction based on locale
   */
  direction: TextDirection;

  /**
   * Fallback locale when requested translation is not available
   */
  fallbackLocale?: string;
}

/**
 * Locale resolution sources in priority order
 */
export type LocaleSource =
  | 'url'           // ?lang=en-US query parameter
  | 'cookie'        // Accept-Language or custom cookie
  | 'user'          // User preference from database
  | 'organization'  // Organization default language
  | 'system';       // System default (zh-CN)

/**
 * Locale resolution result with source tracking
 */
export interface LocaleResolution {
  locale: string;
  source: LocaleSource;
  direction: TextDirection;
}

/**
 * RTL languages
 * Languages that are written from right to left
 */
export const RTL_LOCALES = new Set([
  'ar',     // Arabic
  'ar-SA',  // Arabic (Saudi Arabia)
  'ar-EG',  // Arabic (Egypt)
  'ar-AE',  // Arabic (UAE)
  'he',     // Hebrew
  'he-IL',  // Hebrew (Israel)
  'fa',     // Persian
  'fa-IR',  // Persian (Iran)
  'ur',     // Urdu
  'ur-PK',  // Urdu (Pakistan)
]);

/**
 * Get text direction for a locale
 */
export function getTextDirection(locale: string): TextDirection {
  // Check exact match first
  if (RTL_LOCALES.has(locale)) {
    return 'rtl';
  }

  // Check language code (first part before hyphen)
  const languageCode = locale.split('-')[0];
  if (languageCode && RTL_LOCALES.has(languageCode)) {
    return 'rtl';
  }

  return 'ltr';
}

/**
 * Default system locale
 */
export const DEFAULT_LOCALE = 'zh-CN';

/**
 * Default system currency
 */
export const DEFAULT_CURRENCY = 'CNY';

/**
 * Default system timezone
 */
export const DEFAULT_TIMEZONE = 'Asia/Shanghai';

/**
 * Create default globalization context
 */
export function createDefaultGlobalizationContext(
  overrides?: Partial<GlobalizationContext>
): GlobalizationContext {
  const locale = overrides?.locale ?? DEFAULT_LOCALE;

  return {
    locale,
    currency: overrides?.currency ?? DEFAULT_CURRENCY,
    timezone: overrides?.timezone ?? DEFAULT_TIMEZONE,
    direction: overrides?.direction ?? getTextDirection(locale),
    fallbackLocale: overrides?.fallbackLocale ?? DEFAULT_LOCALE,
  };
}
