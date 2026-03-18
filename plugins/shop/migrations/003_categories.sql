-- ============================================================
-- Shop Plugin: Categories (tree structure + product M2M)
-- ============================================================

-- Categories (self-referencing tree)
CREATE TABLE IF NOT EXISTS plugin_com_wordrhyme_shop_categories (
    id TEXT PRIMARY KEY,
    name JSONB NOT NULL,
    slug TEXT NOT NULL,
    description JSONB,
    main_image TEXT,
    parent_id TEXT,
    nested_level INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    seo_title JSONB,
    seo_description JSONB,
    organization_id TEXT NOT NULL,
    acl_tags TEXT[] DEFAULT '{}',
    deny_tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, slug),
    UNIQUE (id, organization_id),
    FOREIGN KEY (parent_id, organization_id)
        REFERENCES plugin_com_wordrhyme_shop_categories (id, organization_id)
        ON DELETE SET NULL
);

-- Product-Category M2M
CREATE TABLE IF NOT EXISTS plugin_com_wordrhyme_shop_product_categories (
    product_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    organization_id TEXT NOT NULL,
    PRIMARY KEY (product_id, category_id),
    FOREIGN KEY (product_id, organization_id)
        REFERENCES plugin_com_wordrhyme_shop_products (id, organization_id)
        ON DELETE CASCADE,
    FOREIGN KEY (category_id, organization_id)
        REFERENCES plugin_com_wordrhyme_shop_categories (id, organization_id)
        ON DELETE CASCADE
);

-- Each product can have at most one primary category
CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_product_categories_primary
    ON plugin_com_wordrhyme_shop_product_categories (organization_id, product_id)
    WHERE is_primary = true;
