/**
 * CurrencyProvider Component
 *
 * Provides currency context to the application with:
 * - Initial loading from tRPC backend
 * - LocalStorage caching with version validation
 * - Currency switching support (reactive, no page refresh)
 * - Banker's rounding for financial precision
 *
 * SSR Integration:
 * - Server prefetches currencies and passes as initialCurrencies
 * - Client hydrates with prefetched data, then validates version
 * - No global state - uses React Context + Hook pattern
 *
 * @see constraints.md §5.5: SSR Integration Constraints
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { trpc } from '../trpc';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import {
  type CurrencyInfo,
  getCachedCurrencies,
  setCachedCurrencies,
  getSavedCurrency,
  saveCurrency,
  formatPrice,
  convertCurrency,
  fromCents,
  toCents,
  DEFAULT_CURRENCY,
  type FormatPriceOptions,
} from './config';

// ============================================================================
// Context Types
// ============================================================================

/**
 * Price formatter function signature
 * Matches the pattern from constraints.md
 */
export type PriceFormatter = (
  cents: number,
  options?: FormatPriceOptions
) => string;

/**
 * Currency Context value
 */
interface CurrencyContextValue {
  /** Current selected currency */
  currency: CurrencyInfo;
  /** All enabled currencies */
  currencies: CurrencyInfo[];
  /** Base currency for the organization */
  baseCurrency: CurrencyInfo;
  /** Whether data is loading */
  isLoading: boolean;
  /** Whether data is ready */
  isReady: boolean;
  /** Change selected currency */
  changeCurrency: (currencyCode: string) => void;
  /** Price formatter function (p) */
  p: PriceFormatter;
  /** Convert amount between currencies */
  convert: (
    cents: number,
    fromCurrencyCode: string,
    toCurrencyCode: string
  ) => number;
  /** Convert cents to display amount */
  fromCents: (cents: number, currencyCode?: string) => number;
  /** Convert display amount to cents */
  toCents: (displayAmount: number, currencyCode?: string) => number;
}

/**
 * Currency Context
 */
const CurrencyContext = createContext<CurrencyContextValue | null>(null);

// ============================================================================
// Provider Props
// ============================================================================

interface CurrencyProviderProps {
  children: ReactNode;
  /** Initial currencies for SSR (optional) */
  initialCurrencies?: CurrencyInfo[];
  /** Default currency code (optional, uses saved or base) */
  defaultCurrency?: string;
}

// ============================================================================
// Provider Component
// ============================================================================

/**
 * CurrencyProvider Component
 */
export function CurrencyProvider({
  children,
  initialCurrencies,
  defaultCurrency,
}: CurrencyProviderProps) {
  const { isAuthenticated } = useAuth();
  const { locale } = useI18n();

  // State
  const [currencies, setCurrencies] = useState<CurrencyInfo[]>(
    initialCurrencies ?? []
  );
  const [selectedCode, setSelectedCode] = useState<string>(
    defaultCurrency ?? getSavedCurrency() ?? ''
  );
  const [isLoading, setIsLoading] = useState(!initialCurrencies);
  const [isReady, setIsReady] = useState(!!initialCurrencies);

  // Derive base currency
  const baseCurrency = useMemo(
    () => currencies.find((c) => c.isBase) ?? DEFAULT_CURRENCY,
    [currencies]
  );

  // Derive current currency
  const currency = useMemo(() => {
    if (selectedCode) {
      const found = currencies.find((c) => c.code === selectedCode);
      if (found) return found;
    }
    return baseCurrency;
  }, [currencies, selectedCode, baseCurrency]);

  // tRPC queries
  const currenciesQuery = trpc.currency.getCurrencies.useQuery(undefined, {
    enabled: isAuthenticated && !initialCurrencies && isLoading,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchInterval: 30 * 60 * 1000, // Auto-refresh every 30 minutes
  });

  // Initialize from cache on mount (client-side only)
  useEffect(() => {
    if (initialCurrencies) {
      // SSR data provided
      setCurrencies(initialCurrencies);
      setIsReady(true);
      setIsLoading(false);

      // Set default selected currency
      if (!selectedCode) {
        const base = initialCurrencies.find((c) => c.isBase);
        if (base) {
          setSelectedCode(base.code);
        }
      }
    } else {
      // Try localStorage cache
      const cached = getCachedCurrencies();
      if (cached && cached.currencies.length > 0) {
        setCurrencies(cached.currencies);
        setIsReady(true);

        // Set default selected currency from cache
        if (!selectedCode) {
          const base = cached.currencies.find((c) => c.isBase);
          if (base) {
            setSelectedCode(base.code);
          }
        }
      }
    }
  }, []);

  // Handle currencies query result
  useEffect(() => {
    if (currenciesQuery.data) {
      setCurrencies(currenciesQuery.data);
      setIsReady(true);
      setIsLoading(false);

      // Set default selected currency
      if (!selectedCode && currenciesQuery.data.length > 0) {
        const base = currenciesQuery.data.find((c) => c.isBase);
        if (base) {
          setSelectedCode(base.code);
        }
      }

      // Save to cache
      setCachedCurrencies(currenciesQuery.data, 0);
    }
  }, [currenciesQuery.data]);

  // Change currency handler
  const changeCurrency = useCallback((currencyCode: string) => {
    const found = currencies.find((c) => c.code === currencyCode);
    if (found) {
      setSelectedCode(currencyCode);
      saveCurrency(currencyCode);
    }
  }, [currencies]);

  // Price formatter function (p)
  // Automatically converts from base currency to current currency, then formats
  const p = useCallback<PriceFormatter>(
    (cents: number, options?: FormatPriceOptions) => {
      const converted = currency.code === baseCurrency.code
        ? cents
        : convertCurrency(cents, baseCurrency, currency, baseCurrency);
      return formatPrice(converted, currency, locale, options);
    },
    [currency, baseCurrency, locale]
  );

  // Convert between currencies
  const convert = useCallback(
    (cents: number, fromCode: string, toCode: string): number => {
      const from = currencies.find((c) => c.code === fromCode) ?? baseCurrency;
      const to = currencies.find((c) => c.code === toCode) ?? baseCurrency;
      return convertCurrency(cents, from, to, baseCurrency);
    },
    [currencies, baseCurrency]
  );

  // fromCents helper
  const fromCentsHelper = useCallback(
    (cents: number, currencyCode?: string): number => {
      const curr = currencyCode
        ? currencies.find((c) => c.code === currencyCode) ?? currency
        : currency;
      return fromCents(cents, curr.decimalDigits);
    },
    [currencies, currency]
  );

  // toCents helper
  const toCentsHelper = useCallback(
    (displayAmount: number, currencyCode?: string): number => {
      const curr = currencyCode
        ? currencies.find((c) => c.code === currencyCode) ?? currency
        : currency;
      return toCents(displayAmount, curr.decimalDigits);
    },
    [currencies, currency]
  );

  const contextValue: CurrencyContextValue = {
    currency,
    currencies,
    baseCurrency,
    isLoading,
    isReady,
    changeCurrency,
    p,
    convert,
    fromCents: fromCentsHelper,
    toCents: toCentsHelper,
  };

  return (
    <CurrencyContext.Provider value={contextValue}>
      {children}
    </CurrencyContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to access currency context
 *
 * @example
 * ```tsx
 * function PriceTag({ cents }) {
 *   const { p } = useCurrency();
 *   return <span>{p(cents)}</span>;
 * }
 * ```
 */
export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

/**
 * Hook for currency switching
 *
 * @example
 * ```tsx
 * function CurrencySelector() {
 *   const { currentCurrency, availableCurrencies, switchTo } = useCurrencySwitcher();
 *   return (
 *     <select value={currentCurrency.code} onChange={(e) => switchTo(e.target.value)}>
 *       {availableCurrencies.map((c) => (
 *         <option key={c.code} value={c.code}>{c.code}</option>
 *       ))}
 *     </select>
 *   );
 * }
 * ```
 */
export function useCurrencySwitcher() {
  const { currency, currencies, changeCurrency, isLoading } = useCurrency();

  return {
    currentCurrency: currency,
    availableCurrencies: currencies,
    isChanging: isLoading,
    switchTo: changeCurrency,
  };
}

/**
 * Hook for price formatting only
 * Use when you only need the `p` formatter function
 *
 * @example
 * ```tsx
 * function ProductCard({ priceCents }) {
 *   const p = usePrice();
 *   return <span className="price">{p(priceCents)}</span>;
 * }
 * ```
 */
export function usePrice(): PriceFormatter {
  const { p } = useCurrency();
  return p;
}

/**
 * Hook for currency conversion
 *
 * @example
 * ```tsx
 * function ConvertedPrice({ cents, fromCurrency }) {
 *   const { convert, p, currency } = useCurrency();
 *   const convertedCents = convert(cents, fromCurrency, currency.code);
 *   return <span>{p(convertedCents)}</span>;
 * }
 * ```
 */
export function useCurrencyConversion() {
  const { convert, currency, baseCurrency, fromCents, toCents } = useCurrency();

  return {
    convert,
    currentCurrency: currency,
    baseCurrency,
    fromCents,
    toCents,
  };
}
