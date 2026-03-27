-- Convert SPU/SKU id chains from text to bigint while preserving existing relations.
-- Runtime/API can still expose them as strings; the storage layer becomes numeric.

DO $$
DECLARE
  max_spu bigint;
  max_sku bigint;
BEGIN
  ALTER TABLE "plugin_com_wordrhyme_shop_product_variations"
    DROP CONSTRAINT IF EXISTS "plugin_com_wordrhyme_shop_product_variations_spu_id_organizatio";

  ALTER TABLE "plugin_com_wordrhyme_shop_product_attributes"
    DROP CONSTRAINT IF EXISTS "plugin_com_wordrhyme_shop_product_attributes_spu_id_organizatio";

  ALTER TABLE "plugin_com_wordrhyme_shop_product_categories"
    DROP CONSTRAINT IF EXISTS "plugin_com_wordrhyme_shop_product_categories_spu_id_organizatio";

  ALTER TABLE "plugin_com_wordrhyme_shop_product_images"
    DROP CONSTRAINT IF EXISTS "plugin_com_wordrhyme_shop_product_images_spu_id_organization_id";

  ALTER TABLE "plugin_com_wordrhyme_shop_variant_attribute_values"
    DROP CONSTRAINT IF EXISTS "plugin_com_wordrhyme_shop_variant_attribute_values_sku_id_organ";

  SELECT COALESCE(MAX(spu_id::bigint), 0)
    INTO max_spu
  FROM "plugin_com_wordrhyme_shop_products"
  WHERE spu_id ~ '^[0-9]+$';

  SELECT COALESCE(MAX(sku_id::bigint), 0)
    INTO max_sku
  FROM "plugin_com_wordrhyme_shop_product_variations"
  WHERE sku_id ~ '^[0-9]+$';

  CREATE TEMP TABLE tmp_shop_spu_id_map (
    old_id text PRIMARY KEY,
    new_id bigint NOT NULL UNIQUE
  ) ON COMMIT DROP;

  INSERT INTO tmp_shop_spu_id_map (old_id, new_id)
  SELECT
    spu_id,
    max_spu + ROW_NUMBER() OVER (ORDER BY spu_id)
  FROM "plugin_com_wordrhyme_shop_products"
  WHERE spu_id IS NOT NULL
    AND spu_id !~ '^[0-9]+$';

  CREATE TEMP TABLE tmp_shop_sku_id_map (
    old_id text PRIMARY KEY,
    new_id bigint NOT NULL UNIQUE
  ) ON COMMIT DROP;

  INSERT INTO tmp_shop_sku_id_map (old_id, new_id)
  SELECT
    sku_id,
    max_sku + ROW_NUMBER() OVER (ORDER BY sku_id)
  FROM "plugin_com_wordrhyme_shop_product_variations"
  WHERE sku_id IS NOT NULL
    AND sku_id !~ '^[0-9]+$';

  -- Rewrite SKU references first so variation PK updates remain valid.
  UPDATE "plugin_com_wordrhyme_shop_variant_attribute_values" v
  SET sku_id = m.new_id::text
  FROM tmp_shop_sku_id_map m
  WHERE v.sku_id = m.old_id;

  UPDATE "plugin_com_wordrhyme_shop_order_items" oi
  SET sku_id = m.new_id::text
  FROM tmp_shop_sku_id_map m
  WHERE oi.sku_id = m.old_id;

  UPDATE "plugin_com_wordrhyme_shop_product_images" pi
  SET sku_id = m.new_id::text
  FROM tmp_shop_sku_id_map m
  WHERE pi.sku_id = m.old_id;

  UPDATE "plugin_com_wordrhyme_shop_external_mappings" em
  SET entity_id = m.new_id::text
  FROM tmp_shop_sku_id_map m
  WHERE em.entity_id = m.old_id
    AND em.entity_type IN ('variation', 'sku');

  UPDATE "plugin_com_wordrhyme_shop_product_variations" pv
  SET sku_id = m.new_id::text
  FROM tmp_shop_sku_id_map m
  WHERE pv.sku_id = m.old_id;

  -- Rewrite SPU references.
  UPDATE "plugin_com_wordrhyme_shop_product_variations" pv
  SET spu_id = m.new_id::text
  FROM tmp_shop_spu_id_map m
  WHERE pv.spu_id = m.old_id;

  UPDATE "plugin_com_wordrhyme_shop_product_attributes" pa
  SET spu_id = m.new_id::text
  FROM tmp_shop_spu_id_map m
  WHERE pa.spu_id = m.old_id;

  UPDATE "plugin_com_wordrhyme_shop_product_categories" pc
  SET spu_id = m.new_id::text
  FROM tmp_shop_spu_id_map m
  WHERE pc.spu_id = m.old_id;

  UPDATE "plugin_com_wordrhyme_shop_product_images" pi
  SET spu_id = m.new_id::text
  FROM tmp_shop_spu_id_map m
  WHERE pi.spu_id = m.old_id;

  UPDATE "plugin_com_wordrhyme_shop_order_items" oi
  SET spu_id = m.new_id::text
  FROM tmp_shop_spu_id_map m
  WHERE oi.spu_id = m.old_id;

  UPDATE "plugin_com_wordrhyme_shop_external_mappings" em
  SET entity_id = m.new_id::text
  FROM tmp_shop_spu_id_map m
  WHERE em.entity_id = m.old_id
    AND em.entity_type = 'product';

  UPDATE "plugin_com_wordrhyme_shop_products" p
  SET spu_id = m.new_id::text
  FROM tmp_shop_spu_id_map m
  WHERE p.spu_id = m.old_id;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'spu_id'
      AND column_default IS NOT NULL
      AND is_identity = 'NO'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products"
      ALTER COLUMN "spu_id" DROP DEFAULT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'spu_id'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products"
      ALTER COLUMN "spu_id" TYPE bigint USING spu_id::bigint;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations'
      AND column_name = 'sku_id'
      AND column_default IS NOT NULL
      AND is_identity = 'NO'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations"
      ALTER COLUMN "sku_id" DROP DEFAULT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations'
      AND column_name = 'sku_id'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations"
      ALTER COLUMN "sku_id" TYPE bigint USING sku_id::bigint;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations'
      AND column_name = 'spu_id'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations"
      ALTER COLUMN "spu_id" TYPE bigint USING spu_id::bigint;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_order_items'
      AND column_name = 'spu_id'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_order_items"
      ALTER COLUMN "spu_id" TYPE bigint USING CASE WHEN spu_id IS NULL THEN NULL ELSE spu_id::bigint END;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_order_items'
      AND column_name = 'sku_id'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_order_items"
      ALTER COLUMN "sku_id" TYPE bigint USING CASE WHEN sku_id IS NULL THEN NULL ELSE sku_id::bigint END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_product_attributes'
      AND column_name = 'spu_id'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_attributes"
      ALTER COLUMN "spu_id" TYPE bigint USING spu_id::bigint;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_variant_attribute_values'
      AND column_name = 'sku_id'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_variant_attribute_values"
      ALTER COLUMN "sku_id" TYPE bigint USING sku_id::bigint;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_product_categories'
      AND column_name = 'spu_id'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_categories"
      ALTER COLUMN "spu_id" TYPE bigint USING spu_id::bigint;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_product_images'
      AND column_name = 'spu_id'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_images"
      ALTER COLUMN "spu_id" TYPE bigint USING spu_id::bigint;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_product_images'
      AND column_name = 'sku_id'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_images"
      ALTER COLUMN "sku_id" TYPE bigint USING CASE WHEN sku_id IS NULL THEN NULL ELSE sku_id::bigint END;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'spu_id'
      AND is_identity = 'YES'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products"
      ALTER COLUMN "spu_id" ADD GENERATED BY DEFAULT AS IDENTITY;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_variations_spu_org_fk') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations"
      ADD CONSTRAINT "shop_variations_spu_org_fk"
      FOREIGN KEY ("spu_id", "organization_id")
      REFERENCES "plugin_com_wordrhyme_shop_products"("spu_id", "organization_id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_product_attrs_spu_org_fk') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_attributes"
      ADD CONSTRAINT "shop_product_attrs_spu_org_fk"
      FOREIGN KEY ("spu_id", "organization_id")
      REFERENCES "plugin_com_wordrhyme_shop_products"("spu_id", "organization_id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_product_categories_spu_org_fk') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_categories"
      ADD CONSTRAINT "shop_product_categories_spu_org_fk"
      FOREIGN KEY ("spu_id", "organization_id")
      REFERENCES "plugin_com_wordrhyme_shop_products"("spu_id", "organization_id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_product_images_spu_org_fk') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_images"
      ADD CONSTRAINT "shop_product_images_spu_org_fk"
      FOREIGN KEY ("spu_id", "organization_id")
      REFERENCES "plugin_com_wordrhyme_shop_products"("spu_id", "organization_id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_variant_attr_vals_sku_org_fk') THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_variant_attribute_values"
      ADD CONSTRAINT "shop_variant_attr_vals_sku_org_fk"
      FOREIGN KEY ("sku_id", "organization_id")
      REFERENCES "plugin_com_wordrhyme_shop_product_variations"("sku_id", "organization_id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_product_variations'
      AND column_name = 'sku_id'
      AND is_identity = 'YES'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_product_variations"
      ALTER COLUMN "sku_id" ADD GENERATED BY DEFAULT AS IDENTITY;
  END IF;
END $$;

DO $$
DECLARE
  next_spu bigint;
  next_sku bigint;
BEGIN
  SELECT COALESCE(MAX(spu_id), 0) + 1
    INTO next_spu
  FROM "plugin_com_wordrhyme_shop_products";

  EXECUTE format(
    'ALTER TABLE "plugin_com_wordrhyme_shop_products" ALTER COLUMN "spu_id" RESTART WITH %s',
    next_spu
  );

  SELECT COALESCE(MAX(sku_id), 0) + 1
    INTO next_sku
  FROM "plugin_com_wordrhyme_shop_product_variations";

  EXECUTE format(
    'ALTER TABLE "plugin_com_wordrhyme_shop_product_variations" ALTER COLUMN "sku_id" RESTART WITH %s',
    next_sku
  );
END $$;
