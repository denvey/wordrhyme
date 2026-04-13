ALTER TABLE "plugin_com_wordrhyme_shop_products" ADD COLUMN IF NOT EXISTS "custom_parameters" jsonb DEFAULT '[]'::jsonb;
