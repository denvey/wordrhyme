/**
 * RTL Utilities Unit Tests
 *
 * Tests for RTL detection and utilities in the frontend.
 */
import { describe, it, expect } from 'vitest';
import {
  isRTLLocale,
  getTextDirection,
  RTL_LOCALES,
  rtlClasses,
} from '../../../components/i18n/rtl-utils';

describe('RTL Utilities', () => {
  describe('RTL_LOCALES', () => {
    it('should include common RTL locales', () => {
      expect(RTL_LOCALES.has('ar')).toBe(true);
      expect(RTL_LOCALES.has('ar-SA')).toBe(true);
      expect(RTL_LOCALES.has('ar-EG')).toBe(true);
      expect(RTL_LOCALES.has('ar-AE')).toBe(true);
      expect(RTL_LOCALES.has('ar-MA')).toBe(true);
      expect(RTL_LOCALES.has('he')).toBe(true);
      expect(RTL_LOCALES.has('he-IL')).toBe(true);
      expect(RTL_LOCALES.has('fa')).toBe(true);
      expect(RTL_LOCALES.has('fa-IR')).toBe(true);
      expect(RTL_LOCALES.has('ur')).toBe(true);
      expect(RTL_LOCALES.has('ur-PK')).toBe(true);
    });

    it('should not include LTR locales', () => {
      expect(RTL_LOCALES.has('en')).toBe(false);
      expect(RTL_LOCALES.has('en-US')).toBe(false);
      expect(RTL_LOCALES.has('zh')).toBe(false);
      expect(RTL_LOCALES.has('zh-CN')).toBe(false);
    });
  });

  describe('isRTLLocale', () => {
    it('should return true for RTL locales', () => {
      expect(isRTLLocale('ar')).toBe(true);
      expect(isRTLLocale('ar-SA')).toBe(true);
      expect(isRTLLocale('ar-EG')).toBe(true);
      expect(isRTLLocale('he')).toBe(true);
      expect(isRTLLocale('he-IL')).toBe(true);
      expect(isRTLLocale('fa')).toBe(true);
      expect(isRTLLocale('fa-IR')).toBe(true);
      expect(isRTLLocale('ur')).toBe(true);
      expect(isRTLLocale('ur-PK')).toBe(true);
    });

    it('should return false for LTR locales', () => {
      expect(isRTLLocale('en')).toBe(false);
      expect(isRTLLocale('en-US')).toBe(false);
      expect(isRTLLocale('en-GB')).toBe(false);
      expect(isRTLLocale('zh-CN')).toBe(false);
      expect(isRTLLocale('zh-TW')).toBe(false);
      expect(isRTLLocale('ja-JP')).toBe(false);
      expect(isRTLLocale('ko-KR')).toBe(false);
      expect(isRTLLocale('de-DE')).toBe(false);
      expect(isRTLLocale('fr-FR')).toBe(false);
    });

    it('should detect RTL from base language code', () => {
      // Arabic variants should all be RTL via 'ar' base
      expect(isRTLLocale('ar-AE')).toBe(true);
      expect(isRTLLocale('ar-KW')).toBe(true);
      expect(isRTLLocale('ar-QA')).toBe(true);
      expect(isRTLLocale('ar-LB')).toBe(true);
    });

    it('should return false for unknown locales', () => {
      expect(isRTLLocale('unknown')).toBe(false);
      expect(isRTLLocale('xyz')).toBe(false);
      expect(isRTLLocale('')).toBe(false);
    });
  });

  describe('getTextDirection', () => {
    it('should return rtl for RTL locales', () => {
      expect(getTextDirection('ar')).toBe('rtl');
      expect(getTextDirection('ar-SA')).toBe('rtl');
      expect(getTextDirection('he')).toBe('rtl');
      expect(getTextDirection('fa')).toBe('rtl');
    });

    it('should return ltr for LTR locales', () => {
      expect(getTextDirection('en')).toBe('ltr');
      expect(getTextDirection('en-US')).toBe('ltr');
      expect(getTextDirection('zh-CN')).toBe('ltr');
    });

    it('should default to ltr for unknown locales', () => {
      expect(getTextDirection('unknown')).toBe('ltr');
      expect(getTextDirection('xyz')).toBe('ltr');
    });
  });

  describe('rtlClasses', () => {
    it('should provide flex row reverse classes', () => {
      expect(rtlClasses.flexRowReverse).toBe('flex-row rtl:flex-row-reverse');
    });

    it('should provide icon flip classes', () => {
      expect(rtlClasses.iconFlip).toBe('rtl:-scale-x-100');
    });

    it('should provide arrow forward classes', () => {
      expect(rtlClasses.arrowForward).toBe('rtl:rotate-180');
    });

    it('should provide arrow backward classes', () => {
      expect(rtlClasses.arrowBackward).toBe('ltr:rotate-180');
    });
  });
});
