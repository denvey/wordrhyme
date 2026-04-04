/**
 * Shop Plugin - Drizzle Schema Definitions
 *
 * These tables are the schema source for typing and drizzle-zod derivation.
 * Runtime schema changes still come only from SQL migration files.
 *
 * Key model (post-migration 007):
 *   - shopProducts: spuId is the primary key
 *   - shopProductVariations: skuId is the primary key, spuId is FK to shopProducts
 *   - All related tables reference spuId/skuId instead of legacy id/productId/variantId
 */
import { pluginTable } from '@wordrhyme/db/plugin';
import { bigint, text, integer, boolean, timestamp, jsonb, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core';

// ============================================================
// Products (SPU)
// ============================================================

export const shopProducts = pluginTable('products', {
    spuId: bigint('spu_id', { mode: 'string' })
        .primaryKey()
        .generatedByDefaultAsIdentity(),
    name: jsonb('name').notNull(),
    description: jsonb('description'),
    shortDescription: jsonb('short_description'),
    seoTitle: jsonb('seo_title'),
    seoDescription: jsonb('seo_description'),
    status: text('status').notNull().default('draft'),
    priceCents: integer('price_cents'),
    regularPriceCents: integer('regular_price_cents'),
    salePriceCents: integer('sale_price_cents'),
    currencyCode: text('currency_code').notNull().default('USD'),
    manageStock: boolean('manage_stock').notNull().default(false),
    stockQuantity: integer('stock_quantity').notNull().default(0),
    stockStatus: text('stock_status').notNull().default('instock'),
    source: text('source'),
    url: text('url'),
    tags: jsonb('tags').default([]),
    priceRange: jsonb('price_range').default([]),
    mainImage: text('main_image'),
    // New fields (migration 007)
    spuCode: text('spu_code'),
    memo: text('memo'),
    createdBy: text('created_by').notNull().$defaultFn(() => ''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Product Variations (SKU)
// ============================================================

export const shopProductVariations = pluginTable('product_variations', {
    skuId: bigint('sku_id', { mode: 'string' })
        .primaryKey()
        .generatedByDefaultAsIdentity(),
    spuId: bigint('spu_id', { mode: 'string' }).notNull(),
    name: jsonb('name'),
    priceCents: integer('price_cents'),
    regularPriceCents: integer('regular_price_cents'),
    salePriceCents: integer('sale_price_cents'),
    stockQuantity: integer('stock_quantity').notNull().default(0),
    stockStatus: text('stock_status').notNull().default('instock'),
    image: jsonb('image'),
    // New fields (migration 007)
    skuCode: text('sku_code'),
    skuType: text('sku_type').notNull().default('single'),
    weight: integer('weight'),
    length: integer('length'),
    width: integer('width'),
    height: integer('height'),
    cargoType: text('cargo_type').notNull().default('general'),
    purchaseCost: integer('purchase_cost'),
    shippingCost: integer('shipping_cost'),
    packingCost: integer('packing_cost'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Orders
// ============================================================

export const shopOrders = pluginTable('orders', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderId: text('order_id'),
    orderNumber: text('order_number'),
    status: text('status').notNull().default('pending'),
    currency: text('currency').notNull().default('USD'),
    subtotalPriceCents: integer('subtotal_price_cents'),
    totalPriceCents: integer('total_price_cents'),
    totalTaxCents: integer('total_tax_cents'),
    totalDiscountCents: integer('total_discount_cents'),
    shippingPriceCents: integer('shipping_price_cents'),
    paymentMethod: text('payment_method'),
    note: text('note'),
    email: text('email'),
    phone: text('phone'),
    shipping: jsonb('shipping'),
    lineItems: jsonb('line_items').default([]),
    version: integer('version').notNull().default(1),
    source: text('source'),
    sourceStatus: text('source_status'),
    trackingNumber: text('tracking_number'),
    carrier: text('carrier'),
    trackingUrl: text('tracking_url'),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
});

// ============================================================
// Order Items
// ============================================================

export const shopOrderItems = pluginTable('order_items', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderId: text('order_id').notNull(),
    spuId: bigint('spu_id', { mode: 'string' }),
    skuId: bigint('sku_id', { mode: 'string' }),
    skuCode: text('sku_code'),
    name: jsonb('name').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitPriceCents: integer('unit_price_cents').notNull(),
    totalPriceCents: integer('total_price_cents').notNull(),
    currency: text('currency').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Attributes
// ============================================================

export const shopAttributes = pluginTable('attributes', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: jsonb('name').notNull(),
    slug: text('slug').notNull(),
    type: text('type').notNull().default('select'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Attribute Values
// ============================================================

export const shopAttributeValues = pluginTable('attribute_values', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    attributeId: text('attribute_id').notNull(),
    value: jsonb('value').notNull(),
    slug: text('slug').notNull(),
    colorHex: text('color_hex'),
    image: text('image'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Product Attributes (M2M)
// ============================================================

export const shopProductAttributes = pluginTable('product_attributes', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    spuId: bigint('spu_id', { mode: 'string' }).notNull(),
    attributeId: text('attribute_id').notNull(),
    visible: boolean('visible').notNull().default(true),
    isVariation: boolean('is_variation').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
});

// ============================================================
// Variant Attribute Values (M2M)
// ============================================================

export const shopVariantAttributeValues = pluginTable('variant_attribute_values', {
    skuId: bigint('sku_id', { mode: 'string' }).notNull(),
    attributeValueId: text('attribute_value_id').notNull(),
}, (table) => [
    primaryKey({ columns: [table.skuId, table.attributeValueId] }),
]);

// ============================================================
// Categories
// ============================================================

export const shopCategories = pluginTable('categories', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: jsonb('name').notNull(),
    slug: text('slug').notNull(),
    description: jsonb('description'),
    mainImage: text('main_image'),
    parentId: text('parent_id'),
    nestedLevel: integer('nested_level').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    isEnabled: boolean('is_enabled').notNull().default(true),
    seoTitle: jsonb('seo_title'),
    seoDescription: jsonb('seo_description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Product Categories (M2M)
// ============================================================

export const shopProductCategories = pluginTable('product_categories', {
    spuId: bigint('spu_id', { mode: 'string' }).notNull(),
    categoryId: text('category_id').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
    primaryKey({ columns: [table.spuId, table.categoryId] }),
]);

// ============================================================
// External Mappings
// ============================================================

export const shopExternalMappings = pluginTable('external_mappings', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    platform: text('platform').notNull(),
    direction: text('direction').notNull(),
    externalId: text('external_id').notNull(),
    externalSku: text('external_sku'),
    externalUrl: text('external_url'),
    syncStatus: text('sync_status').notNull().default('pending'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    syncError: text('sync_error'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Product Images
// ============================================================

export const shopProductImages = pluginTable('product_images', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    spuId: bigint('spu_id', { mode: 'string' }).notNull(),
    skuId: bigint('sku_id', { mode: 'string' }),
    src: text('src').notNull(),
    alt: jsonb('alt'),
    sortOrder: integer('sort_order').notNull().default(0),
    isMain: boolean('is_main').notNull().default(false),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
