/**
 * @wordrhyme/shop-core - Zod Validation Schemas
 *
 * Derived from Drizzle schema via drizzle-zod.
 * Uses `zod/v4` import to match drizzle-zod@1.0 internal types.
 *
 * Key conventions (post-migration 007):
 *   - shopProducts uses spuId as PK, shopProductVariations uses skuId as PK
 *   - skuId is the canonical backend SKU identifier for all downstream modules
 *   - skuCode is for business display only, never used as cross-module FK
 *   - purchase_cost is in CNY cents (分); multi-currency support deferred
 *
 * Schema derivation strategy:
 *   - Enum Zod schemas derived from const arrays in schema.ts
 *   - varchar({ enum, length }) auto-generates z.enum() + .max() — no manual refine
 *   - Only override refines for: JSONB deep validation, URL format, date coercion
 */
import { z } from 'zod/v4';
import type { InferSelectModel } from 'drizzle-orm';
import { createPluginInsertSchema } from '@wordrhyme/db/plugin';
import { createSelectSchema } from 'drizzle-zod';
import {
    shopProducts,
    shopProductVariations,
    shopOrders,
    shopOrderItems,
    // Enum value arrays
    PRODUCT_STATUSES,
    STOCK_STATUSES,
    ORDER_STATUSES,
    SOURCES,
    CARGO_TYPES,
    SKU_TYPES,
    PRODUCT_TYPES,
    PUBLISH_STATUSES,
} from './schema';

// ============================================================
// Entity Types (derived from Drizzle)
// ============================================================

import type { ApiPayload } from '@wordrhyme/plugin';

export type Product = InferSelectModel<typeof shopProducts>;
export type ProductVariation = InferSelectModel<typeof shopProductVariations>;
export type Order = InferSelectModel<typeof shopOrders>;
export type OrderItem = InferSelectModel<typeof shopOrderItems>;

// API-ready types: Date → string, ready for frontend consumption
export type ApiProduct = ApiPayload<Product>;
export type ApiProductVariation = ApiPayload<ProductVariation>;
export type ApiOrder = ApiPayload<Order>;
export type ApiOrderItem = ApiPayload<OrderItem>;

// ============================================================
// Enum Schemas (derived from const arrays — zero manual duplication)
// ============================================================

export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export const stockStatusSchema = z.enum(STOCK_STATUSES);
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const sourceSchema = z.enum(SOURCES);
export const cargoTypeSchema = z.enum(CARGO_TYPES);
export const skuTypeSchema = z.enum(SKU_TYPES);
export const productTypeSchema = z.enum(PRODUCT_TYPES);
export const publishStatusSchema = z.enum(PUBLISH_STATUSES);

export type ProductStatus = z.infer<typeof productStatusSchema>;
export type StockStatus = z.infer<typeof stockStatusSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type CargoType = z.infer<typeof cargoTypeSchema>;
export type SkuType = z.infer<typeof skuTypeSchema>;
export type ProductType = z.infer<typeof productTypeSchema>;
export type PublishStatus = z.infer<typeof publishStatusSchema>;

// ============================================================
// JSONB Nested Zod Schemas (SSOT — schema.ts imports types from here)
// ============================================================

export const productTagSchema = z.object({
    key: z.string(),
    value: z.string(),
});
export type ProductTag = z.infer<typeof productTagSchema>;

export const priceRangeEntrySchema = z.object({
    startQuantity: z.number(),
    price: z.string(),
});
export type PriceRangeEntry = z.infer<typeof priceRangeEntrySchema>;

export const variationAttributeSchema = z.object({
    name: z.string(),
    value: z.string(),
});
export type VariationAttribute = z.infer<typeof variationAttributeSchema>;

export const variationImageSchema = z.object({
    src: z.string(),
    alt: z.string().optional(),
});
export type VariationImage = z.infer<typeof variationImageSchema>;

export const shippingAddressSchema = z.object({
    firstName: z.string(),
    lastName: z.string(),
    address1: z.string(),
    address2: z.string().optional(),
    city: z.string(),
    province: z.string().optional(),
    zip: z.string(),
    country: z.string(),
    countryCode: z.string(),
    phone: z.string().optional(),
});
export type ShippingAddress = z.infer<typeof shippingAddressSchema>;

export const lineItemSchema = z.object({
    id: z.string(),
    spuId: z.string().optional(),
    skuId: z.string().optional(),
    name: z.string(),
    quantity: z.number().int().positive(),
    price: z.string(),
    imageUrl: z.string().optional(),
});
export type LineItem = z.infer<typeof lineItemSchema>;

function isMediaReference(value: string): boolean {
    if (!value) return false;
    if (value.startsWith('data:')) return false;
    if (value.includes('/')) return false;
    return true;
}

function isValidUrl(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

const mediaFieldSchema = z.string().refine(
    (value) => value === '' || isValidUrl(value) || isMediaReference(value),
    { message: 'Expected a media URL or media ID' },
);

// ============================================================
// Product Schemas (derived from Drizzle — minimal refines)
// ============================================================

export const createProductSchema = createPluginInsertSchema(shopProducts, {
    // JSONB: runtime validation for form fields
    name: () => z.record(z.string(), z.string()),
    // Format validation (shared: frontend form hints + backend data quality)
    url: () => z.string().url().optional(),
    mainVideo: () => mediaFieldSchema.optional(),
}).omit({
    spuId: true,
    createdBy: true,
    createdAt: true,
    updatedAt: true,
});

export const updateProductSchema = createProductSchema.partial();

export const selectProductSchema = createSelectSchema(shopProducts);

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ============================================================
// Product Variation Schemas (derived from Drizzle — zero manual refines)
// ============================================================

export const createVariationSchema = createPluginInsertSchema(shopProductVariations).omit({
    skuId: true,
    createdAt: true,
    updatedAt: true,
});

export const selectVariationSchema = createSelectSchema(shopProductVariations);

export type CreateVariationInput = z.infer<typeof createVariationSchema>;

// ============================================================
// Inline Create Schema
// ============================================================

/**
 * Input schema for products.inlineCreate tRPC procedure.
 * Creates SPU + 1:1 SKU atomically within a transaction.
 *
 * Conventions:
 *   - nameCn is convenience input only; maps to name: { "zh-CN": nameCn }
 *   - sourceUrl maps to shopProducts.url
 *   - spuId / skuId are server-generated internal numeric ids, caller must not provide
 *   - purchase_cost is in CNY cents (分)
 *   - weight is in grams, length/width/height in centimeters
 */
const _ps = createProductSchema.shape;
const _vs = createVariationSchema.shape;

export const inlineCreateInputSchema = z.object({
    // Auto-derived from createProductSchema
    spuCode: _ps['spuCode'], source: _ps['source'], memo: _ps['memo'],
    name: z.record(z.string(), z.string()),  // I18nField — 需运行时验证（表单用）
    mainImage: _ps['mainImage'],   // text column
    sourceUrl: _ps['url'],         // 复用 .url() 验证（API 名 ≠ DB 列名）
    // Auto-derived from createVariationSchema
    skuCode: _vs['skuCode'],
    length: _vs['length'], width: _vs['width'], height: _vs['height'],
    purchaseCost: _vs['purchaseCost'], shippingCost: _vs['shippingCost'], packingCost: _vs['packingCost'],
    // Manual: API-only fields or required overrides
    images: z.array(z.string().url()).max(20).optional(),
    weight: z.number().int().positive(),  // required override (DB is nullable)
    cargoType: cargoTypeSchema,           // required override (DB has default)
    autoSku: z.boolean().default(false),
}).superRefine((data, ctx) => {
    if (!data.skuCode && !data.autoSku) {
        ctx.addIssue({ code: 'custom', message: 'skuCode is required unless autoSku is true', path: ['skuCode'] });
    }
});

/**
 * Response schema for products.inlineCreate.
 * Returns the created SPU + SKU identifiers for downstream binding.
 */
export const inlineCreateOutputSchema = z.object({
    spuId: z.string(),
    skuId: z.string(),
    spuCode: z.string().nullable(),
    skuCode: z.string().nullable(),
    weight: z.number().int(),
    cargoType: cargoTypeSchema,
    name: z.record(z.string(), z.string()),
});

export type InlineCreateInput = z.infer<typeof inlineCreateInputSchema>;
export type InlineCreateOutput = z.infer<typeof inlineCreateOutputSchema>;

// ============================================================
// Order Schemas (derived from Drizzle — minimal refines)
// ============================================================

export const createOrderSchema = createPluginInsertSchema(shopOrders, {
    // Format validation (shared: frontend form hints + backend data quality)
    email: () => z.string().email().optional(),
}).omit({
    id: true,
    version: true,
    createdAt: true,
    updatedAt: true,
    fulfilledAt: true,
    paidAt: true,
    canceledAt: true,
    refundedAt: true,
});

export const selectOrderSchema = createSelectSchema(shopOrders);

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ============================================================
// Order Item Schemas (derived from Drizzle)
// ============================================================

export const selectOrderItemSchema = createSelectSchema(shopOrderItems);

// ============================================================
// Query Schemas
// ============================================================

export const listQuerySchema = z.object({
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
    status: z.string().optional(),
    source: sourceSchema.optional(),
});

export type ListQueryInput = z.infer<typeof listQuerySchema>;

// ============================================================
// Service Result Types (pure domain, not table-derived)
// ============================================================

export interface PriceRange {
    min: number;
    max: number;
}

export interface ValidationResult {
    valid: boolean;
    reason?: string;
}

export interface StatusTransitionResult {
    allowed: boolean;
    validTargets: string[];
}
