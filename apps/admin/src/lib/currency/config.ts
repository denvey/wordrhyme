/**
 * Currency Configuration and Utilities
 *
 * Provides currency caching, Banker's rounding, and formatting utilities.
 * Works with the CurrencyProvider for React context integration.
 *
 * @see GLOBALIZATION_GOVERNANCE.md for currency system design
 */

import Decimal from 'decimal.js';

// Configure Decimal.js for financial calculations
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN, // Banker's rounding
});

// ============================================================================
// Types
// ============================================================================

/**
 * Currency information from API
 */
export interface CurrencyInfo {
  code: string;
  nameI18n: Record<string, string>;
  symbol: string;
  decimalDigits: number;
  isBase: boolean;
  currentRate: string | null;
}

/**
 * Cached currency data
 */
export interface CachedCurrencyData {
  currencies: CurrencyInfo[];
  version: number;
  cachedAt: number;
}

// ============================================================================
// LocalStorage Keys
// ============================================================================

const STORAGE_KEY_CURRENCIES = 'wordrhyme_currencies';
const STORAGE_KEY_VERSION = 'wordrhyme_currency_version';
const STORAGE_KEY_SELECTED = 'wordrhyme_currency_selected';

// ============================================================================
// Cache Functions
// ============================================================================

/**
 * Get cached currencies from localStorage
 */
export function getCachedCurrencies(): CachedCurrencyData | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY_CURRENCIES);
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Set cached currencies to localStorage
 */
export function setCachedCurrencies(
  currencies: CurrencyInfo[],
  version: number
): void {
  try {
    const data: CachedCurrencyData = {
      currencies,
      version,
      cachedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY_CURRENCIES, JSON.stringify(data));
    localStorage.setItem(STORAGE_KEY_VERSION, String(version));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get selected currency code from localStorage
 */
export function getSavedCurrency(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_SELECTED);
  } catch {
    return null;
  }
}

/**
 * Save selected currency code to localStorage
 */
export function saveCurrency(currencyCode: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_SELECTED, currencyCode);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear all currency cache
 */
export function clearCurrencyCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_CURRENCIES);
    localStorage.removeItem(STORAGE_KEY_VERSION);
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// Conversion and Rounding Functions
// ============================================================================

/**
 * Convert amount between currencies using exchange rates
 * Uses Banker's Rounding (half-to-even) for financial precision
 *
 * @param amountCents - Amount in source currency (cents/smallest unit)
 * @param fromCurrency - Source currency info
 * @param toCurrency - Target currency info
 * @param baseCurrency - Base currency info for triangulation
 * @returns Converted amount in cents
 */
export function convertCurrency(
  amountCents: number,
  fromCurrency: CurrencyInfo,
  toCurrency: CurrencyInfo,
  baseCurrency: CurrencyInfo
): number {
  // Same currency - no conversion needed
  if (fromCurrency.code === toCurrency.code) {
    return amountCents;
  }

  // Get rates (relative to base currency)
  const fromRate = fromCurrency.isBase
    ? '1'
    : fromCurrency.currentRate ?? '1';
  const toRate = toCurrency.isBase ? '1' : toCurrency.currentRate ?? '1';

  // Calculate conversion
  // If base is USD, and fromCurrency rate is 7.25 (USD to CNY), toRate is 0.91 (USD to EUR)
  // To convert from CNY to EUR: amount / 7.25 * 0.91
  const amount = new Decimal(amountCents);
  const fromRateDecimal = new Decimal(fromRate);
  const toRateDecimal = new Decimal(toRate);

  const converted = amount.div(fromRateDecimal).times(toRateDecimal);

  // Round to integer using Banker's rounding
  return converted.round().toNumber();
}

/**
 * Round a monetary value using Banker's Rounding (half-to-even)
 *
 * @param value - Value to round
 * @param decimalDigits - Number of decimal places
 * @returns Rounded value
 */
export function bankersRound(value: number, decimalDigits: number): number {
  const decimal = new Decimal(value);
  const factor = new Decimal(10).pow(decimalDigits);
  return decimal.times(factor).round().div(factor).toNumber();
}

/**
 * Convert display amount to cents (smallest unit)
 *
 * @param displayAmount - Human-readable amount (e.g., 99.99)
 * @param decimalDigits - Currency's decimal digits
 * @returns Amount in cents
 */
export function toCents(displayAmount: number, decimalDigits: number): number {
  const factor = Math.pow(10, decimalDigits);
  return Math.round(displayAmount * factor);
}

/**
 * Convert cents to display amount
 *
 * @param cents - Amount in cents
 * @param decimalDigits - Currency's decimal digits
 * @returns Human-readable amount
 */
export function fromCents(cents: number, decimalDigits: number): number {
  const factor = Math.pow(10, decimalDigits);
  return cents / factor;
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format options for price formatting
 */
export interface FormatPriceOptions {
  /** Show currency symbol (default: true) */
  showSymbol?: boolean;
  /** Currency display style */
  currencyDisplay?: 'symbol' | 'code' | 'name' | 'narrowSymbol';
  /** Notation style */
  notation?: 'standard' | 'compact';
  /** Sign display */
  signDisplay?: 'auto' | 'always' | 'exceptZero' | 'never';
  /** Override decimal digits */
  decimalDigits?: number;
}

/**
 * Format a price for display
 *
 * @param cents - Amount in cents
 * @param currency - Currency info
 * @param locale - Locale for formatting
 * @param options - Formatting options
 * @returns Formatted price string
 */
export function formatPrice(
  cents: number,
  currency: CurrencyInfo,
  locale: string,
  options: FormatPriceOptions = {}
): string {
  const {
    showSymbol = true,
    currencyDisplay = 'symbol',
    notation = 'standard',
    signDisplay = 'auto',
    decimalDigits,
  } = options;

  const digits = decimalDigits ?? currency.decimalDigits;
  const displayAmount = fromCents(cents, currency.decimalDigits);

  try {
    if (showSymbol) {
      const formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency.code,
        currencyDisplay,
        notation,
        signDisplay,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
      return formatter.format(displayAmount);
    } else {
      const formatter = new Intl.NumberFormat(locale, {
        style: 'decimal',
        notation,
        signDisplay,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
      return formatter.format(displayAmount);
    }
  } catch (error) {
    // Fallback for unsupported currencies or locales
    console.warn(`[formatPrice] Formatting error:`, error);
    const symbol = showSymbol ? currency.symbol : '';
    return `${symbol}${displayAmount.toFixed(digits)}`;
  }
}

/**
 * Default currency for fallback
 */
export const DEFAULT_CURRENCY: CurrencyInfo = {
  code: 'USD',
  nameI18n: { 'en-US': 'US Dollar', 'zh-CN': '美元' },
  symbol: '$',
  decimalDigits: 2,
  isBase: true,
  currentRate: '1',
};

export { Decimal };
