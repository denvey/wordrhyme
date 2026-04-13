ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD COLUMN IF NOT EXISTS "cargo_type" text NOT NULL DEFAULT 'general';
ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD COLUMN IF NOT EXISTS "attribute_type" text NOT NULL DEFAULT 'simple';
ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD COLUMN IF NOT EXISTS "shipping_cost" integer;
ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD COLUMN IF NOT EXISTS "packing_cost" integer;
