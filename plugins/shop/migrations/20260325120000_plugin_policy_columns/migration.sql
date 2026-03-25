-- Ensure every shop plugin table has the platform policy columns expected by pluginTable().

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'plugin_com_wordrhyme_shop_products',
    'plugin_com_wordrhyme_shop_product_variations',
    'plugin_com_wordrhyme_shop_orders',
    'plugin_com_wordrhyme_shop_order_items',
    'plugin_com_wordrhyme_shop_attributes',
    'plugin_com_wordrhyme_shop_attribute_values',
    'plugin_com_wordrhyme_shop_product_attributes',
    'plugin_com_wordrhyme_shop_variant_attribute_values',
    'plugin_com_wordrhyme_shop_categories',
    'plugin_com_wordrhyme_shop_product_categories',
    'plugin_com_wordrhyme_shop_external_mappings',
    'plugin_com_wordrhyme_shop_product_images'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = target_table
        AND column_name = 'acl_tags'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN acl_tags text[] NOT NULL DEFAULT ''{}''::text[]',
        target_table
      );
    ELSE
      EXECUTE format('UPDATE %I SET acl_tags = ''{}''::text[] WHERE acl_tags IS NULL', target_table);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN acl_tags SET DEFAULT ''{}''::text[]', target_table);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN acl_tags SET NOT NULL', target_table);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = target_table
        AND column_name = 'deny_tags'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN deny_tags text[] NOT NULL DEFAULT ''{}''::text[]',
        target_table
      );
    ELSE
      EXECUTE format('UPDATE %I SET deny_tags = ''{}''::text[] WHERE deny_tags IS NULL', target_table);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN deny_tags SET DEFAULT ''{}''::text[]', target_table);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN deny_tags SET NOT NULL', target_table);
    END IF;
  END LOOP;
END $$;
