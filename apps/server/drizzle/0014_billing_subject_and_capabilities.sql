-- Migration: billing schema - add capabilities table, rename feature_key to subject, add overage_policy
-- This migration:
-- 1. Creates the capabilities table
-- 2. Renames feature_key → subject in plan_items, user_quotas, tenant_quotas, usage_records
-- 3. Adds overage_policy column to plan_items
-- 4. Adds subject index to plan_items

-- ============================================================
-- 1. Create capabilities table
-- ============================================================

CREATE TABLE IF NOT EXISTS "capabilities" (
  "subject" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "unit" text,
  "description" text,
  "source" text NOT NULL,
  "plugin_id" text,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_capabilities_source_status" ON "capabilities" USING btree ("source","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_capabilities_plugin_id" ON "capabilities" USING btree ("plugin_id");

-- ============================================================
-- 2. Rename feature_key → subject in plan_items
-- ============================================================

ALTER TABLE "plan_items" RENAME COLUMN "feature_key" TO "subject";
--> statement-breakpoint

-- 3. Add overage_policy to plan_items
ALTER TABLE "plan_items" ADD COLUMN IF NOT EXISTS "overage_policy" text DEFAULT 'deny';
--> statement-breakpoint

-- 4. Add subject index to plan_items
CREATE INDEX IF NOT EXISTS "idx_plan_items_subject" ON "plan_items" USING btree ("subject");

-- ============================================================
-- 5. Rename feature_key → subject in user_quotas
-- ============================================================

ALTER TABLE "user_quotas" RENAME COLUMN "feature_key" TO "subject";
--> statement-breakpoint

-- Drop old indexes (they reference the old column name)
DROP INDEX IF EXISTS "idx_user_quotas_user_feature";
DROP INDEX IF EXISTS "idx_user_quotas_waterfall";
DROP INDEX IF EXISTS "uq_user_quotas_source";
--> statement-breakpoint

-- Recreate indexes with new column name
CREATE INDEX IF NOT EXISTS "idx_user_quotas_user_feature" ON "user_quotas" USING btree ("user_id","subject");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_quotas_waterfall" ON "user_quotas" USING btree ("user_id","subject","balance","priority","expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_quotas_source" ON "user_quotas" USING btree ("user_id","subject","source_type","source_id");

-- ============================================================
-- 6. Rename feature_key → subject in usage_records
-- ============================================================

ALTER TABLE "usage_records" RENAME COLUMN "feature_key" TO "subject";
--> statement-breakpoint

DROP INDEX IF EXISTS "idx_usage_records_user_feature";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_records_user_feature" ON "usage_records" USING btree ("user_id","subject");

-- ============================================================
-- 7. Rename feature_key → subject in tenant_quotas
-- ============================================================

ALTER TABLE "tenant_quotas" RENAME COLUMN "feature_key" TO "subject";
--> statement-breakpoint

DROP INDEX IF EXISTS "idx_tenant_quotas_tenant_feature";
DROP INDEX IF EXISTS "idx_tenant_quotas_waterfall";
DROP INDEX IF EXISTS "uq_tenant_quotas_source";
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_tenant_quotas_tenant_feature" ON "tenant_quotas" USING btree ("organization_id","subject");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_quotas_waterfall" ON "tenant_quotas" USING btree ("organization_id","subject","balance","priority","expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tenant_quotas_source" ON "tenant_quotas" USING btree ("organization_id","subject","source_type","source_id");
