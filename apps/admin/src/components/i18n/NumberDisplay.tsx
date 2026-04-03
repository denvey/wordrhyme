/**
 * NumberDisplay Component
 *
 * Displays numbers with proper locale-based formatting.
 * Supports various number formats: decimal, percent, unit, etc.
 *
 * @example Basic usage
 * ```tsx
 * <NumberDisplay value={1234567.89} />
 * // zh-CN: 1,234,567.89
 * // de-DE: 1.234.567,89
 * ```
 *
 * @example Percentage
 * ```tsx
 * <NumberDisplay value={0.156} style="percent" />
 * // Displays: 15.6%
 * ```
 *
 * @example Compact notation
 * ```tsx
 * <NumberDisplay value={1234567} notation="compact" />
 * // en-US: 1.2M
 * // zh-CN: 123万
 * ```
 *
 * @example With unit
 * ```tsx
 * <NumberDisplay value={100} style="unit" unit="kilometer" />
 * // Displays: 100 km
 * ```
 */

import type React from 'react';
import { useMemo } from 'react';
import { useI18n } from '../../lib/i18n';

/**
 * Number style options
 */
type NumberStyle = 'decimal' | 'percent' | 'unit';

/**
 * Number notation options
 */
type NumberNotation = 'standard' | 'scientific' | 'engineering' | 'compact';

/**
 * Unit display options
 */
type UnitDisplay = 'short' | 'narrow' | 'long';

/**
 * Props for NumberDisplay component
 */
interface NumberDisplayProps {
  /** Number value to display */
  value: number;
  /** Number format style */
  style?: NumberStyle;
  /** Notation style */
  notation?: NumberNotation;
  /** Override locale for formatting */
  locale?: string;
  /** Unit for unit style (e.g., "kilometer", "kilogram", "celsius") */
  unit?: string;
  /** Unit display style */
  unitDisplay?: UnitDisplay;
  /** Minimum integer digits */
  minimumIntegerDigits?: number;
  /** Minimum fraction digits */
  minimumFractionDigits?: number;
  /** Maximum fraction digits */
  maximumFractionDigits?: number;
  /** Minimum significant digits */
  minimumSignificantDigits?: number;
  /** Maximum significant digits */
  maximumSignificantDigits?: number;
  /** Use grouping separators */
  useGrouping?: boolean;
  /** Sign display option */
  signDisplay?: 'auto' | 'always' | 'exceptZero' | 'never';
  /** Additional className */
  className?: string;
  /** HTML tag to render (default: span) */
  as?: React.ElementType;
}

/**
 * NumberDisplay Component
 */
export function NumberDisplay({
  value,
  style = 'decimal',
  notation = 'standard',
  locale: localeProp,
  unit,
  unitDisplay = 'short',
  minimumIntegerDigits,
  minimumFractionDigits,
  maximumFractionDigits,
  minimumSignificantDigits,
  maximumSignificantDigits,
  useGrouping = true,
  signDisplay = 'auto',
  className,
  as: Component = 'span',
}: NumberDisplayProps) {
  const { locale: contextLocale } = useI18n();
  const locale = localeProp || contextLocale;

  const formattedValue = useMemo(() => {
    try {
      const options: Intl.NumberFormatOptions = {
        style,
        notation,
        useGrouping,
        signDisplay,
        minimumIntegerDigits,
        minimumFractionDigits,
        maximumFractionDigits,
        minimumSignificantDigits,
        maximumSignificantDigits,
      };

      // Add unit options if style is 'unit'
      if (style === 'unit' && unit) {
        options.unit = unit;
        options.unitDisplay = unitDisplay;
      }

      const formatter = new Intl.NumberFormat(locale, options);
      return formatter.format(value);
    } catch (error) {
      console.warn(`[NumberDisplay] Formatting error:`, error);
      return String(value);
    }
  }, [
    value,
    style,
    notation,
    locale,
    unit,
    unitDisplay,
    useGrouping,
    signDisplay,
    minimumIntegerDigits,
    minimumFractionDigits,
    maximumFractionDigits,
    minimumSignificantDigits,
    maximumSignificantDigits,
  ]);

  return <Component className={className}>{formattedValue}</Component>;
}

/**
 * Format number utility function
 */
export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions
): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch (error) {
    return String(value);
  }
}

/**
 * Format percentage utility function
 */
export function formatPercent(
  value: number,
  locale: string,
  options?: Omit<Intl.NumberFormatOptions, 'style'>
): string {
  try {
    return new Intl.NumberFormat(locale, { ...options, style: 'percent' }).format(value);
  } catch (error) {
    return `${(value * 100).toFixed(1)}%`;
  }
}

/**
 * Format compact number utility function
 */
export function formatCompact(
  value: number,
  locale: string,
  options?: Omit<Intl.NumberFormatOptions, 'notation'>
): string {
  try {
    return new Intl.NumberFormat(locale, { ...options, notation: 'compact' }).format(value);
  } catch (error) {
    return String(value);
  }
}

export default NumberDisplay;
