-- Rename sourcing_memo to memo and drop sourcing_platform to sync with schema.ts
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'sourcing_memo'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products" RENAME COLUMN "sourcing_memo" TO "memo";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plugin_com_wordrhyme_shop_products'
      AND column_name = 'sourcing_platform'
  ) THEN
    ALTER TABLE "plugin_com_wordrhyme_shop_products" DROP COLUMN "sourcing_platform";
  END IF;
END $$;
