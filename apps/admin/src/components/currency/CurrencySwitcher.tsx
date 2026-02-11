/**
 * CurrencySwitcher Component
 *
 * Dropdown selector for changing the display currency.
 * Automatically fetches available currencies from context.
 *
 * @example Basic usage
 * ```tsx
 * <CurrencySwitcher />
 * ```
 *
 * @example With custom styling
 * ```tsx
 * <CurrencySwitcher
 *   className="w-24"
 *   showCode={true}
 *   showSymbol={true}
 * />
 * ```
 */

import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@wordrhyme/ui';
import { useCurrencySwitcher } from '../../lib/currency';
import { useI18n } from '../../lib/i18n';

/**
 * Props for CurrencySwitcher component
 */
interface CurrencySwitcherProps {
  /** Additional className for the select trigger */
  className?: string;
  /** Show currency code (default: true) */
  showCode?: boolean;
  /** Show currency symbol (default: true) */
  showSymbol?: boolean;
  /** Show currency name (default: false) */
  showName?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Callback when currency changes */
  onCurrencyChange?: (currencyCode: string) => void;
}

/**
 * CurrencySwitcher Component
 */
export function CurrencySwitcher({
  className,
  showCode = true,
  showSymbol = true,
  showName = false,
  disabled = false,
  onCurrencyChange,
}: CurrencySwitcherProps) {
  const { currentCurrency, availableCurrencies, isChanging, switchTo } =
    useCurrencySwitcher();
  const { locale } = useI18n();

  const handleChange = (value: string) => {
    switchTo(value);
    onCurrencyChange?.(value);
  };

  // Format display text for a currency
  const formatCurrencyDisplay = (currency: typeof currentCurrency) => {
    const parts: string[] = [];

    if (showSymbol) {
      parts.push(currency.symbol);
    }
    if (showCode) {
      parts.push(currency.code);
    }
    if (showName) {
      const name = currency.nameI18n[locale] ?? currency.nameI18n['en-US'] ?? '';
      if (name) {
        parts.push(name);
      }
    }

    return parts.join(' ');
  };

  if (availableCurrencies.length <= 1) {
    // Only one currency, no need to show switcher
    return null;
  }

  return (
    <Select
      value={currentCurrency.code}
      onValueChange={handleChange}
      disabled={disabled || isChanging}
    >
      <SelectTrigger className={className}>
        <SelectValue>
          {formatCurrencyDisplay(currentCurrency)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {availableCurrencies.map((currency) => (
          <SelectItem key={currency.code} value={currency.code}>
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">{currency.symbol}</span>
              <span>{currency.code}</span>
              {showName && (
                <span className="text-muted-foreground text-sm">
                  {currency.nameI18n[locale] ?? currency.nameI18n['en-US']}
                </span>
              )}
              {currency.isBase && (
                <span className="text-xs text-muted-foreground">(Base)</span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * CurrencyBadge Component
 *
 * Simple badge showing current currency.
 *
 * @example
 * ```tsx
 * <CurrencyBadge />
 * // Displays: USD or $ USD
 * ```
 */
interface CurrencyBadgeProps {
  /** Additional className */
  className?: string;
  /** Show symbol (default: true) */
  showSymbol?: boolean;
}

export function CurrencyBadge({
  className = '',
  showSymbol = true,
}: CurrencyBadgeProps) {
  const { currentCurrency } = useCurrencySwitcher();

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-sm ${className}`}
    >
      {showSymbol && (
        <span className="text-muted-foreground">{currentCurrency.symbol}</span>
      )}
      <span>{currentCurrency.code}</span>
    </span>
  );
}

export default CurrencySwitcher;
