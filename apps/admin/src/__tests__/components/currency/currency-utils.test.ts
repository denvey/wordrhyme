/**
 * Currency Utility Tests
 *
 * Unit tests for currency conversion, formatting, and caching utilities.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  convertCurrency,
  bankersRound,
  toCents,
  fromCents,
  formatPrice,
  CurrencyInfo,
  DEFAULT_CURRENCY,
} from '../../../lib/currency/config';

// Mock currencies
const USD: CurrencyInfo = {
  code: 'USD',
  nameI18n: { 'en-US': 'US Dollar', 'zh-CN': '美元' },
  symbol: '$',
  decimalDigits: 2,
  isBase: true,
  currentRate: '1',
};

const CNY: CurrencyInfo = {
  code: 'CNY',
  nameI18n: { 'en-US': 'Chinese Yuan', 'zh-CN': '人民币' },
  symbol: '¥',
  decimalDigits: 2,
  isBase: false,
  currentRate: '7.25',
};

const JPY: CurrencyInfo = {
  code: 'JPY',
  nameI18n: { 'en-US': 'Japanese Yen', 'zh-CN': '日元' },
  symbol: '¥',
  decimalDigits: 0,
  isBase: false,
  currentRate: '149.50',
};

const EUR: CurrencyInfo = {
  code: 'EUR',
  nameI18n: { 'en-US': 'Euro', 'zh-CN': '欧元' },
  symbol: '€',
  decimalDigits: 2,
  isBase: false,
  currentRate: '0.92',
};

describe('Currency Utilities', () => {
  // ============================================================================
  // toCents / fromCents
  // ============================================================================

  describe('toCents()', () => {
    it('should convert display amount to cents for 2 decimal currency', () => {
      expect(toCents(19.99, 2)).toBe(1999);
      expect(toCents(100, 2)).toBe(10000);
      expect(toCents(0.01, 2)).toBe(1);
    });

    it('should convert display amount to cents for 0 decimal currency (JPY)', () => {
      expect(toCents(100, 0)).toBe(100);
      expect(toCents(1234, 0)).toBe(1234);
    });

    it('should convert display amount to cents for 3 decimal currency (KWD)', () => {
      expect(toCents(1.234, 3)).toBe(1234);
      expect(toCents(100, 3)).toBe(100000);
    });

    it('should handle zero', () => {
      expect(toCents(0, 2)).toBe(0);
      expect(toCents(0, 0)).toBe(0);
    });
  });

  describe('fromCents()', () => {
    it('should convert cents to display amount for 2 decimal currency', () => {
      expect(fromCents(1999, 2)).toBe(19.99);
      expect(fromCents(10000, 2)).toBe(100);
      expect(fromCents(1, 2)).toBe(0.01);
    });

    it('should convert cents to display amount for 0 decimal currency', () => {
      expect(fromCents(100, 0)).toBe(100);
      expect(fromCents(1234, 0)).toBe(1234);
    });

    it('should handle zero', () => {
      expect(fromCents(0, 2)).toBe(0);
      expect(fromCents(0, 0)).toBe(0);
    });
  });

  // ============================================================================
  // bankersRound
  // ============================================================================

  describe('bankersRound()', () => {
    it('should round 0.5 to even (0)', () => {
      expect(bankersRound(0.5, 0)).toBe(0);
    });

    it('should round 1.5 to even (2)', () => {
      expect(bankersRound(1.5, 0)).toBe(2);
    });

    it('should round 2.5 to even (2)', () => {
      expect(bankersRound(2.5, 0)).toBe(2);
    });

    it('should round 3.5 to even (4)', () => {
      expect(bankersRound(3.5, 0)).toBe(4);
    });

    it('should round normally for non-.5 values', () => {
      expect(bankersRound(2.4, 0)).toBe(2);
      expect(bankersRound(2.6, 0)).toBe(3);
      expect(bankersRound(3.4, 0)).toBe(3);
      expect(bankersRound(3.6, 0)).toBe(4);
    });

    it('should work with decimal places', () => {
      expect(bankersRound(1.125, 2)).toBe(1.12);
      expect(bankersRound(1.135, 2)).toBe(1.14);
      expect(bankersRound(1.145, 2)).toBe(1.14);
      expect(bankersRound(1.155, 2)).toBe(1.16);
    });
  });

  // ============================================================================
  // convertCurrency
  // ============================================================================

  describe('convertCurrency()', () => {
    it('should return same amount for same currency', () => {
      const result = convertCurrency(1999, USD, USD, USD);
      expect(result).toBe(1999);
    });

    it('should convert from base to target currency', () => {
      // USD to CNY: 1999 * 7.25 = 14493 (rounded)
      const result = convertCurrency(1999, USD, CNY, USD);
      expect(result).toBe(14493);
    });

    it('should convert from target to base currency', () => {
      // CNY to USD: 14493 / 7.25 ≈ 1999
      const result = convertCurrency(14493, CNY, USD, USD);
      expect(result).toBeCloseTo(1999, 0);
    });

    it('should convert between two non-base currencies', () => {
      // CNY to EUR: 725 cents CNY / 7.25 * 0.92 = 92 cents EUR
      const result = convertCurrency(725, CNY, EUR, USD);
      expect(result).toBe(92);
    });

    it('should handle zero amount', () => {
      const result = convertCurrency(0, USD, CNY, USD);
      expect(result).toBe(0);
    });

    it('should handle currencies without rate (fallback to 1)', () => {
      const noRate: CurrencyInfo = {
        ...CNY,
        currentRate: null,
      };
      const result = convertCurrency(1000, USD, noRate, USD);
      expect(result).toBe(1000); // No conversion
    });
  });

  // ============================================================================
  // formatPrice
  // ============================================================================

  describe('formatPrice()', () => {
    it('should format USD price', () => {
      const result = formatPrice(1999, USD, 'en-US');
      expect(result).toMatch(/\$?19\.99/);
    });

    it('should format CNY price', () => {
      const result = formatPrice(14493, CNY, 'zh-CN');
      expect(result).toMatch(/¥|CN¥|144\.93/);
    });

    it('should format JPY price (no decimals)', () => {
      const result = formatPrice(2980, JPY, 'ja-JP');
      expect(result).toMatch(/¥|JP¥|2[,.]?980/);
    });

    it('should format price without symbol', () => {
      const result = formatPrice(1999, USD, 'en-US', { showSymbol: false });
      expect(result).not.toContain('$');
      expect(result).toMatch(/19\.99/);
    });

    it('should handle zero amount', () => {
      const result = formatPrice(0, USD, 'en-US');
      expect(result).toMatch(/\$?0\.00/);
    });

    it('should use compact notation for large amounts', () => {
      const result = formatPrice(1000000, USD, 'en-US', { notation: 'compact' });
      // Compact notation varies by locale/version, just check it's shorter
      expect(result).toMatch(/\$?10.*K/);
    });
  });

  // ============================================================================
  // DEFAULT_CURRENCY
  // ============================================================================

  describe('DEFAULT_CURRENCY', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_CURRENCY.code).toBe('USD');
      expect(DEFAULT_CURRENCY.symbol).toBe('$');
      expect(DEFAULT_CURRENCY.decimalDigits).toBe(2);
      expect(DEFAULT_CURRENCY.isBase).toBe(true);
      expect(DEFAULT_CURRENCY.currentRate).toBe('1');
    });
  });
});
