-- ============================================================
-- Migration 006: Rename tables to match plugin prefix convention
-- Plugin ID: com.wordrhyme.shop → prefix: plugin_com_wordrhyme_shop_
-- ============================================================

ALTER TABLE IF EXISTS plugin_shop_products
    RENAME TO plugin_com_wordrhyme_shop_products;

ALTER TABLE IF EXISTS plugin_shop_product_variations
    RENAME TO plugin_com_wordrhyme_shop_product_variations;

ALTER TABLE IF EXISTS plugin_shop_orders
    RENAME TO plugin_com_wordrhyme_shop_orders;

ALTER TABLE IF EXISTS plugin_shop_order_items
    RENAME TO plugin_com_wordrhyme_shop_order_items;

ALTER TABLE IF EXISTS plugin_shop_attributes
    RENAME TO plugin_com_wordrhyme_shop_attributes;

ALTER TABLE IF EXISTS plugin_shop_attribute_values
    RENAME TO plugin_com_wordrhyme_shop_attribute_values;

ALTER TABLE IF EXISTS plugin_shop_product_attributes
    RENAME TO plugin_com_wordrhyme_shop_product_attributes;

ALTER TABLE IF EXISTS plugin_shop_variant_attribute_values
    RENAME TO plugin_com_wordrhyme_shop_variant_attribute_values;

ALTER TABLE IF EXISTS plugin_shop_categories
    RENAME TO plugin_com_wordrhyme_shop_categories;

ALTER TABLE IF EXISTS plugin_shop_product_categories
    RENAME TO plugin_com_wordrhyme_shop_product_categories;

ALTER TABLE IF EXISTS plugin_shop_external_mappings
    RENAME TO plugin_com_wordrhyme_shop_external_mappings;

ALTER TABLE IF EXISTS plugin_shop_product_images
    RENAME TO plugin_com_wordrhyme_shop_product_images;
