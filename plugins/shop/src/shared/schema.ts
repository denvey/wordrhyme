/**
 * Shop Plugin - Drizzle Schema Definitions
 *
 * These pgTable definitions match the existing migration SQL schemas.
 * Used by createCrudRouter (auto-crud-server) for type-safe CRUD operations.
 *
 * Table prefix: plugin_com_wordrhyme_shop_ (enforced by ScopedDb tablePrefix)
 */
import { pgTable, text, integer, boolean, timestamp, jsonb, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core';

// ============================================================
// Products (SPU)
// ============================================================

export const shopProducts = pgTable('plugin_com_wordrhyme_shop_products', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    spuId: text('spu_id').notNull(),
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
    organizationId: text('organization_id').notNull().$defaultFn(() => ''),
    aclTags: text('acl_tags').array().default([]),
    denyTags: text('deny_tags').array().default([]),
    createdBy: text('created_by').notNull().$defaultFn(() => ''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Product Variations (SKU)
// ============================================================

export const shopProductVariations = pgTable('plugin_com_wordrhyme_shop_product_variations', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text('product_id').notNull(),
    skuId: text('sku_id').notNull(),
    name: jsonb('name'),
    priceCents: integer('price_cents'),
    regularPriceCents: integer('regular_price_cents'),
    salePriceCents: integer('sale_price_cents'),
    stockQuantity: integer('stock_quantity').notNull().default(0),
    stockStatus: text('stock_status').notNull().default('instock'),
    image: jsonb('image'),
    organizationId: text('organization_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Orders
// ============================================================

export const shopOrders = pgTable('plugin_com_wordrhyme_shop_orders', {
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
    organizationId: text('organization_id').notNull(),
    aclTags: text('acl_tags').array().default([]),
    denyTags: text('deny_tags').array().default([]),
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

export const shopOrderItems = pgTable('plugin_com_wordrhyme_shop_order_items', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderId: text('order_id').notNull(),
    productId: text('product_id'),
    variantId: text('variant_id'),
    skuId: text('sku_id'),
    name: jsonb('name').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitPriceCents: integer('unit_price_cents').notNull(),
    totalPriceCents: integer('total_price_cents').notNull(),
    currency: text('currency').notNull(),
    organizationId: text('organization_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Attributes
// ============================================================

export const shopAttributes = pgTable('plugin_com_wordrhyme_shop_attributes', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: jsonb('name').notNull(),
    slug: text('slug').notNull(),
    type: text('type').notNull().default('select'),
    sortOrder: integer('sort_order').notNull().default(0),
    organizationId: text('organization_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Attribute Values
// ============================================================

export const shopAttributeValues = pgTable('plugin_com_wordrhyme_shop_attribute_values', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    attributeId: text('attribute_id').notNull(),
    value: jsonb('value').notNull(),
    slug: text('slug').notNull(),
    colorHex: text('color_hex'),
    image: text('image'),
    sortOrder: integer('sort_order').notNull().default(0),
    organizationId: text('organization_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Product Attributes (M2M)
// ============================================================

export const shopProductAttributes = pgTable('plugin_com_wordrhyme_shop_product_attributes', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text('product_id').notNull(),
    attributeId: text('attribute_id').notNull(),
    visible: boolean('visible').notNull().default(true),
    isVariation: boolean('is_variation').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    organizationId: text('organization_id').notNull(),
});

// ============================================================
// Variant Attribute Values (M2M)
// ============================================================

export const shopVariantAttributeValues = pgTable('plugin_com_wordrhyme_shop_variant_attribute_values', {
    variantId: text('variant_id').notNull(),
    attributeValueId: text('attribute_value_id').notNull(),
    organizationId: text('organization_id').notNull(),
}, (table) => [
    primaryKey({ columns: [table.variantId, table.attributeValueId] }),
]);

// ============================================================
// Categories
// ============================================================

export const shopCategories = pgTable('plugin_com_wordrhyme_shop_categories', {
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
    organizationId: text('organization_id').notNull(),
    aclTags: text('acl_tags').array().default([]),
    denyTags: text('deny_tags').array().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Product Categories (M2M)
// ============================================================

export const shopProductCategories = pgTable('plugin_com_wordrhyme_shop_product_categories', {
    productId: text('product_id').notNull(),
    categoryId: text('category_id').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    organizationId: text('organization_id').notNull(),
}, (table) => [
    primaryKey({ columns: [table.productId, table.categoryId] }),
]);

// ============================================================
// External Mappings
// ============================================================

export const shopExternalMappings = pgTable('plugin_com_wordrhyme_shop_external_mappings', {
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
    organizationId: text('organization_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Product Images
// ============================================================

export const shopProductImages = pgTable('plugin_com_wordrhyme_shop_product_images', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text('product_id').notNull(),
    variantId: text('variant_id'),
    src: text('src').notNull(),
    alt: jsonb('alt'),
    sortOrder: integer('sort_order').notNull().default(0),
    isMain: boolean('is_main').notNull().default(false),
    metadata: jsonb('metadata').default({}),
    organizationId: text('organization_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
