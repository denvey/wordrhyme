-- Migration 008: Add product info fields (商品信息扩展)
-- Adds: product_type, unit, brand, main_video, keywords, publish_status, publish_at, delist_enabled, delist_at

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'product_type'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products"
      ADD COLUMN "product_type" text NOT NULL DEFAULT 'normal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'unit'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products"
      ADD COLUMN "unit" text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'brand'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products"
      ADD COLUMN "brand" text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'main_video'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products"
      ADD COLUMN "main_video" text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'keywords'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products"
      ADD COLUMN "keywords" text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'publish_status'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products"
      ADD COLUMN "publish_status" text NOT NULL DEFAULT 'immediate';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'publish_at'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products"
      ADD COLUMN "publish_at" timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'delist_enabled'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products"
      ADD COLUMN "delist_enabled" boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'delist_at'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products"
      ADD COLUMN "delist_at" timestamptz;
  END IF;
END $$;
