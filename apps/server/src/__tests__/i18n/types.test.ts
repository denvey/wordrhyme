/**
 * i18n Types Unit Tests
 *
 * Tests for RTL detection and text direction utilities.
 */
import { describe, it, expect } from 'vitest';
import {
  getTextDirection,
  RTL_LOCALES,
  DEFAULT_LOCALE,
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  createDefaultGlobalizationContext,
} from '../../i18n/types';

describe('RTL Detection', () => {
  describe('RTL_LOCALES set', () => {
    it('should contain Arabic locales', () => {
      expect(RTL_LOCALES.has('ar')).toBe(true);
      expect(RTL_LOCALES.has('ar-SA')).toBe(true);
      expect(RTL_LOCALES.has('ar-EG')).toBe(true);
      expect(RTL_LOCALES.has('ar-AE')).toBe(true);
    });

    it('should contain Hebrew locales', () => {
      expect(RTL_LOCALES.has('he')).toBe(true);
      expect(RTL_LOCALES.has('he-IL')).toBe(true);
    });

    it('should contain Persian locale', () => {
      expect(RTL_LOCALES.has('fa')).toBe(true);
      expect(RTL_LOCALES.has('fa-IR')).toBe(true);
    });

    it('should contain Urdu locale', () => {
      expect(RTL_LOCALES.has('ur')).toBe(true);
      expect(RTL_LOCALES.has('ur-PK')).toBe(true);
    });

    it('should not contain LTR locales', () => {
      expect(RTL_LOCALES.has('en')).toBe(false);
      expect(RTL_LOCALES.has('zh')).toBe(false);
      expect(RTL_LOCALES.has('ja')).toBe(false);
    });
  });

  describe('getTextDirection', () => {
    it('should return rtl for RTL locales', () => {
      expect(getTextDirection('ar')).toBe('rtl');
      expect(getTextDirection('ar-SA')).toBe('rtl');
      expect(getTextDirection('he-IL')).toBe('rtl');
      expect(getTextDirection('fa')).toBe('rtl');
    });

    it('should return ltr for LTR locales', () => {
      expect(getTextDirection('en')).toBe('ltr');
      expect(getTextDirection('en-US')).toBe('ltr');
      expect(getTextDirection('zh-CN')).toBe('ltr');
      expect(getTextDirection('ja-JP')).toBe('ltr');
    });

    it('should detect RTL from language code for unknown variants', () => {
      // ar-MA (Arabic Morocco) should be detected as RTL via 'ar' base
      expect(getTextDirection('ar-MA')).toBe('rtl');
      expect(getTextDirection('ar-DZ')).toBe('rtl');
    });

    it('should default to ltr for unknown locales', () => {
      expect(getTextDirection('unknown')).toBe('ltr');
      expect(getTextDirection('')).toBe('ltr');
      expect(getTextDirection('xyz')).toBe('ltr');
    });
  });
});

describe('Default Constants', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_LOCALE).toBe('zh-CN');
    expect(DEFAULT_CURRENCY).toBe('CNY');
    expect(DEFAULT_TIMEZONE).toBe('Asia/Shanghai');
  });
});

describe('createDefaultGlobalizationContext', () => {
  it('should create context with all defaults', () => {
    const context = createDefaultGlobalizationContext();

    expect(context).toEqual({
      locale: 'zh-CN',
      currency: 'CNY',
      timezone: 'Asia/Shanghai',
      direction: 'ltr',
      fallbackLocale: 'zh-CN',
    });
  });

  it('should allow locale override', () => {
    const context = createDefaultGlobalizationContext({ locale: 'ar-SA' });

    expect(context.locale).toBe('ar-SA');
    expect(context.direction).toBe('rtl'); // Auto-detected from locale
  });

  it('should allow all overrides', () => {
    const context = createDefaultGlobalizationContext({
      locale: 'en-US',
      currency: 'USD',
      timezone: 'America/New_York',
      direction: 'ltr',
      fallbackLocale: 'en-GB',
    });

    expect(context).toEqual({
      locale: 'en-US',
      currency: 'USD',
      timezone: 'America/New_York',
      direction: 'ltr',
      fallbackLocale: 'en-GB',
    });
  });

  it('should auto-detect direction if not provided', () => {
    const rtlContext = createDefaultGlobalizationContext({ locale: 'he-IL' });
    expect(rtlContext.direction).toBe('rtl');

    const ltrContext = createDefaultGlobalizationContext({ locale: 'fr-FR' });
    expect(ltrContext.direction).toBe('ltr');
  });
});
