/**
 * DateTimeDisplay Component
 *
 * Displays dates and times with proper locale-based formatting.
 * Supports relative time display and various format presets.
 *
 * @example Basic usage
 * ```tsx
 * <DateTimeDisplay value={new Date()} />
 * ```
 *
 * @example With format preset
 * ```tsx
 * <DateTimeDisplay value={date} format="short" />
 * <DateTimeDisplay value={date} format="long" />
 * <DateTimeDisplay value={date} format="time" />
 * ```
 *
 * @example Relative time
 * ```tsx
 * <DateTimeDisplay value={date} relative />
 * // Displays: "2 hours ago" or "in 3 days"
 * ```
 */

import type React from 'react';
import { useMemo } from 'react';
import { useI18n } from '../../lib/i18n';

/**
 * Date format presets
 */
type DateFormatPreset = 'short' | 'medium' | 'long' | 'full' | 'time' | 'date' | 'datetime';

/**
 * Props for DateTimeDisplay component
 */
interface DateTimeDisplayProps {
  /** Date value to display */
  value: Date | string | number;
  /** Format preset */
  format?: DateFormatPreset;
  /** Override locale for formatting */
  locale?: string;
  /** Timezone (e.g., "America/New_York", "Asia/Shanghai") */
  timezone?: string;
  /** Show relative time (e.g., "2 hours ago") */
  relative?: boolean;
  /** Custom Intl.DateTimeFormat options (overrides format preset) */
  options?: Intl.DateTimeFormatOptions;
  /** Additional className */
  className?: string;
  /** HTML tag to render (default: time) */
  as?: React.ElementType;
}

/**
 * Format presets mapping
 */
const FORMAT_PRESETS: Record<DateFormatPreset, Intl.DateTimeFormatOptions> = {
  short: {
    dateStyle: 'short',
  },
  medium: {
    dateStyle: 'medium',
  },
  long: {
    dateStyle: 'long',
  },
  full: {
    dateStyle: 'full',
  },
  time: {
    timeStyle: 'short',
  },
  date: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  },
  datetime: {
    dateStyle: 'medium',
    timeStyle: 'short',
  },
};

/**
 * Relative time thresholds (in seconds)
 */
const RELATIVE_THRESHOLDS = [
  { threshold: 60, unit: 'second' as const },
  { threshold: 60 * 60, unit: 'minute' as const },
  { threshold: 60 * 60 * 24, unit: 'hour' as const },
  { threshold: 60 * 60 * 24 * 7, unit: 'day' as const },
  { threshold: 60 * 60 * 24 * 30, unit: 'week' as const },
  { threshold: 60 * 60 * 24 * 365, unit: 'month' as const },
  { threshold: Number.POSITIVE_INFINITY, unit: 'year' as const },
];

/**
 * Get relative time string
 */
function getRelativeTime(date: Date, locale: string): string {
  const now = Date.now();
  const diffInSeconds = (date.getTime() - now) / 1000;
  const absDiff = Math.abs(diffInSeconds);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (let i = 0; i < RELATIVE_THRESHOLDS.length; i++) {
    const { threshold, unit } = RELATIVE_THRESHOLDS[i]!;
    const prevThreshold = i > 0 ? RELATIVE_THRESHOLDS[i - 1]!.threshold : 1;

    if (absDiff < threshold) {
      const value = Math.round(diffInSeconds / prevThreshold);
      return rtf.format(value, unit);
    }
  }

  // Fallback (should never reach)
  return rtf.format(Math.round(diffInSeconds / (60 * 60 * 24 * 365)), 'year');
}

/**
 * DateTimeDisplay Component
 */
export function DateTimeDisplay({
  value,
  format = 'medium',
  locale: localeProp,
  timezone,
  relative = false,
  options,
  className,
  as: Component = 'time',
}: DateTimeDisplayProps) {
  const { locale: contextLocale } = useI18n();
  const locale = localeProp || contextLocale;

  const date = useMemo(() => {
    if (value instanceof Date) return value;
    return new Date(value);
  }, [value]);

  const formattedValue = useMemo(() => {
    try {
      if (relative) {
        return getRelativeTime(date, locale);
      }

      const formatOptions: Intl.DateTimeFormatOptions = {
        ...FORMAT_PRESETS[format],
        ...options,
        ...(timezone ? { timeZone: timezone } : {}),
      };

      const formatter = new Intl.DateTimeFormat(locale, formatOptions);
      return formatter.format(date);
    } catch (error) {
      console.warn(`[DateTimeDisplay] Formatting error:`, error);
      return date.toLocaleString();
    }
  }, [date, format, locale, timezone, relative, options]);

  // ISO string for datetime attribute (accessibility)
  const isoString = date.toISOString();

  if (Component === 'time') {
    return (
      <time dateTime={isoString} className={className}>
        {formattedValue}
      </time>
    );
  }

  return <Component className={className}>{formattedValue}</Component>;
}

/**
 * Format date utility function
 */
export function formatDate(
  value: Date | string | number,
  locale: string,
  format: DateFormatPreset = 'medium',
  options?: Intl.DateTimeFormatOptions
): string {
  const date = value instanceof Date ? value : new Date(value);

  try {
    const formatOptions: Intl.DateTimeFormatOptions = {
      ...FORMAT_PRESETS[format],
      ...options,
    };
    return new Intl.DateTimeFormat(locale, formatOptions).format(date);
  } catch (error) {
    return date.toLocaleString();
  }
}

/**
 * Format relative time utility function
 */
export function formatRelativeTime(value: Date | string | number, locale: string): string {
  const date = value instanceof Date ? value : new Date(value);
  return getRelativeTime(date, locale);
}

export default DateTimeDisplay;
