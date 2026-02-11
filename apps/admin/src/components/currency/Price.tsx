/**
 * Price Component
 *
 * Displays monetary values using the currency context.
 * Automatically formats prices based on current currency and locale.
 *
 * @example Basic usage
 * ```tsx
 * <Price cents={9999} />
 * // Displays: $99.99 (if USD selected)
 * ```
 *
 * @example With options
 * ```tsx
 * <Price cents={1234567} notation="compact" />
 * // Displays: $12.3K
 * ```
 *
 * @example Custom currency
 * ```tsx
 * <Price cents={9999} currencyCode="EUR" />
 * // Displays: €99.99
 * ```
 */

import React, { useMemo } from 'react';
import { useCurrency, type FormatPriceOptions } from '../../lib/currency';

/**
 * Props for Price component
 */
interface PriceProps extends FormatPriceOptions {
  /** Amount in cents (smallest currency unit) */
  cents: number;
  /** Override currency code (optional, uses selected currency by default) */
  currencyCode?: string;
  /** Additional className */
  className?: string;
  /** HTML tag to render (default: span) */
  as?: React.ElementType;
}

/**
 * Price Component
 *
 * Renders a formatted price using the current currency context.
 * Uses Banker's rounding and locale-aware formatting.
 */
export function Price({
  cents,
  currencyCode,
  className,
  as: Component = 'span',
  ...options
}: PriceProps) {
  const { currency, currencies, p } = useCurrency();

  const formattedPrice = useMemo(() => {
    // If specific currency requested, find it and format
    if (currencyCode && currencyCode !== currency.code) {
      const targetCurrency = currencies.find((c) => c.code === currencyCode);
      if (targetCurrency) {
        // Import formatPrice directly for custom currency
        const { formatPrice } = require('../../lib/currency/config');
        const { locale } = require('../../lib/i18n').useI18n();
        return formatPrice(cents, targetCurrency, locale, options);
      }
    }
    // Use default p formatter with current currency
    return p(cents, options);
  }, [cents, currencyCode, currency.code, currencies, p, options]);

  return <Component className={className}>{formattedPrice}</Component>;
}

/**
 * PriceRange Component
 *
 * Displays a price range (min - max).
 *
 * @example
 * ```tsx
 * <PriceRange minCents={999} maxCents={4999} />
 * // Displays: $9.99 - $49.99
 * ```
 */
interface PriceRangeProps extends Omit<PriceProps, 'cents'> {
  /** Minimum price in cents */
  minCents: number;
  /** Maximum price in cents */
  maxCents: number;
  /** Separator between prices (default: ' - ') */
  separator?: string;
}

export function PriceRange({
  minCents,
  maxCents,
  separator = ' - ',
  className,
  as: Component = 'span',
  ...options
}: PriceRangeProps) {
  const { p } = useCurrency();

  const formattedRange = useMemo(() => {
    const min = p(minCents, options);
    const max = p(maxCents, options);
    return `${min}${separator}${max}`;
  }, [minCents, maxCents, separator, p, options]);

  return <Component className={className}>{formattedRange}</Component>;
}

/**
 * PriceWithOriginal Component
 *
 * Displays a price with its original (base currency) value.
 * Useful for showing converted prices with reference.
 *
 * @example
 * ```tsx
 * <PriceWithOriginal cents={72500} originalCents={9999} originalCurrency="USD" />
 * // Displays: ¥725.00 ($99.99)
 * ```
 */
interface PriceWithOriginalProps extends Omit<PriceProps, 'cents'> {
  /** Price in current currency (cents) */
  cents: number;
  /** Original price in base currency (cents) */
  originalCents: number;
  /** Original currency code */
  originalCurrency: string;
  /** Show original in parentheses (default: true) */
  showOriginal?: boolean;
}

export function PriceWithOriginal({
  cents,
  originalCents,
  originalCurrency,
  showOriginal = true,
  className,
  as: Component = 'span',
  ...options
}: PriceWithOriginalProps) {
  const { p, currency, currencies } = useCurrency();

  const formattedPrice = useMemo(() => {
    const main = p(cents, options);

    if (!showOriginal || originalCurrency === currency.code) {
      return main;
    }

    // Format original price
    const originalCurrencyInfo = currencies.find(
      (c) => c.code === originalCurrency
    );
    if (!originalCurrencyInfo) {
      return main;
    }

    const { formatPrice } = require('../../lib/currency/config');
    const { locale } = require('../../lib/i18n').useI18n();
    const original = formatPrice(originalCents, originalCurrencyInfo, locale, {
      ...options,
      showSymbol: true,
    });

    return `${main} (${original})`;
  }, [
    cents,
    originalCents,
    originalCurrency,
    showOriginal,
    currency.code,
    currencies,
    p,
    options,
  ]);

  return <Component className={className}>{formattedPrice}</Component>;
}

/**
 * PriceDiscount Component
 *
 * Displays a discounted price with strikethrough original.
 *
 * @example
 * ```tsx
 * <PriceDiscount originalCents={9999} discountedCents={7999} />
 * // Displays: <s>$99.99</s> $79.99
 * ```
 */
interface PriceDiscountProps extends Omit<PriceProps, 'cents'> {
  /** Original price in cents */
  originalCents: number;
  /** Discounted price in cents */
  discountedCents: number;
  /** Class for original (strikethrough) price */
  originalClassName?: string;
  /** Class for discounted price */
  discountedClassName?: string;
}

export function PriceDiscount({
  originalCents,
  discountedCents,
  originalClassName = 'line-through text-muted-foreground',
  discountedClassName = 'text-destructive font-semibold',
  className,
  ...options
}: PriceDiscountProps) {
  const { p } = useCurrency();

  return (
    <span className={className}>
      <span className={originalClassName}>{p(originalCents, options)}</span>{' '}
      <span className={discountedClassName}>{p(discountedCents, options)}</span>
    </span>
  );
}

export default Price;
