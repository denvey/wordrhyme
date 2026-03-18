/**
 * @wordrhyme/shop-core - Shared Type Definitions
 *
 * Pure type definitions for e-commerce domain entities.
 * No runtime dependencies — all types are compile-time only.
 */

// ============================================================
// Status Enums (string union types)
// ============================================================

export type ProductStatus = 'draft' | 'pending' | 'published' | 'archived';
export type StockStatus = 'instock' | 'outofstock' | 'onbackorder';
export type OrderStatus = 'pending' | 'processing' | 'paid' | 'fulfilled' | 'completed' | 'canceled' | 'refunded';
export type Source = '1688' | 'aliexpress' | 'shopify' | 'woocommerce' | 'temu' | 'tiktok' | 'platform';

// ============================================================
// Product Domain
// ============================================================

export interface PriceRangeEntry {
    startQuantity: number;
    price: string;
}

export interface ProductTag {
    key: string;
    value: string;
}

export interface Product {
    id: string;
    spu_id: string;
    name: string;
    name_en?: string;
    description?: string;
    category?: string;
    category_name?: string;
    status: ProductStatus;
    price?: string;
    regular_price?: string;
    sale_price?: string;
    currency_code?: string;
    manage_stock: boolean;
    stock_quantity?: number;
    stock_status: StockStatus;
    source?: Source;
    url?: string;
    tags?: string;
    price_range?: string;
    organization_id: string;
    acl_tags: string[];
    deny_tags: string[];
    created_by: string;
    created_at: string;
    updated_at: string;
}

// ============================================================
// Product Variation Domain
// ============================================================

export interface VariationAttribute {
    name: string;
    value: string;
}

export interface VariationImage {
    src: string;
    alt?: string;
}

export interface ProductVariation {
    id: string;
    product_id: string;
    sku_id: string;
    name?: string;
    price?: string;
    regular_price?: string;
    sale_price?: string;
    stock_quantity?: number;
    stock_status: StockStatus;
    attributes?: string;
    image?: string;
    organization_id: string;
    created_at: string;
    updated_at: string;
}

// ============================================================
// Order Domain
// ============================================================

export interface ShippingAddress {
    firstName: string;
    lastName: string;
    address1: string;
    address2?: string;
    city: string;
    province?: string;
    zip: string;
    country: string;
    countryCode: string;
    phone?: string;
    trackingNumber?: string;
    carrier?: string;
}

export interface LineItem {
    id: string;
    spuId?: string;
    skuId?: string;
    name: string;
    quantity: number;
    price: string;
    imageUrl?: string;
}

export interface Order {
    id: string;
    order_id?: string;
    order_number?: string;
    status: OrderStatus;
    currency?: string;
    subtotal_price?: string;
    total_price?: string;
    total_tax?: string;
    total_discount?: string;
    shipping_price?: string;
    payment_method?: string;
    note?: string;
    email?: string;
    phone?: string;
    shipping?: string;
    line_items?: string;
    source?: Source;
    source_status?: string;
    organization_id: string;
    acl_tags: string[];
    deny_tags: string[];
    created_by?: string;
    created_at: string;
    updated_at: string;
    paid_at?: string;
    canceled_at?: string;
    refunded_at?: string;
}

// ============================================================
// Service Result Types
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
