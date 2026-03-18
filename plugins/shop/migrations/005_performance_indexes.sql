-- ============================================================
-- Shop Plugin: Performance Indexes
-- ============================================================

-- Products
CREATE INDEX IF NOT EXISTS idx_shop_products_org_status
    ON plugin_com_wordrhyme_shop_products (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_shop_products_org_source
    ON plugin_com_wordrhyme_shop_products (organization_id, source);
CREATE INDEX IF NOT EXISTS idx_shop_products_org_created
    ON plugin_com_wordrhyme_shop_products (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_products_acl_tags
    ON plugin_com_wordrhyme_shop_products USING GIN (acl_tags);

-- Product Variations
CREATE INDEX IF NOT EXISTS idx_shop_variations_product
    ON plugin_com_wordrhyme_shop_product_variations (product_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_shop_variations_org
    ON plugin_com_wordrhyme_shop_product_variations (organization_id);

-- Attributes
CREATE INDEX IF NOT EXISTS idx_shop_attributes_org
    ON plugin_com_wordrhyme_shop_attributes (organization_id, sort_order);

-- Attribute Values
CREATE INDEX IF NOT EXISTS idx_shop_attr_values_attr
    ON plugin_com_wordrhyme_shop_attribute_values (attribute_id, sort_order);

-- Product Attributes
CREATE INDEX IF NOT EXISTS idx_shop_prod_attrs_product
    ON plugin_com_wordrhyme_shop_product_attributes (product_id);
CREATE INDEX IF NOT EXISTS idx_shop_prod_attrs_variation
    ON plugin_com_wordrhyme_shop_product_attributes (product_id)
    WHERE is_variation = true;

-- Categories
CREATE INDEX IF NOT EXISTS idx_shop_categories_org_parent
    ON plugin_com_wordrhyme_shop_categories (organization_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_shop_categories_org_sort
    ON plugin_com_wordrhyme_shop_categories (organization_id, sort_order);

-- Orders
CREATE INDEX IF NOT EXISTS idx_shop_orders_org_status
    ON plugin_com_wordrhyme_shop_orders (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_shop_orders_org_created
    ON plugin_com_wordrhyme_shop_orders (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_orders_org_source
    ON plugin_com_wordrhyme_shop_orders (organization_id, source);
CREATE INDEX IF NOT EXISTS idx_shop_orders_acl_tags
    ON plugin_com_wordrhyme_shop_orders USING GIN (acl_tags);

-- Order Items
CREATE INDEX IF NOT EXISTS idx_shop_order_items_order
    ON plugin_com_wordrhyme_shop_order_items (order_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_shop_order_items_sku
    ON plugin_com_wordrhyme_shop_order_items (organization_id, sku_id);

-- External Mappings
CREATE INDEX IF NOT EXISTS idx_shop_mappings_entity
    ON plugin_com_wordrhyme_shop_external_mappings (organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_shop_mappings_platform_dir
    ON plugin_com_wordrhyme_shop_external_mappings (organization_id, platform, direction);
CREATE INDEX IF NOT EXISTS idx_shop_mappings_sync_status
    ON plugin_com_wordrhyme_shop_external_mappings (organization_id, sync_status);

-- Product Images
CREATE INDEX IF NOT EXISTS idx_shop_images_product
    ON plugin_com_wordrhyme_shop_product_images (product_id, organization_id, sort_order);
