-- ============================================================
-- Shop Plugin: Products + Variations + Orders + OrderItems
-- ============================================================

-- Products (SPU)
CREATE TABLE IF NOT EXISTS plugin_com_wordrhyme_shop_products (
    id TEXT PRIMARY KEY,
    spu_id TEXT NOT NULL,
    name JSONB NOT NULL,
    description JSONB,
    short_description JSONB,
    seo_title JSONB,
    seo_description JSONB,
    status TEXT NOT NULL DEFAULT 'draft',
    price_cents INTEGER,
    regular_price_cents INTEGER,
    sale_price_cents INTEGER,
    currency_code TEXT NOT NULL DEFAULT 'USD',
    manage_stock BOOLEAN NOT NULL DEFAULT false,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    stock_status TEXT NOT NULL DEFAULT 'instock',
    source TEXT,
    url TEXT,
    tags JSONB DEFAULT '[]',
    price_range JSONB DEFAULT '[]',
    main_image TEXT,
    organization_id TEXT NOT NULL,
    acl_tags TEXT[] DEFAULT '{}',
    deny_tags TEXT[] DEFAULT '{}',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, spu_id),
    UNIQUE (id, organization_id)
);

-- Product Variations (SKU)
CREATE TABLE IF NOT EXISTS plugin_com_wordrhyme_shop_product_variations (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    sku_id TEXT NOT NULL,
    name JSONB,
    price_cents INTEGER,
    regular_price_cents INTEGER,
    sale_price_cents INTEGER,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    stock_status TEXT NOT NULL DEFAULT 'instock',
    image JSONB,
    organization_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, sku_id),
    UNIQUE (id, organization_id),
    FOREIGN KEY (product_id, organization_id)
        REFERENCES plugin_com_wordrhyme_shop_products (id, organization_id)
        ON DELETE CASCADE
);

-- Orders
CREATE TABLE IF NOT EXISTS plugin_com_wordrhyme_shop_orders (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    order_number TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    currency TEXT NOT NULL DEFAULT 'USD',
    subtotal_price_cents INTEGER,
    total_price_cents INTEGER,
    total_tax_cents INTEGER,
    total_discount_cents INTEGER,
    shipping_price_cents INTEGER,
    payment_method TEXT,
    note TEXT,
    email TEXT,
    phone TEXT,
    shipping JSONB,
    line_items JSONB DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    source TEXT,
    source_status TEXT,
    tracking_number TEXT,
    carrier TEXT,
    tracking_url TEXT,
    fulfilled_at TIMESTAMPTZ,
    organization_id TEXT NOT NULL,
    acl_tags TEXT[] DEFAULT '{}',
    deny_tags TEXT[] DEFAULT '{}',
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    UNIQUE (organization_id, order_id),
    UNIQUE (id, organization_id)
);

-- Order Items (structured line items for query)
CREATE TABLE IF NOT EXISTS plugin_com_wordrhyme_shop_order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT,
    variant_id TEXT,
    sku_id TEXT,
    name JSONB NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price_cents INTEGER NOT NULL,
    total_price_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (order_id, organization_id)
        REFERENCES plugin_com_wordrhyme_shop_orders (id, organization_id)
        ON DELETE CASCADE
);
