/**
 * @wordrhyme/shop-core - Product Service
 *
 * Pure business logic for product management.
 * No I/O, no framework dependencies.
 */
import type { PriceRange, PriceRangeEntry, ValidationResult } from './schemas';

const SPU_REGEX = /^[A-Za-z0-9\-_]{1,50}$/;

/**
 * Validate SPU business code format.
 * Note: spuId is an auto-generated internal numeric id; this validates spuCode.
 */
export function validateSpuCode(spuCode: string): ValidationResult {
    if (!spuCode || spuCode.trim().length === 0) {
        return { valid: false, reason: 'SPU code is required' };
    }
    if (!SPU_REGEX.test(spuCode)) {
        return { valid: false, reason: 'SPU code must be 1-50 alphanumeric characters, hyphens, or underscores' };
    }
    return { valid: true };
}

/**
 * Calculate price range from a list of price range entries
 */
export function calculatePriceRange(entries: PriceRangeEntry[]): PriceRange | null {
    if (!entries || entries.length === 0) return null;

    const prices = entries.map(e => Number.parseFloat(e.price)).filter(p => !isNaN(p));
    if (prices.length === 0) return null;

    return {
        min: Math.min(...prices),
        max: Math.max(...prices),
    };
}

/**
 * Calculate price range from variation prices
 */
export function calculateVariationPriceRange(prices: (string | undefined)[]): PriceRange | null {
    const numericPrices = prices
        .filter((p): p is string => p !== undefined && p !== null)
        .map(p => Number.parseFloat(p))
        .filter(p => !isNaN(p));

    if (numericPrices.length === 0) return null;

    return {
        min: Math.min(...numericPrices),
        max: Math.max(...numericPrices),
    };
}
