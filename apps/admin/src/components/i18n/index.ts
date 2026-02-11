/**
 * i18n Smart Components
 *
 * Locale-aware display components for internationalized content.
 *
 * @example
 * ```tsx
 * import {
 *   LocalizedText,
 *   CurrencyDisplay,
 *   DateTimeDisplay,
 *   NumberDisplay,
 *   useRTL,
 *   rtlClasses,
 * } from '@/components/i18n';
 *
 * // UI translations
 * <LocalizedText i18nKey="common.save" />
 *
 * // Content data
 * <LocalizedText content={product.title} />
 *
 * // Currency
 * <CurrencyDisplay value={99.99} currency="USD" />
 *
 * // Date/Time
 * <DateTimeDisplay value={new Date()} format="long" />
 * <DateTimeDisplay value={createdAt} relative />
 *
 * // Numbers
 * <NumberDisplay value={1234567} notation="compact" />
 * <NumberDisplay value={0.156} style="percent" />
 *
 * // RTL-aware styling
 * const { isRTL, flip } = useRTL();
 * <Icon className={flip('rotate-90')} />
 * <div className={rtlClasses.flexRowReverse}>...</div>
 * ```
 */

// Components
export { LocalizedText } from './LocalizedText';
export { CurrencyDisplay, formatCurrency } from './CurrencyDisplay';
export {
  DateTimeDisplay,
  formatDate,
  formatRelativeTime,
} from './DateTimeDisplay';
export {
  NumberDisplay,
  formatNumber,
  formatPercent,
  formatCompact,
} from './NumberDisplay';

// RTL Utilities
export {
  useRTL,
  isRTLLocale,
  getTextDirection,
  rtlClasses,
  RTL_LOCALES,
} from './rtl-utils';

// Language Switcher
export {
  LanguageSwitcher,
  LanguageSwitcherCompact,
} from './LanguageSwitcher';

// Plugin Translation Hook
export {
  usePluginTranslation,
  usePluginHasTranslation,
} from './usePluginTranslation';

// Default exports for convenience
export { default as LocalizedTextDefault } from './LocalizedText';
export { default as CurrencyDisplayDefault } from './CurrencyDisplay';
export { default as DateTimeDisplayDefault } from './DateTimeDisplay';
export { default as NumberDisplayDefault } from './NumberDisplay';
