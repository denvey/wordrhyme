/**
 * Smart Components Unit Tests
 *
 * Tests for i18n formatting utility functions.
 * Note: Tests pure formatting functions only to avoid vitest path resolution issues.
 */
import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../../../components/i18n/CurrencyDisplay';
import { formatDate, formatRelativeTime } from '../../../components/i18n/DateTimeDisplay';
import { formatNumber, formatPercent, formatCompact } from '../../../components/i18n/NumberDisplay';

describe('formatCurrency', () => {
  it('should format USD correctly for en-US', () => {
    const result = formatCurrency(1234.56, 'USD', 'en-US');
    expect(result).toContain('1,234.56');
    expect(result).toMatch(/\$|USD/);
  });

  it('should format EUR correctly for de-DE', () => {
    const result = formatCurrency(1234.56, 'EUR', 'de-DE');
    // German uses comma for decimal, period for thousands
    expect(result).toContain('1.234,56');
  });

  it('should format CNY correctly for zh-CN', () => {
    const result = formatCurrency(1234.56, 'CNY', 'zh-CN');
    expect(result).toMatch(/¥|CNY|元/);
  });

  it('should handle invalid currency gracefully', () => {
    const result = formatCurrency(100, 'INVALID', 'en-US');
    // Should fallback without throwing
    expect(result).toBeDefined();
    expect(result).toContain('100'); // At least contains the value
  });

  it('should support compact notation', () => {
    const result = formatCurrency(1234567, 'USD', 'en-US', { notation: 'compact' });
    expect(result).toBeDefined();
  });
});

describe('formatDate', () => {
  const testDate = new Date('2024-06-15T10:30:00Z');

  it('should format date with short format', () => {
    const result = formatDate(testDate, 'en-US', 'short');
    expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
  });

  it('should format date with long format', () => {
    const result = formatDate(testDate, 'en-US', 'long');
    expect(result).toContain('June');
    expect(result).toContain('2024');
  });

  it('should format date for different locales', () => {
    const enResult = formatDate(testDate, 'en-US', 'medium');
    const zhResult = formatDate(testDate, 'zh-CN', 'medium');

    // Different locales should produce different formats
    expect(enResult).not.toBe(zhResult);
  });

  it('should handle string dates', () => {
    const result = formatDate('2024-06-15', 'en-US', 'short');
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle timestamps', () => {
    const result = formatDate(Date.now(), 'en-US', 'short');
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should support time format', () => {
    const result = formatDate(testDate, 'en-US', 'time');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('formatNumber', () => {
  it('should format with thousand separators', () => {
    const result = formatNumber(1234567, 'en-US');
    expect(result).toBe('1,234,567');
  });

  it('should format differently for different locales', () => {
    const enResult = formatNumber(1234567.89, 'en-US');
    const deResult = formatNumber(1234567.89, 'de-DE');

    expect(enResult).toContain(','); // thousand separator
    expect(deResult).toContain('.'); // German uses . for thousands
  });

  it('should handle decimal places', () => {
    const result = formatNumber(1234.5678, 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(result).toBe('1,234.57');
  });

  it('should handle negative numbers', () => {
    const result = formatNumber(-1234, 'en-US');
    expect(result).toContain('-');
    expect(result).toContain('1,234');
  });
});

describe('formatPercent', () => {
  it('should format decimal as percentage', () => {
    const result = formatPercent(0.1234, 'en-US');
    expect(result).toContain('12');
    expect(result).toContain('%');
  });

  it('should handle 100%', () => {
    const result = formatPercent(1, 'en-US');
    expect(result).toContain('100');
  });

  it('should handle values over 100%', () => {
    const result = formatPercent(1.5, 'en-US');
    expect(result).toContain('150');
  });

  it('should handle negative percentages', () => {
    const result = formatPercent(-0.25, 'en-US');
    expect(result).toContain('-');
    expect(result).toContain('25');
  });
});

describe('formatCompact', () => {
  it('should format large numbers compactly for en-US', () => {
    const result = formatCompact(1234567, 'en-US');
    // Should be something like "1.2M" or "1.23M"
    expect(result).toMatch(/1\.?\d*M/i);
  });

  it('should format for zh-CN with Chinese units', () => {
    const result = formatCompact(12345678, 'zh-CN');
    // Chinese uses 万 (10K) and 亿 (100M) units
    expect(result).toBeDefined();
    expect(result.length).toBeLessThan(10); // Should be compact
  });

  it('should handle small numbers', () => {
    const result = formatCompact(123, 'en-US');
    expect(result).toBe('123');
  });

  it('should handle thousands', () => {
    const result = formatCompact(1500, 'en-US');
    expect(result).toMatch(/1\.?5?K/i);
  });

  it('should handle billions', () => {
    const result = formatCompact(1234567890, 'en-US');
    expect(result).toMatch(/1\.?\d*B/i);
  });
});

describe('formatRelativeTime', () => {
  it('should format recent past as "X minutes ago"', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = formatRelativeTime(fiveMinutesAgo, 'en-US');
    expect(result).toMatch(/\d+\s*(minutes?|min)/i);
  });

  it('should format future dates', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = formatRelativeTime(tomorrow, 'en-US');
    expect(result).toMatch(/in\s+\d+|tomorrow/i);
  });

  it('should format for different locales', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const enResult = formatRelativeTime(yesterday, 'en-US');
    const zhResult = formatRelativeTime(yesterday, 'zh-CN');

    // Different locales should produce different text
    expect(enResult).not.toBe(zhResult);
  });

  it('should handle seconds ago', () => {
    const tenSecondsAgo = new Date(Date.now() - 10 * 1000);
    const result = formatRelativeTime(tenSecondsAgo, 'en-US');
    expect(result).toBeDefined();
  });

  it('should handle weeks', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const result = formatRelativeTime(twoWeeksAgo, 'en-US');
    expect(result).toMatch(/2\s*weeks?\s*ago/i);
  });
});
