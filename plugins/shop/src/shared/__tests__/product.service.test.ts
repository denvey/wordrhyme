import { describe, it, expect } from 'vitest';
import {
    validateSPU,
    calculatePriceRange,
    calculateVariationPriceRange,
    mapProductInputToRecord,
} from '../product.service';

describe('validateSPU', () => {
    it('should accept valid alphanumeric SPU IDs', () => {
        expect(validateSPU('ABC123')).toEqual({ valid: true });
        expect(validateSPU('product-001')).toEqual({ valid: true });
        expect(validateSPU('sku_test')).toEqual({ valid: true });
    });

    it('should reject empty SPU ID', () => {
        expect(validateSPU('')).toEqual({ valid: false, reason: 'SPU ID is required' });
        expect(validateSPU('  ')).toEqual({ valid: false, reason: 'SPU ID is required' });
    });

    it('should reject SPU IDs with special characters', () => {
        const result = validateSPU('abc@123');
        expect(result.valid).toBe(false);
    });

    it('should reject SPU IDs exceeding 50 characters', () => {
        const result = validateSPU('a'.repeat(51));
        expect(result.valid).toBe(false);
    });
});

describe('calculatePriceRange', () => {
    it('should calculate min/max from price entries', () => {
        const entries = [
            { startQuantity: 1, price: '10.00' },
            { startQuantity: 10, price: '8.50' },
            { startQuantity: 100, price: '6.00' },
        ];
        expect(calculatePriceRange(entries)).toEqual({ min: 6, max: 10 });
    });

    it('should return null for empty entries', () => {
        expect(calculatePriceRange([])).toBeNull();
    });

    it('should handle single entry', () => {
        const entries = [{ startQuantity: 1, price: '15.99' }];
        expect(calculatePriceRange(entries)).toEqual({ min: 15.99, max: 15.99 });
    });

    it('should skip invalid price strings', () => {
        const entries = [
            { startQuantity: 1, price: 'N/A' },
            { startQuantity: 10, price: '5.00' },
        ];
        expect(calculatePriceRange(entries)).toEqual({ min: 5, max: 5 });
    });

    it('should return null when all prices are invalid', () => {
        const entries = [{ startQuantity: 1, price: 'invalid' }];
        expect(calculatePriceRange(entries)).toBeNull();
    });
});

describe('calculateVariationPriceRange', () => {
    it('should calculate from variation prices', () => {
        const prices = ['12.00', '8.50', '15.00'];
        expect(calculateVariationPriceRange(prices)).toEqual({ min: 8.5, max: 15 });
    });

    it('should skip undefined prices', () => {
        const prices = [undefined, '10.00', undefined, '5.00'];
        expect(calculateVariationPriceRange(prices)).toEqual({ min: 5, max: 10 });
    });

    it('should return null for all undefined', () => {
        expect(calculateVariationPriceRange([undefined, undefined])).toBeNull();
    });
});

describe('mapProductInputToRecord', () => {
    it('should map camelCase to snake_case', () => {
        const result = mapProductInputToRecord({
            name: 'Test Product',
            priceCents: 1999,
            stockStatus: 'instock',
        });

        expect(result).toEqual({
            name: 'Test Product',
            price_cents: 1999,
            stock_status: 'instock',
        });
    });

    it('should only include defined fields', () => {
        const result = mapProductInputToRecord({ name: 'Only Name' });
        expect(result).toEqual({ name: 'Only Name' });
        expect(result).not.toHaveProperty('description');
    });

    it('should JSON.stringify tags and priceRange', () => {
        const result = mapProductInputToRecord({
            tags: [{ key: 'color', value: 'red' }],
            priceRange: [{ startQuantity: 1, price: '10.00' }],
        });

        expect(result['tags']).toBe('[{"key":"color","value":"red"}]');
        expect(result['price_range']).toBe('[{"startQuantity":1,"price":"10.00"}]');
    });
});
