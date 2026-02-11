/**
 * CurrencyDisplay Component
 *
 * Displays monetary values with proper currency formatting.
 * Supports automatic locale-based formatting and currency conversion display.
 *
 * @example Basic usage
 * ```tsx
 * <CurrencyDisplay value={99.99} currency="USD" />
 * ```
 *
 * @example With locale override
 * ```tsx
 * <CurrencyDisplay value={99.99} currency="EUR" locale="de-DE" />
 * ```
 *
 * @example Compact notation
 * ```tsx
 * <CurrencyDisplay value={1234567} currency="USD" notation="compact" />
 * // Displays: $1.2M
 * ```
 */

import React, { useMemo } from 'react';
import { useI18n } from '../../lib/i18n';

/**
 * Currency display notation
 */
type CurrencyNotation = 'standard' | 'compact';

/**
 * Currency display style
 */
type CurrencyDisplayStyle = 'symbol' | 'code' | 'name' | 'narrowSymbol';

/**
 * Props for CurrencyDisplay component
 */
interface CurrencyDisplayProps {
  /** Monetary value to display */
  value: number;
  /** ISO 4217 currency code (e.g., "USD", "EUR", "CNY") */
  currency: string;
  /** Override locale for formatting */
  locale?: string;
  /** Notation style */
  notation?: CurrencyNotation;
  /** Currency display style */
  currencyDisplay?: CurrencyDisplayStyle;
  /** Minimum fraction digits */
  minimumFractionDigits?: number;
  /** Maximum fraction digits */
  maximumFractionDigits?: number;
  /** Show positive sign for positive values */
  signDisplay?: 'auto' | 'always' | 'exceptZero' | 'never';
  /** Additional className */
  className?: string;
  /** HTML tag to render (default: span) */
  as?: React.ElementType;
}

/**
 * CurrencyDisplay Component
 */
export function CurrencyDisplay({
  value,
  currency,
  locale: localeProp,
  notation = 'standard',
  currencyDisplay = 'symbol',
  minimumFractionDigits,
  maximumFractionDigits,
  signDisplay = 'auto',
  className,
  as: Component = 'span',
}: CurrencyDisplayProps) {
  const { locale: contextLocale } = useI18n();
  const locale = localeProp || contextLocale;

  const formattedValue = useMemo(() => {
    try {
      const formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        notation,
        currencyDisplay,
        minimumFractionDigits,
        maximumFractionDigits,
        signDisplay,
      });
      return formatter.format(value);
    } catch (error) {
      // Fallback for unsupported currencies or locales
      console.warn(`[CurrencyDisplay] Formatting error:`, error);
      return `${currency} ${value.toFixed(2)}`;
    }
  }, [
    value,
    currency,
    locale,
    notation,
    currencyDisplay,
    minimumFractionDigits,
    maximumFractionDigits,
    signDisplay,
  ]);

  return <Component className={className}>{formattedValue}</Component>;
}

/**
 * Format currency value (utility function)
 */
export function formatCurrency(
  value: number,
  currency: string,
  locale: string,
  options?: Partial<Omit<CurrencyDisplayProps, 'value' | 'currency' | 'locale' | 'className' | 'as'>>
): string {
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: options?.notation || 'standard',
      currencyDisplay: options?.currencyDisplay || 'symbol',
      minimumFractionDigits: options?.minimumFractionDigits,
      maximumFractionDigits: options?.maximumFractionDigits,
      signDisplay: options?.signDisplay || 'auto',
    });
    return formatter.format(value);
  } catch (error) {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export default CurrencyDisplay;
