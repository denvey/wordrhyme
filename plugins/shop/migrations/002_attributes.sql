-- ============================================================
-- Shop Plugin: Attribute System (4 tables)
-- ============================================================

-- (1) Global attribute definitions (org-level)
CREATE TABLE IF NOT EXISTS plugin_com_wordrhyme_shop_attributes (
    id TEXT PRIMARY KEY,
    name JSONB NOT NULL,
    slug TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'select',
    sort_order INTEGER NOT NULL DEFAULT 0,
    organization_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, slug),
    UNIQUE (id, organization_id)
);

-- (2) Attribute values/options (global definitions)
CREATE TABLE IF NOT EXISTS plugin_com_wordrhyme_shop_attribute_values (
    id TEXT PRIMARY KEY,
    attribute_id TEXT NOT NULL,
    value JSONB NOT NULL,
    slug TEXT NOT NULL,
    color_hex TEXT,
    image TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    organization_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (attribute_id, slug),
    UNIQUE (id, organization_id),
    FOREIGN KEY (attribute_id, organization_id)
        REFERENCES plugin_com_wordrhyme_shop_attributes (id, organization_id)
        ON DELETE CASCADE
);

-- (3) Product-attribute assignments
CREATE TABLE IF NOT EXISTS plugin_com_wordrhyme_shop_product_attributes (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    attribute_id TEXT NOT NULL,
    visible BOOLEAN NOT NULL DEFAULT true,
    is_variation BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    organization_id TEXT NOT NULL,
    UNIQUE (product_id, attribute_id),
    FOREIGN KEY (product_id, organization_id)
        REFERENCES plugin_com_wordrhyme_shop_products (id, organization_id)
        ON DELETE CASCADE,
    FOREIGN KEY (attribute_id, organization_id)
        REFERENCES plugin_com_wordrhyme_shop_attributes (id, organization_id)
        ON DELETE CASCADE
);

-- (4) Variant-attribute value associations
CREATE TABLE IF NOT EXISTS plugin_com_wordrhyme_shop_variant_attribute_values (
    variant_id TEXT NOT NULL,
    attribute_value_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    PRIMARY KEY (variant_id, attribute_value_id),
    FOREIGN KEY (variant_id, organization_id)
        REFERENCES plugin_com_wordrhyme_shop_product_variations (id, organization_id)
        ON DELETE CASCADE,
    FOREIGN KEY (attribute_value_id, organization_id)
        REFERENCES plugin_com_wordrhyme_shop_attribute_values (id, organization_id)
        ON DELETE CASCADE
);
