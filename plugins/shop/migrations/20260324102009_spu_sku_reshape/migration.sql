-- SPU/SKU Reshape Migration (idempotent)
-- Handles the transition from legacy id/product_id/variant_id to spu_id/sku_id
-- Covers three scenarios for each table:
--   A) Fresh install: columns already have correct names (drizzle baseline) → skip
--   B) Old schema, no prior attempt: rename id→spu_id/sku_id
--   C) Old schema, prior failed attempt: both id and spu_id exist → merge and drop old

-- ============================================================
-- Step 0: Drop all FK constraints that reference old column names
-- These need to be dropped before we can modify the referenced columns
-- ============================================================
DO $$ BEGIN
  -- products.id referenced by: variations, product_attributes, product_categories, product_images
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plugin_com_wordrhyme_shop_produ_product_id_organization_id_fkey') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" DROP CONSTRAINT "plugin_com_wordrhyme_shop_produ_product_id_organization_id_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plugin_com_wordrhyme_shop_prod_product_id_organization_id_fkey1') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_attributes" DROP CONSTRAINT "plugin_com_wordrhyme_shop_prod_product_id_organization_id_fkey1";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plugin_com_wordrhyme_shop_prod_product_id_organization_id_fkey2') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_categories" DROP CONSTRAINT "plugin_com_wordrhyme_shop_prod_product_id_organization_id_fkey2";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plugin_com_wordrhyme_shop_prod_product_id_organization_id_fkey3') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_images" DROP CONSTRAINT "plugin_com_wordrhyme_shop_prod_product_id_organization_id_fkey3";
  END IF;
  -- variations.id referenced by: variant_attribute_values
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plugin_com_wordrhyme_shop_varia_variant_id_organization_id_fkey') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_variant_attribute_values" DROP CONSTRAINT "plugin_com_wordrhyme_shop_varia_variant_id_organization_id_fkey";
  END IF;
END $$;

-- ============================================================
-- 1. Products: id → spu_id
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_products' AND column_name = 'id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_products' AND column_name = 'spu_id') THEN
      -- Both exist: merge data, drop old PK, drop id, set spu_id as PK
      UPDATE "plugin_com_wordrhyme_shop_products" SET spu_id = id WHERE spu_id IS NULL OR spu_id = '';
      ALTER TABLE "plugin_com_wordrhyme_shop_products" DROP CONSTRAINT IF EXISTS plugin_com_wordrhyme_shop_products_pkey;
      ALTER TABLE "plugin_com_wordrhyme_shop_products" DROP COLUMN id;
      ALTER TABLE "plugin_com_wordrhyme_shop_products" ADD PRIMARY KEY (spu_id);
    ELSE
      -- Only id exists: simple rename
      ALTER TABLE "plugin_com_wordrhyme_shop_products" RENAME COLUMN "id" TO "spu_id";
    END IF;
  END IF;

  -- Add new columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_products' AND column_name = 'spu_code') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products" ADD COLUMN "spu_code" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_products' AND column_name = 'sourcing_platform') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products" ADD COLUMN "sourcing_platform" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_products' AND column_name = 'sourcing_memo') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products" ADD COLUMN "sourcing_memo" text;
  END IF;
END $$;

-- ============================================================
-- 2. Variations: id → sku_id, product_id → spu_id, add physical attrs
-- ============================================================
DO $$ BEGIN
  -- Handle id → sku_id
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations' AND column_name = 'id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations' AND column_name = 'sku_id') THEN
      UPDATE "plugin_com_wordrhyme_shop_product_variations" SET sku_id = id WHERE sku_id IS NULL OR sku_id = '';
      ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" DROP CONSTRAINT IF EXISTS plugin_com_wordrhyme_shop_product_variations_pkey;
      ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" DROP COLUMN id;
      ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD PRIMARY KEY (sku_id);
    ELSE
      ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" RENAME COLUMN "id" TO "sku_id";
    END IF;
  END IF;

  -- Handle product_id → spu_id
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations' AND column_name = 'product_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations' AND column_name = 'spu_id') THEN
      UPDATE "plugin_com_wordrhyme_shop_product_variations" SET spu_id = product_id WHERE (spu_id IS NULL OR spu_id = '') AND product_id IS NOT NULL;
      ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" DROP COLUMN product_id;
    ELSE
      ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" RENAME COLUMN "product_id" TO "spu_id";
    END IF;
  END IF;

  -- Add new columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations' AND column_name = 'sku_code') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD COLUMN "sku_code" text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations' AND column_name = 'sku_type') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD COLUMN "sku_type" text NOT NULL DEFAULT 'single';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations' AND column_name = 'weight') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD COLUMN "weight" integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations' AND column_name = 'length') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD COLUMN "length" integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations' AND column_name = 'width') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD COLUMN "width" integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations' AND column_name = 'height') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD COLUMN "height" integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations' AND column_name = 'attribute_type') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD COLUMN "attribute_type" text NOT NULL DEFAULT 'general';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations' AND column_name = 'purchase_cost') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD COLUMN "purchase_cost" integer;
  END IF;
END $$;

-- ============================================================
-- 3. Product Attributes: product_id → spu_id
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_attributes' AND column_name = 'product_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_attributes' AND column_name = 'spu_id') THEN
      UPDATE "plugin_com_wordrhyme_shop_product_attributes" SET spu_id = product_id WHERE (spu_id IS NULL OR spu_id = '') AND product_id IS NOT NULL;
      ALTER TABLE "plugin_com_wordrhyme_shop_product_attributes" DROP COLUMN product_id;
    ELSE
      ALTER TABLE "plugin_com_wordrhyme_shop_product_attributes" RENAME COLUMN "product_id" TO "spu_id";
    END IF;
  END IF;
END $$;

-- ============================================================
-- 4. Variant Attribute Values: variant_id → sku_id
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_variant_attribute_values' AND column_name = 'variant_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_variant_attribute_values' AND column_name = 'sku_id') THEN
      UPDATE "plugin_com_wordrhyme_shop_variant_attribute_values" SET sku_id = variant_id WHERE (sku_id IS NULL OR sku_id = '') AND variant_id IS NOT NULL;
      ALTER TABLE "plugin_com_wordrhyme_shop_variant_attribute_values" DROP COLUMN variant_id;
    ELSE
      ALTER TABLE "plugin_com_wordrhyme_shop_variant_attribute_values" RENAME COLUMN "variant_id" TO "sku_id";
    END IF;
  END IF;
END $$;

-- ============================================================
-- 5. Product Categories: product_id → spu_id
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_categories' AND column_name = 'product_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_categories' AND column_name = 'spu_id') THEN
      UPDATE "plugin_com_wordrhyme_shop_product_categories" SET spu_id = product_id WHERE (spu_id IS NULL OR spu_id = '') AND product_id IS NOT NULL;
      ALTER TABLE "plugin_com_wordrhyme_shop_product_categories" DROP COLUMN product_id;
    ELSE
      ALTER TABLE "plugin_com_wordrhyme_shop_product_categories" RENAME COLUMN "product_id" TO "spu_id";
    END IF;
  END IF;
END $$;

-- ============================================================
-- 6. Product Images: product_id → spu_id, add sku_id
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_images' AND column_name = 'product_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_images' AND column_name = 'spu_id') THEN
      UPDATE "plugin_com_wordrhyme_shop_product_images" SET spu_id = product_id WHERE (spu_id IS NULL OR spu_id = '') AND product_id IS NOT NULL;
      ALTER TABLE "plugin_com_wordrhyme_shop_product_images" DROP COLUMN product_id;
    ELSE
      ALTER TABLE "plugin_com_wordrhyme_shop_product_images" RENAME COLUMN "product_id" TO "spu_id";
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_images' AND column_name = 'variant_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_images' AND column_name = 'sku_id') THEN
      UPDATE "plugin_com_wordrhyme_shop_product_images" SET sku_id = variant_id WHERE (sku_id IS NULL OR sku_id = '') AND variant_id IS NOT NULL;
      ALTER TABLE "plugin_com_wordrhyme_shop_product_images" DROP COLUMN variant_id;
    ELSE
      ALTER TABLE "plugin_com_wordrhyme_shop_product_images" RENAME COLUMN "variant_id" TO "sku_id";
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_product_images' AND column_name = 'sku_id') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_images" ADD COLUMN "sku_id" text;
  END IF;
END $$;

-- ============================================================
-- 7. Order Items: product_id → spu_id, variant_id → sku_id, add sku_code
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_order_items' AND column_name = 'product_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_order_items' AND column_name = 'spu_id') THEN
      UPDATE "plugin_com_wordrhyme_shop_order_items" SET spu_id = product_id WHERE (spu_id IS NULL OR spu_id = '') AND product_id IS NOT NULL;
      ALTER TABLE "plugin_com_wordrhyme_shop_order_items" DROP COLUMN product_id;
    ELSE
      ALTER TABLE "plugin_com_wordrhyme_shop_order_items" RENAME COLUMN "product_id" TO "spu_id";
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_order_items' AND column_name = 'variant_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_order_items' AND column_name = 'sku_id') THEN
      UPDATE "plugin_com_wordrhyme_shop_order_items" SET sku_id = variant_id WHERE (sku_id IS NULL OR sku_id = '') AND variant_id IS NOT NULL;
      ALTER TABLE "plugin_com_wordrhyme_shop_order_items" DROP COLUMN variant_id;
    ELSE
      ALTER TABLE "plugin_com_wordrhyme_shop_order_items" RENAME COLUMN "variant_id" TO "sku_id";
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plugin_com_wordrhyme_shop_order_items' AND column_name = 'sku_code') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_order_items" ADD COLUMN "sku_code" text;
  END IF;
END $$;

-- ============================================================
-- 8. Restore Foreign Key Constraints using new column names
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plugin_com_wordrhyme_shop_product_variations_spu_id_organization_id_fkey') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ADD CONSTRAINT "plugin_com_wordrhyme_shop_product_variations_spu_id_organization_id_fkey" FOREIGN KEY ("spu_id", "organization_id") REFERENCES "plugin_com_wordrhyme_shop_products"("spu_id", "organization_id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plugin_com_wordrhyme_shop_product_attributes_spu_id_organization_id_fkey') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_attributes" ADD CONSTRAINT "plugin_com_wordrhyme_shop_product_attributes_spu_id_organization_id_fkey" FOREIGN KEY ("spu_id", "organization_id") REFERENCES "plugin_com_wordrhyme_shop_products"("spu_id", "organization_id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plugin_com_wordrhyme_shop_product_categories_spu_id_organization_id_fkey') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_categories" ADD CONSTRAINT "plugin_com_wordrhyme_shop_product_categories_spu_id_organization_id_fkey" FOREIGN KEY ("spu_id", "organization_id") REFERENCES "plugin_com_wordrhyme_shop_products"("spu_id", "organization_id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plugin_com_wordrhyme_shop_product_images_spu_id_organization_id_fkey') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_images" ADD CONSTRAINT "plugin_com_wordrhyme_shop_product_images_spu_id_organization_id_fkey" FOREIGN KEY ("spu_id", "organization_id") REFERENCES "plugin_com_wordrhyme_shop_products"("spu_id", "organization_id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plugin_com_wordrhyme_shop_variant_attribute_values_sku_id_organization_id_fkey') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_variant_attribute_values" ADD CONSTRAINT "plugin_com_wordrhyme_shop_variant_attribute_values_sku_id_organization_id_fkey" FOREIGN KEY ("sku_id", "organization_id") REFERENCES "plugin_com_wordrhyme_shop_product_variations"("sku_id", "organization_id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
