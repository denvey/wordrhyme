-- Ensure plan_items matches current billing schema for environments
-- where older migrations ran without later billing updates.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'plan_items'
      AND column_name = 'feature_key'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'plan_items'
      AND column_name = 'subject'
  ) THEN
    ALTER TABLE "plan_items" RENAME COLUMN "feature_key" TO "subject";
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "plan_items" ADD COLUMN IF NOT EXISTS "overage_policy" text DEFAULT 'deny';
--> statement-breakpoint
ALTER TABLE "plan_items" ADD COLUMN IF NOT EXISTS "reset_strategy" text DEFAULT 'hard';
--> statement-breakpoint
ALTER TABLE "plan_items" ADD COLUMN IF NOT EXISTS "reset_cap" integer;
--> statement-breakpoint
ALTER TABLE "plan_items" ADD COLUMN IF NOT EXISTS "quota_scope" text DEFAULT 'tenant' NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_plan_items_subject" ON "plan_items" USING btree ("subject");
