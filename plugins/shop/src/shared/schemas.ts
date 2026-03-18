/**
 * @wordrhyme/shop-core - Zod Validation Schemas
 *
 * Reusable validation schemas for e-commerce entities.
 * No framework dependencies — only Zod.
 */
import { z } from 'zod';

// ============================================================
// Shared Enums
// ============================================================

export const productStatusSchema = z.enum(['draft', 'pending', 'published', 'archived']);
export const stockStatusSchema = z.enum(['instock', 'outofstock', 'onbackorder']);
export const orderStatusSchema = z.enum(['pending', 'processing', 'paid', 'fulfilled', 'completed', 'canceled', 'refunded']);
export const sourceSchema = z.enum(['1688', 'aliexpress', 'shopify', 'woocommerce', 'temu', 'tiktok', 'platform']);

// ============================================================
// Product Schemas
// ============================================================

export const productTagSchema = z.object({
    key: z.string(),
    value: z.string(),
});

export const priceRangeEntrySchema = z.object({
    startQuantity: z.number(),
    price: z.string(),
});

export const createProductSchema = z.object({
    spuId: z.string().min(1).max(50),
    name: z.string().min(1).max(200),
    nameEn: z.string().max(200).optional(),
    description: z.string().optional(),
    shortDescription: z.string().optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    mainImage: z.string().optional(),
    category: z.string().optional(),
    categoryName: z.string().optional(),
    status: productStatusSchema.default('draft'),
    price: z.string().optional(),
    regularPrice: z.string().optional(),
    salePrice: z.string().optional(),
    currencyCode: z.string().max(10).default('USD'),
    manageStock: z.boolean().default(false),
    stockQuantity: z.number().int().default(0),
    stockStatus: stockStatusSchema.default('instock'),
    source: sourceSchema.optional(),
    url: z.string().url().optional(),
    tags: z.array(productTagSchema).optional(),
    priceRange: z.array(priceRangeEntrySchema).optional(),
});

export const updateProductSchema = createProductSchema.partial().omit({ spuId: true });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ============================================================
// Product Variation Schemas
// ============================================================

export const variationAttributeSchema = z.object({
    name: z.string(),
    value: z.string(),
});

export const variationImageSchema = z.object({
    src: z.string(),
    alt: z.string().optional(),
});

export const createVariationSchema = z.object({
    productId: z.string(),
    skuId: z.string().min(1).max(50),
    name: z.string().optional(),
    price: z.string().optional(),
    regularPrice: z.string().optional(),
    salePrice: z.string().optional(),
    stockQuantity: z.number().int().default(0),
    stockStatus: stockStatusSchema.default('instock'),
    attributes: z.array(variationAttributeSchema).optional(),
    image: variationImageSchema.optional(),
});

export type CreateVariationInput = z.infer<typeof createVariationSchema>;

// ============================================================
// Order Schemas
// ============================================================

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

export const createOrderSchema = z.object({
    orderId: z.string().optional(),
    orderNumber: z.string().optional(),
    status: orderStatusSchema.default('pending'),
    currency: z.string().max(10).default('USD'),
    subtotalPrice: z.string().optional(),
    totalPrice: z.string().optional(),
    totalTax: z.string().optional(),
    totalDiscount: z.string().optional(),
    shippingPrice: z.string().optional(),
    paymentMethod: z.string().optional(),
    note: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    shipping: shippingAddressSchema.optional(),
    lineItems: z.array(lineItemSchema).optional(),
    source: sourceSchema.optional(),
    sourceStatus: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

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
