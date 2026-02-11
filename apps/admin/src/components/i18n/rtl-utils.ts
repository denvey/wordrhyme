/**
 * RTL Utilities
 *
 * Provides RTL-aware CSS class utilities and hooks for bidirectional layouts.
 *
 * @see docs/architecture/GLOBALIZATION_GOVERNANCE.md
 *
 * ## CSS Logical Properties Reference
 *
 * Use these Tailwind classes instead of physical properties:
 *
 * | Physical (Don't use) | Logical (Use this) |
 * |---------------------|-------------------|
 * | `ml-*`, `mr-*`      | `ms-*`, `me-*`    |
 * | `pl-*`, `pr-*`      | `ps-*`, `pe-*`    |
 * | `left-*`, `right-*` | `start-*`, `end-*`|
 * | `text-left`         | `text-start`      |
 * | `text-right`        | `text-end`        |
 * | `float-left`        | `float-start`     |
 * | `float-right`       | `float-end`       |
 * | `border-l-*`        | `border-s-*`      |
 * | `border-r-*`        | `border-e-*`      |
 * | `rounded-l-*`       | `rounded-s-*`     |
 * | `rounded-r-*`       | `rounded-e-*`     |
 *
 * ## Variant Usage
 *
 * For direction-specific overrides:
 * ```tsx
 * <div className="rtl:flex-row-reverse">...</div>
 * <div className="ltr:ml-4 rtl:mr-4">...</div>
 * ```
 */

import { useI18n } from '../../lib/i18n';

/**
 * RTL Locales
 */
export const RTL_LOCALES = new Set([
  'ar',
  'ar-SA',
  'ar-EG',
  'ar-AE',
  'ar-MA',
  'he',
  'he-IL',
  'fa',
  'fa-IR',
  'ur',
  'ur-PK',
]);

/**
 * Check if a locale is RTL
 */
export function isRTLLocale(locale: string): boolean {
  if (RTL_LOCALES.has(locale)) {
    return true;
  }
  // Check language code only
  const languageCode = locale.split('-')[0];
  if (languageCode && RTL_LOCALES.has(languageCode)) {
    return true;
  }
  return false;
}

/**
 * Get text direction for a locale
 */
export function getTextDirection(locale: string): 'ltr' | 'rtl' {
  return isRTLLocale(locale) ? 'rtl' : 'ltr';
}

/**
 * Hook for RTL-aware styling
 *
 * @example
 * ```tsx
 * const { isRTL, direction, flip } = useRTL();
 *
 * // Conditional classes
 * <div className={isRTL ? 'pr-4' : 'pl-4'}>
 *
 * // Using flip helper
 * <Icon className={flip('rotate-90')} />
 * ```
 */
export function useRTL() {
  const { direction, locale } = useI18n();
  const isRTL = direction === 'rtl';

  /**
   * Flip a transform class for RTL
   */
  const flip = (transformClass: string): string => {
    if (!isRTL) return transformClass;

    // Common flip mappings
    const flipMap: Record<string, string> = {
      'rotate-90': '-rotate-90',
      'rotate-180': 'rotate-180', // 180 stays same
      '-rotate-90': 'rotate-90',
      'translate-x-full': '-translate-x-full',
      '-translate-x-full': 'translate-x-full',
      'translate-x-1/2': '-translate-x-1/2',
      '-translate-x-1/2': 'translate-x-1/2',
    };

    return flipMap[transformClass] || transformClass;
  };

  /**
   * Get start/end aware class
   */
  const startEnd = (startClass: string, endClass: string): string => {
    return isRTL ? endClass : startClass;
  };

  return {
    isRTL,
    direction,
    locale,
    flip,
    startEnd,
  };
}

/**
 * CSS class utilities for RTL support
 */
export const rtlClasses = {
  /**
   * Flex direction that reverses in RTL
   */
  flexRowReverse: 'flex-row rtl:flex-row-reverse',

  /**
   * Icon that flips horizontally in RTL
   */
  iconFlip: 'rtl:-scale-x-100',

  /**
   * Arrow pointing forward (right in LTR, left in RTL)
   */
  arrowForward: 'rtl:rotate-180',

  /**
   * Arrow pointing backward (left in LTR, right in RTL)
   */
  arrowBackward: 'ltr:rotate-180',
};

export default useRTL;
