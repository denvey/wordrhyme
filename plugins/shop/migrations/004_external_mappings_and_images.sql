-- ============================================================
-- Shop Plugin: External Mappings + Product Images
-- ============================================================

-- External Platform Mappings (supply/sales bidirectional)
CREATE TABLE IF NOT EXISTS plugin_com_wordrhyme_shop_external_mappings (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    direction TEXT NOT NULL,
    external_id TEXT NOT NULL,
    external_sku TEXT,
    external_url TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    last_synced_at TIMESTAMPTZ,
    sync_error TEXT,
    metadata JSONB DEFAULT '{}',
    organization_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, entity_type, entity_id, platform, direction),
    UNIQUE (organization_id, platform, external_id, entity_type)
);

-- Product Images (gallery management)
CREATE TABLE IF NOT EXISTS plugin_com_wordrhyme_shop_product_images (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    variant_id TEXT,
    src TEXT NOT NULL,
    alt JSONB,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_main BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}',
    organization_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (product_id, organization_id)
        REFERENCES plugin_com_wordrhyme_shop_products (id, organization_id)
        ON DELETE CASCADE
);

-- Each product can have at most one main image
CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_product_images_main
    ON plugin_com_wordrhyme_shop_product_images (organization_id, product_id)
    WHERE is_main = true;
