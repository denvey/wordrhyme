/**
 * getI18nValue Unit Tests
 *
 * Tests for the content data i18n helper function.
 */
import { describe, it, expect } from 'vitest';
import {
  getI18nValue,
  hasI18nValue,
  getI18nLocales,
  setI18nValue,
  removeI18nValue,
  mergeI18nFields,
} from '../../i18n/get-i18n-value';

describe('getI18nValue', () => {
  const sampleField = {
    'en-US': 'Hello',
    'zh-CN': '你好',
    'ja-JP': 'こんにちは',
  };

  describe('basic extraction', () => {
    it('should return exact locale match', () => {
      expect(getI18nValue(sampleField, 'en-US')).toBe('Hello');
      expect(getI18nValue(sampleField, 'zh-CN')).toBe('你好');
      expect(getI18nValue(sampleField, 'ja-JP')).toBe('こんにちは');
    });

    it('should return all translations when no locale specified', () => {
      const result = getI18nValue(sampleField);
      expect(result).toEqual(sampleField);
    });

    it('should use fallback locale when primary not found', () => {
      expect(getI18nValue(sampleField, 'fr-FR', 'en-US')).toBe('Hello');
    });

    it('should try language code fallback', () => {
      const field = { en: 'Hello English' };
      expect(getI18nValue(field, 'en-GB')).toBe('Hello English');
    });

    it('should return first value as last resort', () => {
      expect(getI18nValue(sampleField, 'ko-KR')).toBe('Hello');
    });
  });

  describe('edge cases', () => {
    it('should handle null field', () => {
      expect(getI18nValue(null, 'en-US')).toBeUndefined();
      expect(getI18nValue(null)).toBeUndefined();
    });

    it('should handle undefined field', () => {
      expect(getI18nValue(undefined, 'en-US')).toBeUndefined();
    });

    it('should handle empty object', () => {
      expect(getI18nValue({}, 'en-US')).toBeUndefined();
      expect(getI18nValue({})).toBeUndefined();
    });

    it('should handle non-object field', () => {
      expect(getI18nValue('not an object' as any, 'en-US')).toBeUndefined();
    });
  });
});

describe('hasI18nValue', () => {
  it('should return true for existing locale', () => {
    const field = { 'en-US': 'Hello' };
    expect(hasI18nValue(field, 'en-US')).toBe(true);
  });

  it('should return false for missing locale', () => {
    const field = { 'en-US': 'Hello' };
    expect(hasI18nValue(field, 'zh-CN')).toBe(false);
  });

  it('should return false for empty string value', () => {
    const field = { 'en-US': '' };
    expect(hasI18nValue(field, 'en-US')).toBe(false);
  });

  it('should return false for null/undefined field', () => {
    expect(hasI18nValue(null, 'en-US')).toBe(false);
    expect(hasI18nValue(undefined, 'en-US')).toBe(false);
  });
});

describe('getI18nLocales', () => {
  it('should return all locales with non-empty values', () => {
    const field = {
      'en-US': 'Hello',
      'zh-CN': '你好',
      'empty': '',
    };
    const locales = getI18nLocales(field);
    expect(locales).toContain('en-US');
    expect(locales).toContain('zh-CN');
    expect(locales).not.toContain('empty');
  });

  it('should return empty array for null/undefined', () => {
    expect(getI18nLocales(null)).toEqual([]);
    expect(getI18nLocales(undefined)).toEqual([]);
  });
});

describe('setI18nValue', () => {
  it('should add a new locale', () => {
    const field = { 'en-US': 'Hello' };
    const result = setI18nValue(field, 'zh-CN', '你好');
    expect(result).toEqual({
      'en-US': 'Hello',
      'zh-CN': '你好',
    });
  });

  it('should update existing locale', () => {
    const field = { 'en-US': 'Hello' };
    const result = setI18nValue(field, 'en-US', 'Hi');
    expect(result['en-US']).toBe('Hi');
  });

  it('should handle null field', () => {
    const result = setI18nValue(null, 'en-US', 'Hello');
    expect(result).toEqual({ 'en-US': 'Hello' });
  });

  it('should be immutable', () => {
    const field = { 'en-US': 'Hello' };
    const result = setI18nValue(field, 'zh-CN', '你好');
    expect(field).toEqual({ 'en-US': 'Hello' });
    expect(result).not.toBe(field);
  });
});

describe('removeI18nValue', () => {
  it('should remove a locale', () => {
    const field = { 'en-US': 'Hello', 'zh-CN': '你好' };
    const result = removeI18nValue(field, 'zh-CN');
    expect(result).toEqual({ 'en-US': 'Hello' });
  });

  it('should handle null field', () => {
    const result = removeI18nValue(null, 'en-US');
    expect(result).toEqual({});
  });

  it('should be immutable', () => {
    const field = { 'en-US': 'Hello', 'zh-CN': '你好' };
    const result = removeI18nValue(field, 'zh-CN');
    expect(field).toEqual({ 'en-US': 'Hello', 'zh-CN': '你好' });
    expect(result).not.toBe(field);
  });
});

describe('mergeI18nFields', () => {
  it('should merge two fields', () => {
    const base = { 'en-US': 'Hello' };
    const override = { 'zh-CN': '你好' };
    const result = mergeI18nFields(base, override);
    expect(result).toEqual({
      'en-US': 'Hello',
      'zh-CN': '你好',
    });
  });

  it('should override existing values', () => {
    const base = { 'en-US': 'Hello' };
    const override = { 'en-US': 'Hi' };
    const result = mergeI18nFields(base, override);
    expect(result['en-US']).toBe('Hi');
  });

  it('should handle null fields', () => {
    expect(mergeI18nFields(null, { 'en-US': 'Hello' })).toEqual({ 'en-US': 'Hello' });
    expect(mergeI18nFields({ 'en-US': 'Hello' }, null)).toEqual({ 'en-US': 'Hello' });
    expect(mergeI18nFields(null, null)).toEqual({});
  });
});
