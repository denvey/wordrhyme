/**
 * Duration Parser Unit Tests
 */
import { describe, it, expect } from 'vitest';
import {
  parseDuration,
  isValidDuration,
  formatDuration,
} from '../../cache/duration-parser.js';
import { CacheSerializationError } from '../../cache/cache.errors.js';

describe('parseDuration', () => {
  describe('valid inputs', () => {
    it('should parse seconds', () => {
      expect(parseDuration('30s')).toBe(30);
      expect(parseDuration('1s')).toBe(1);
      expect(parseDuration('120s')).toBe(120);
    });

    it('should parse minutes', () => {
      expect(parseDuration('5m')).toBe(300);
      expect(parseDuration('1m')).toBe(60);
      expect(parseDuration('60m')).toBe(3600);
    });

    it('should parse hours', () => {
      expect(parseDuration('1h')).toBe(3600);
      expect(parseDuration('2h')).toBe(7200);
      expect(parseDuration('24h')).toBe(86400);
    });

    it('should parse days', () => {
      expect(parseDuration('1d')).toBe(86400);
      expect(parseDuration('7d')).toBe(604800);
    });

    it('should parse weeks', () => {
      expect(parseDuration('1w')).toBe(604800);
      expect(parseDuration('2w')).toBe(1209600);
    });

    it('should accept number input as seconds', () => {
      expect(parseDuration(300)).toBe(300);
      expect(parseDuration(3600)).toBe(3600);
    });

    it('should floor decimal numbers', () => {
      expect(parseDuration(300.9)).toBe(300);
      expect(parseDuration(100.1)).toBe(100);
    });
  });

  describe('invalid inputs', () => {
    it('should throw on invalid format', () => {
      expect(() => parseDuration('invalid')).toThrow(CacheSerializationError);
      expect(() => parseDuration('5')).toThrow(CacheSerializationError);
      expect(() => parseDuration('m5')).toThrow(CacheSerializationError);
      expect(() => parseDuration('')).toThrow(CacheSerializationError);
    });

    it('should throw on unknown unit', () => {
      expect(() => parseDuration('5x')).toThrow(CacheSerializationError);
      expect(() => parseDuration('10y')).toThrow(CacheSerializationError);
    });

    it('should throw on negative numbers', () => {
      expect(() => parseDuration(-100)).toThrow(CacheSerializationError);
      expect(() => parseDuration(-1)).toThrow(CacheSerializationError);
    });

    it('should throw on mixed formats', () => {
      expect(() => parseDuration('1h30m')).toThrow(CacheSerializationError);
      expect(() => parseDuration('1h 30m')).toThrow(CacheSerializationError);
    });
  });
});

describe('isValidDuration', () => {
  it('should return true for valid durations', () => {
    expect(isValidDuration('5m')).toBe(true);
    expect(isValidDuration('1h')).toBe(true);
    expect(isValidDuration('30s')).toBe(true);
    expect(isValidDuration(300)).toBe(true);
  });

  it('should return false for invalid durations', () => {
    expect(isValidDuration('invalid')).toBe(false);
    expect(isValidDuration('5x')).toBe(false);
    expect(isValidDuration(-1)).toBe(false);
  });
});

describe('formatDuration', () => {
  it('should format seconds', () => {
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(59)).toBe('59s');
  });

  it('should format minutes', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(300)).toBe('5m');
    expect(formatDuration(3599)).toBe('59m');
  });

  it('should format hours', () => {
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(7200)).toBe('2h');
    expect(formatDuration(86399)).toBe('23h');
  });

  it('should format days', () => {
    expect(formatDuration(86400)).toBe('1d');
    expect(formatDuration(172800)).toBe('2d');
    expect(formatDuration(604800)).toBe('7d');
  });
});
