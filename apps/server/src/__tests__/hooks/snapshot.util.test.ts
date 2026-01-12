/**
 * Snapshot Utility Tests
 */

import { describe, it, expect } from 'vitest';
import { createSnapshot, pruneLargeObjects } from '../../hooks/snapshot.util';

describe('Snapshot Utilities', () => {
  describe('pruneLargeObjects', () => {
    it('should truncate long strings', () => {
      const input = { text: 'a'.repeat(200) };
      const result = pruneLargeObjects(input, { maxStringLength: 50, maxArrayLength: 5, maxDepth: 3 });

      expect(result.text).toHaveLength(53);  // 50 + '...'
      expect(result.text).toContain('...');
    });

    it('should limit array length', () => {
      const input = { items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
      const result = pruneLargeObjects(input, { maxStringLength: 100, maxArrayLength: 3, maxDepth: 3 });

      expect(result.items).toHaveLength(4);  // 3 items + '[+7 more]'
      expect(result.items[3]).toBe('[+7 more]');
    });

    it('should limit object depth', () => {
      const input = { a: { b: { c: { d: { e: 'deep' } } } } };
      const result = pruneLargeObjects(input, { maxStringLength: 100, maxArrayLength: 5, maxDepth: 2 });

      expect(result.a.b).toBe('[Object depth exceeded]');
    });

    it('should handle null and primitives', () => {
      expect(pruneLargeObjects(null, { maxStringLength: 100, maxArrayLength: 5, maxDepth: 3 })).toBeNull();
      expect(pruneLargeObjects(42, { maxStringLength: 100, maxArrayLength: 5, maxDepth: 3 })).toBe(42);
      expect(pruneLargeObjects(true, { maxStringLength: 100, maxArrayLength: 5, maxDepth: 3 })).toBe(true);
    });

    it('should handle undefined', () => {
      expect(pruneLargeObjects(undefined, { maxStringLength: 100, maxArrayLength: 5, maxDepth: 3 })).toBeUndefined();
    });

    it('should handle empty arrays and objects', () => {
      expect(pruneLargeObjects([], { maxStringLength: 100, maxArrayLength: 5, maxDepth: 3 })).toEqual([]);
      expect(pruneLargeObjects({}, { maxStringLength: 100, maxArrayLength: 5, maxDepth: 3 })).toEqual({});
    });

    it('should handle nested arrays', () => {
      const input = { data: [[1, 2], [3, 4, 5, 6, 7, 8]] };
      const result = pruneLargeObjects(input, { maxStringLength: 100, maxArrayLength: 3, maxDepth: 3 });

      expect(result.data).toHaveLength(2);
      expect(result.data[1]).toHaveLength(4);  // 3 items + '[+3 more]'
    });
  });

  describe('createSnapshot', () => {
    it('should create full clone in full mode', () => {
      const input = { a: 1, b: { c: 2 } };
      const result = createSnapshot(input, 'full');

      expect(result).toEqual(input);
      expect(result).not.toBe(input);
      expect(result.b).not.toBe(input.b);
    });

    it('should create pruned clone in lean mode', () => {
      const input = { text: 'a'.repeat(200) };
      const result = createSnapshot(input, 'lean') as { text: string };

      expect(result.text.length).toBeLessThan(200);
    });

    it('should use default lean options', () => {
      const input = { text: 'a'.repeat(200) };
      const result = createSnapshot(input, 'lean') as { text: string };

      // Default maxStringLength is 100
      expect(result.text).toHaveLength(103);  // 100 + '...'
    });

    it('should accept custom lean options', () => {
      const input = { text: 'a'.repeat(200) };
      const result = createSnapshot(input, 'lean', { maxStringLength: 50, maxArrayLength: 5, maxDepth: 3 }) as { text: string };

      expect(result.text).toHaveLength(53);  // 50 + '...'
    });
  });
});
