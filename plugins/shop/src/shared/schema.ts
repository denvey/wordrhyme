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
 *
 * Conventions:
 *   - Enum fields use varchar({ enum }) for auto drizzle-zod z.enum() inference
 *   - Bounded strings use varchar({ length }) for auto .max() inference
 *   - Unbounded strings (URLs, free text) stay as text()
 *   - JSONB nested types are defined in schemas.ts (Zod SSOT, import type here)
 */
import { pluginTable } from '@wordrhyme/db/plugin';
import { bigint, text, varchar, integer, boolean, timestamp, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import type { I18nField } from './i18n-field';
import type {
    ProductTag,
    PriceRangeEntry,
    VariationImage,
    ShippingAddress,
    LineItem,
} from './schemas';

// ============================================================
// Enum Value Arrays (single source of truth for varchar enum + Zod)
// ============================================================

export const PRODUCT_STATUSES = ['draft', 'pending', 'published', 'archived'] as const;
export const STOCK_STATUSES = ['instock', 'outofstock', 'onbackorder'] as const;
export const ORDER_STATUSES = ['pending', 'processing', 'paid', 'fulfilled', 'completed', 'canceled', 'refunded'] as const;
export const SOURCES = ['1688', 'taobao', 'pinduoduo', 'self_sourced', 'aliexpress', 'shopify', 'woocommerce', 'temu', 'tiktok', 'platform'] as const;
export const CARGO_TYPES = ['general', 'battery', 'pure_battery', 'liquid_powder'] as const;
export const SKU_TYPES = ['single', 'bundle', 'virtual_bundle'] as const;
export const PRODUCT_TYPES = ['normal', 'virtual', 'service', 'bundle'] as const;
export const PUBLISH_STATUSES = ['immediate', 'scheduled', 'warehouse'] as const;
export const ATTRIBUTE_TYPES = ['select', 'multiselect', 'text'] as const;

// ============================================================
// Products (SPU)
// ============================================================

export const shopProducts = pluginTable('products', {
    spuId: bigint('spu_id', { mode: 'string' })
        .primaryKey()
        .generatedByDefaultAsIdentity(),
    name: jsonb('name').$type<I18nField>().notNull(),
    description: jsonb('description').$type<I18nField>(),
    shortDescription: jsonb('short_description').$type<I18nField>(),
    seoTitle: jsonb('seo_title').$type<I18nField>(),
    seoDescription: jsonb('seo_description').$type<I18nField>(),
    status: varchar('status', { length: 20, enum: PRODUCT_STATUSES }).notNull().default('draft'),
    priceCents: integer('price_cents'),
    regularPriceCents: integer('regular_price_cents'),
    salePriceCents: integer('sale_price_cents'),
    currencyCode: varchar('currency_code', { length: 10 }).notNull().default('USD'),
    manageStock: boolean('manage_stock').notNull().default(false),
    stockQuantity: integer('stock_quantity').notNull().default(0),
    stockStatus: varchar('stock_status', { length: 20, enum: STOCK_STATUSES }).notNull().default('instock'),
    source: varchar('source', { length: 50, enum: SOURCES }),
    url: text('url'),
    tags: jsonb('tags').$type<ProductTag[]>().default([]),
    priceRange: jsonb('price_range').$type<PriceRangeEntry[]>().default([]),
    mainImage: text('main_image'),
    // New fields (migration 007)
    spuCode: varchar('spu_code', { length: 50 }),
    memo: text('memo'),
    // New fields (migration 008 — 商品信息扩展)
    productType: varchar('product_type', { length: 20, enum: PRODUCT_TYPES }).notNull().default('normal'),
    unit: varchar('unit', { length: 20 }),
    brand: varchar('brand', { length: 100 }),
    mainVideo: text('main_video'),
    keywords: text('keywords'),
    publishStatus: varchar('publish_status', { length: 20, enum: PUBLISH_STATUSES }).notNull().default('immediate'),
    publishAt: timestamp('publish_at', { withTimezone: true }),
    delistEnabled: boolean('delist_enabled').notNull().default(false),
    delistAt: timestamp('delist_at', { withTimezone: true }),
    logisticsAttributes: jsonb('logistics_attributes').$type<string[]>().default([]),
    customParameters: jsonb('custom_parameters').$type<Record<string, unknown>[]>().default([]),
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
    name: jsonb('name').$type<I18nField>(),
    priceCents: integer('price_cents'),
    regularPriceCents: integer('regular_price_cents'),
    salePriceCents: integer('sale_price_cents'),
    stockQuantity: integer('stock_quantity').notNull().default(0),
    stockStatus: varchar('stock_status', { length: 20, enum: STOCK_STATUSES }).notNull().default('instock'),
    image: jsonb('image').$type<VariationImage>(),
    // New fields (migration 007)
    skuCode: varchar('sku_code', { length: 50 }),
    skuType: varchar('sku_type', { length: 20, enum: SKU_TYPES }).notNull().default('single'),
    weight: integer('weight'),
    length: integer('length'),
    width: integer('width'),
    height: integer('height'),
    cargoType: varchar('cargo_type', { length: 20, enum: CARGO_TYPES }).notNull().default('general'),
    attributeType: varchar('attribute_type', { length: 20 }).notNull().default('simple'),
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
    status: varchar('status', { length: 20, enum: ORDER_STATUSES }).notNull().default('pending'),
    currency: varchar('currency', { length: 10 }).notNull().default('USD'),
    subtotalPriceCents: integer('subtotal_price_cents'),
    totalPriceCents: integer('total_price_cents'),
    totalTaxCents: integer('total_tax_cents'),
    totalDiscountCents: integer('total_discount_cents'),
    shippingPriceCents: integer('shipping_price_cents'),
    paymentMethod: varchar('payment_method', { length: 50 }),
    note: text('note'),
    email: text('email'),
    phone: text('phone'),
    shipping: jsonb('shipping').$type<ShippingAddress>(),
    lineItems: jsonb('line_items').$type<LineItem[]>().default([]),
    version: integer('version').notNull().default(1),
    source: varchar('source', { length: 50, enum: SOURCES }),
    sourceStatus: varchar('source_status', { length: 50 }),
    trackingNumber: text('tracking_number'),
    carrier: varchar('carrier', { length: 100 }),
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
    skuCode: varchar('sku_code', { length: 50 }),
    name: jsonb('name').$type<I18nField>().notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitPriceCents: integer('unit_price_cents').notNull(),
    totalPriceCents: integer('total_price_cents').notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Attributes
// ============================================================

export const shopAttributes = pluginTable('attributes', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: jsonb('name').$type<I18nField>().notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    type: varchar('type', { length: 20, enum: ATTRIBUTE_TYPES }).notNull().default('select'),
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
    value: jsonb('value').$type<I18nField>().notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    colorHex: varchar('color_hex', { length: 7 }),
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
    name: jsonb('name').$type<I18nField>().notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: jsonb('description').$type<I18nField>(),
    mainImage: text('main_image'),
    parentId: text('parent_id'),
    nestedLevel: integer('nested_level').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    isEnabled: boolean('is_enabled').notNull().default(true),
    seoTitle: jsonb('seo_title').$type<I18nField>(),
    seoDescription: jsonb('seo_description').$type<I18nField>(),
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
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: text('entity_id').notNull(),
    platform: varchar('platform', { length: 50 }).notNull(),
    direction: varchar('direction', { length: 20 }).notNull(),
    externalId: text('external_id').notNull(),
    externalSku: text('external_sku'),
    externalUrl: text('external_url'),
    syncStatus: varchar('sync_status', { length: 20 }).notNull().default('pending'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    syncError: text('sync_error'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
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
    alt: jsonb('alt').$type<I18nField>(),
    sortOrder: integer('sort_order').notNull().default(0),
    isMain: boolean('is_main').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
