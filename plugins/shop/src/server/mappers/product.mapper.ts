import { getI18nValue } from '../../shared';
import type { I18nField } from '../../shared';

export interface DbProduct {
    id: string;
    spu_id: string;
    name: I18nField;
    description?: I18nField;
    short_description?: I18nField;
    seo_title?: I18nField;
    seo_description?: I18nField;
    status: string;
    price_cents?: number;
    regular_price_cents?: number;
    sale_price_cents?: number;
    currency_code: string;
    manage_stock: boolean;
    stock_quantity: number;
    stock_status: string;
    source?: string;
    url?: string;
    tags?: unknown;
    price_range?: unknown;
    main_image?: string;
    organization_id: string;
    acl_tags: string[];
    deny_tags: string[];
    created_by: string;
    created_at: string;
    updated_at: string;
}

export interface ApiProduct {
    id: string;
    spuId: string;
    name: string;
    description?: string | undefined;
    shortDescription?: string | undefined;
    seoTitle?: string | undefined;
    seoDescription?: string | undefined;
    status: string;
    price?: string | undefined;
    regularPrice?: string | undefined;
    salePrice?: string | undefined;
    currencyCode: string;
    manageStock: boolean;
    stockQuantity: number;
    stockStatus: string;
    source?: string | undefined;
    url?: string | undefined;
    tags?: unknown[];
    priceRange?: unknown[];
    mainImage?: string | undefined;
    organizationId: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

function centsToPrice(cents: number | undefined | null): string | undefined {
    if (cents == null) return undefined;
    return (cents / 100).toFixed(2);
}

function priceToCents(price: string | undefined | null): number | undefined {
    if (price == null) return undefined;
    const num = Number.parseFloat(price);
    if (isNaN(num)) return undefined;
    return Math.round(num * 100);
}

export function dbProductToApi(row: DbProduct, locale: string): ApiProduct {
    return {
        id: row.id,
        spuId: row.spu_id,
        name: getI18nValue(row.name, locale),
        description: row.description ? getI18nValue(row.description, locale) : undefined,
        shortDescription: row.short_description ? getI18nValue(row.short_description, locale) : undefined,
        seoTitle: row.seo_title ? getI18nValue(row.seo_title, locale) : undefined,
        seoDescription: row.seo_description ? getI18nValue(row.seo_description, locale) : undefined,
        status: row.status,
        price: centsToPrice(row.price_cents),
        regularPrice: centsToPrice(row.regular_price_cents),
        salePrice: centsToPrice(row.sale_price_cents),
        currencyCode: row.currency_code,
        manageStock: row.manage_stock,
        stockQuantity: row.stock_quantity,
        stockStatus: row.stock_status,
        source: row.source,
        url: row.url,
        tags: Array.isArray(row.tags) ? row.tags : [],
        priceRange: Array.isArray(row.price_range) ? row.price_range : [],
        mainImage: row.main_image,
        organizationId: row.organization_id,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function apiInputToDbProduct(
    input: Record<string, unknown>,
    locale = 'en',
): Record<string, unknown> {
    const record: Record<string, unknown> = {};

    if (input['name'] !== undefined) record['name'] = { [locale]: input['name'] };
    if (input['description'] !== undefined) record['description'] = { [locale]: input['description'] };
    if (input['shortDescription'] !== undefined) record['short_description'] = { [locale]: input['shortDescription'] };
    if (input['seoTitle'] !== undefined) record['seo_title'] = { [locale]: input['seoTitle'] };
    if (input['seoDescription'] !== undefined) record['seo_description'] = { [locale]: input['seoDescription'] };
    if (input['status'] !== undefined) record['status'] = input['status'];
    if (input['price'] !== undefined) record['price_cents'] = priceToCents(input['price'] as string);
    if (input['regularPrice'] !== undefined) record['regular_price_cents'] = priceToCents(input['regularPrice'] as string);
    if (input['salePrice'] !== undefined) record['sale_price_cents'] = priceToCents(input['salePrice'] as string);
    if (input['currencyCode'] !== undefined) record['currency_code'] = input['currencyCode'];
    if (input['manageStock'] !== undefined) record['manage_stock'] = input['manageStock'];
    if (input['stockQuantity'] !== undefined) record['stock_quantity'] = input['stockQuantity'];
    if (input['stockStatus'] !== undefined) record['stock_status'] = input['stockStatus'];
    if (input['source'] !== undefined) record['source'] = input['source'];
    if (input['url'] !== undefined) record['url'] = input['url'];
    if (input['tags'] !== undefined) record['tags'] = JSON.stringify(input['tags']);
    if (input['priceRange'] !== undefined) record['price_range'] = JSON.stringify(input['priceRange']);

    return record;
}
