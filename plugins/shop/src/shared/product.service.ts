/**
 * @wordrhyme/shop-core - Product Service
 *
 * Pure business logic for product management.
 * No I/O, no framework dependencies.
 */
import type { PriceRange, PriceRangeEntry, ValidationResult, CreateProductInput } from './schemas';

const SPU_REGEX = /^[A-Za-z0-9\-_]{1,50}$/;

/**
 * Validate SPU ID format
 */
export function validateSPU(spuId: string): ValidationResult {
    if (!spuId || spuId.trim().length === 0) {
        return { valid: false, reason: 'SPU ID is required' };
    }
    if (!SPU_REGEX.test(spuId)) {
        return { valid: false, reason: 'SPU ID must be 1-50 alphanumeric characters, hyphens, or underscores' };
    }
    return { valid: true };
}

/**
 * Calculate price range from a list of price range entries
 */
export function calculatePriceRange(entries: PriceRangeEntry[]): PriceRange | null {
    if (!entries || entries.length === 0) return null;

    const prices = entries.map(e => parseFloat(e.price)).filter(p => !isNaN(p));
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
        .map(p => parseFloat(p))
        .filter(p => !isNaN(p));

    if (numericPrices.length === 0) return null;

    return {
        min: Math.min(...numericPrices),
        max: Math.max(...numericPrices),
    };
}

/**
 * Map camelCase product input to snake_case DB record.
 * Returns only defined fields (for partial updates).
 */
export function mapProductInputToRecord(
    input: { [K in keyof CreateProductInput]?: CreateProductInput[K] | undefined },
): Record<string, unknown> {
    const record: Record<string, unknown> = {};

    if (input.name !== undefined) record['name'] = input.name;
    if (input.description !== undefined) record['description'] = input.description;
    if (input.shortDescription !== undefined) record['short_description'] = input.shortDescription;
    if (input.seoTitle !== undefined) record['seo_title'] = input.seoTitle;
    if (input.seoDescription !== undefined) record['seo_description'] = input.seoDescription;
    if (input.status !== undefined) record['status'] = input.status;
    if (input.priceCents !== undefined) record['price_cents'] = input.priceCents;
    if (input.regularPriceCents !== undefined) record['regular_price_cents'] = input.regularPriceCents;
    if (input.salePriceCents !== undefined) record['sale_price_cents'] = input.salePriceCents;
    if (input.currencyCode !== undefined) record['currency_code'] = input.currencyCode;
    if (input.manageStock !== undefined) record['manage_stock'] = input.manageStock;
    if (input.stockQuantity !== undefined) record['stock_quantity'] = input.stockQuantity;
    if (input.stockStatus !== undefined) record['stock_status'] = input.stockStatus;
    if (input.source !== undefined) record['source'] = input.source;
    if (input.url !== undefined) record['url'] = input.url;
    if (input.tags !== undefined) record['tags'] = JSON.stringify(input.tags);
    if (input.priceRange !== undefined) record['price_range'] = JSON.stringify(input.priceRange);
    if (input.mainImage !== undefined) record['main_image'] = input.mainImage;

    return record;
}
