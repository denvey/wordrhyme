/**
 * Currency Module
 *
 * Provides multi-currency support with:
 * - CurrencyProvider: React context provider
 * - useCurrency: Main hook for currency access
 * - usePrice: Shorthand hook for price formatting (p function)
 * - useCurrencySwitcher: Hook for currency selection UI
 * - useCurrencyConversion: Hook for currency conversion
 *
 * @example Basic usage
 * ```tsx
 * // In app root
 * <CurrencyProvider>
 *   <App />
 * </CurrencyProvider>
 *
 * // In component
 * function PriceTag({ cents }) {
 *   const { p } = useCurrency();
 *   return <span>{p(cents)}</span>;
 * }
 * ```
 *
 * @see GLOBALIZATION_GOVERNANCE.md for currency system design
 */

// Provider and hooks
export {
  CurrencyProvider,
  useCurrency,
  useCurrencySwitcher,
  usePrice,
  useCurrencyConversion,
  type PriceFormatter,
} from './CurrencyProvider';

// Configuration and utilities
export {
  type CurrencyInfo,
  type CachedCurrencyData,
  type FormatPriceOptions,
  formatPrice,
  convertCurrency,
  bankersRound,
  toCents,
  fromCents,
  DEFAULT_CURRENCY,
  getCachedCurrencies,
  setCachedCurrencies,
  getSavedCurrency,
  saveCurrency,
  clearCurrencyCache,
} from './config';
