/**
 * @wordrhyme/shop-core - Zod Validation Schemas
 *
 * Derived from Drizzle schema via drizzle-zod.
 * Uses `zod/v4` import to match drizzle-zod@1.0 internal types.
 */
import { z } from 'zod/v4';
import type { InferSelectModel } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
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

export type ProductStatus = z.infer<typeof productStatusSchema>;
export type StockStatus = z.infer<typeof stockStatusSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type Source = z.infer<typeof sourceSchema>;

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

export const createProductSchema = createInsertSchema(shopProducts, {
    name: () => z.string().min(1).max(200),
    status: () => productStatusSchema.default('draft'),
    currencyCode: () => z.string().max(10).default('USD'),
    stockStatus: () => stockStatusSchema.default('instock'),
    source: () => sourceSchema.optional(),
    url: (schema) => schema.url().optional(),
    tags: () => z.array(productTagSchema).optional(),
    priceRange: () => z.array(priceRangeEntrySchema).optional(),
}).omit({
    id: true,
    organizationId: true,
    aclTags: true,
    denyTags: true,
    createdBy: true,
    createdAt: true,
    updatedAt: true,
});

export const updateProductSchema = createProductSchema.partial().omit({ spuId: true });

export const selectProductSchema = createSelectSchema(shopProducts);

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ============================================================
// Product Variation Schemas (derived from Drizzle)
// ============================================================

export const createVariationSchema = createInsertSchema(shopProductVariations, {
    stockStatus: () => stockStatusSchema.default('instock'),
}).omit({
    id: true,
    organizationId: true,
    createdAt: true,
    updatedAt: true,
});

export const selectVariationSchema = createSelectSchema(shopProductVariations);

export type CreateVariationInput = z.infer<typeof createVariationSchema>;

// ============================================================
// Order Schemas (derived from Drizzle)
// ============================================================

export const createOrderSchema = createInsertSchema(shopOrders, {
    status: () => orderStatusSchema.default('pending'),
    currency: () => z.string().max(10).default('USD'),
    shipping: () => shippingAddressSchema.optional(),
    lineItems: () => z.array(lineItemSchema).optional(),
    source: () => sourceSchema.optional(),
    email: (schema) => schema.email().optional(),
}).omit({
    id: true,
    organizationId: true,
    aclTags: true,
    denyTags: true,
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
