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
} from './schema';

// ============================================================
// Entity Types (derived from Drizzle)
// ============================================================

export type Product = InferSelectModel<typeof shopProducts>;
export type ProductVariation = InferSelectModel<typeof shopProductVariations>;
export type Order = InferSelectModel<typeof shopOrders>;
export type OrderItem = InferSelectModel<typeof shopOrderItems>;

// ============================================================
// Shared Enums
// ============================================================

export const productStatusSchema = z.enum(['draft', 'pending', 'published', 'archived']);
export const stockStatusSchema = z.enum(['instock', 'outofstock', 'onbackorder']);
export const orderStatusSchema = z.enum(['pending', 'processing', 'paid', 'fulfilled', 'completed', 'canceled', 'refunded']);
export const sourceSchema = z.enum(['1688', 'aliexpress', 'shopify', 'woocommerce', 'temu', 'tiktok', 'platform']);

/** Cargo attribute type for shipping classification */
export const cargoTypeSchema = z.enum(['general', 'battery', 'pure_battery', 'liquid_powder']);

/** SKU type: single (default), bundle, virtual_bundle (reserved) */
export const skuTypeSchema = z.enum(['single', 'bundle', 'virtual_bundle']);

/** Sourcing platform for procurement channel */
export const sourcingPlatformSchema = z.enum(['1688', 'taobao', 'pinduoduo', 'self_sourced']);

export type ProductStatus = z.infer<typeof productStatusSchema>;
export type StockStatus = z.infer<typeof stockStatusSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type CargoType = z.infer<typeof cargoTypeSchema>;
export type SkuType = z.infer<typeof skuTypeSchema>;

// ============================================================
// JSONB Nested Schemas (not in Drizzle table)
// ============================================================

export const productTagSchema = z.object({
    key: z.string(),
    value: z.string(),
});

export const priceRangeEntrySchema = z.object({
    startQuantity: z.number(),
    price: z.string(),
});

export const variationAttributeSchema = z.object({
    name: z.string(),
    value: z.string(),
});

export const variationImageSchema = z.object({
    src: z.string(),
    alt: z.string().optional(),
});

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

export const lineItemSchema = z.object({
    id: z.string(),
    spuId: z.string().optional(),
    skuId: z.string().optional(),
    name: z.string(),
    quantity: z.number().int().positive(),
    price: z.string(),
    imageUrl: z.string().optional(),
});

export type PriceRangeEntry = z.infer<typeof priceRangeEntrySchema>;
export type ProductTag = z.infer<typeof productTagSchema>;
export type VariationAttribute = z.infer<typeof variationAttributeSchema>;
export type VariationImage = z.infer<typeof variationImageSchema>;
export type ShippingAddress = z.infer<typeof shippingAddressSchema>;
export type LineItem = z.infer<typeof lineItemSchema>;

// ============================================================
// Product Schemas (derived from Drizzle)
// ============================================================

export const createProductSchema = createPluginInsertSchema(shopProducts, {
    name: () => z.string().min(1).max(200),
    status: () => productStatusSchema.default('draft'),
    currencyCode: () => z.string().max(10).default('USD'),
    stockStatus: () => stockStatusSchema.default('instock'),
    source: () => sourceSchema.optional(),
    url: () => z.string().url().optional(),
    tags: () => z.array(productTagSchema).optional(),
    priceRange: () => z.array(priceRangeEntrySchema).optional(),
    // New fields (migration 007)
    spuCode: () => z.string().max(50).optional(),
    sourcingPlatform: () => sourcingPlatformSchema.optional(),
    sourcingMemo: () => z.string().max(500).optional(),
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
// Product Variation Schemas (derived from Drizzle)
// ============================================================

export const createVariationSchema = createPluginInsertSchema(shopProductVariations, {
    stockStatus: () => stockStatusSchema.default('instock'),
    // New fields (migration 007)
    skuCode: () => z.string().max(50).optional(),
    skuType: () => skuTypeSchema.default('single'),
    weight: () => z.number().int().positive().optional(),
    length: () => z.number().int().positive().optional(),
    width: () => z.number().int().positive().optional(),
    height: () => z.number().int().positive().optional(),
    attributeType: () => cargoTypeSchema.default('general'),
    purchaseCost: () => z.number().int().min(0).optional(),
}).omit({
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
export const inlineCreateInputSchema = z.object({
    // SPU fields
    spuCode: z.string().max(50).optional(),
    nameCn: z.string().min(1).max(128),
    sourcingPlatform: sourcingPlatformSchema.optional(),
    sourceUrl: z.string().url().optional(),
    sourcingMemo: z.string().max(500).optional(),
    
    // SKU fields (required)
    skuCode: z.string().max(50).optional(),
    weight: z.number().int().positive(),
    attributeType: cargoTypeSchema,
    
    // SKU fields (optional)
    length: z.number().int().positive().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    purchaseCost: z.number().int().min(0).optional(),
    
    // Auto-generation flag
    autoGenerate: z.boolean().default(false),
}).refine(
    (data) => data.skuCode || data.autoGenerate,
    { message: 'skuCode is required unless autoGenerate is true', path: ['skuCode'] }
);

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
    attributeType: cargoTypeSchema,
    nameCn: z.string(),
});

export type InlineCreateInput = z.infer<typeof inlineCreateInputSchema>;
export type InlineCreateOutput = z.infer<typeof inlineCreateOutputSchema>;

// ============================================================
// Order Schemas (derived from Drizzle)
// ============================================================

export const createOrderSchema = createPluginInsertSchema(shopOrders, {
    status: () => orderStatusSchema.default('pending'),
    currency: () => z.string().max(10).default('USD'),
    shipping: () => shippingAddressSchema.optional(),
    lineItems: () => z.array(lineItemSchema).optional(),
    source: () => sourceSchema.optional(),
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
