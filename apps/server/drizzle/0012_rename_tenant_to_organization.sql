-- Migration: Rename tenant_id to organization_id for consistency
-- Date: 2026-01-22
-- Purpose: Unify naming convention across all tables to use organizationId

-- 1. menus table
ALTER TABLE "menus" RENAME COLUMN "tenant_id" TO "organization_id";

-- 2. assets table
ALTER TABLE "assets" RENAME COLUMN "tenant_id" TO "organization_id";

-- 3. billing_plans table
ALTER TABLE "billing_plans" RENAME COLUMN "tenant_id" TO "organization_id";

-- 4. billing_subscriptions table
ALTER TABLE "billing_subscriptions" RENAME COLUMN "tenant_id" TO "organization_id";

-- 5. files table
ALTER TABLE "files" RENAME COLUMN "tenant_id" TO "organization_id";

-- 6. notifications table
ALTER TABLE "notifications" RENAME COLUMN "tenant_id" TO "organization_id";

-- 7. notification_preferences table
ALTER TABLE "notification_preferences" RENAME COLUMN "tenant_id" TO "organization_id";

-- 8. audit_logs table
ALTER TABLE "audit_logs" RENAME COLUMN "tenant_id" TO "organization_id";

-- 9. audit_events table
ALTER TABLE "audit_events" RENAME COLUMN "tenant_id" TO "organization_id";

-- 10. feature_flags table
ALTER TABLE "feature_flags" RENAME COLUMN "tenant_id" TO "organization_id";

-- 11. scheduled_tasks table
ALTER TABLE "scheduled_tasks" RENAME COLUMN "tenant_id" TO "organization_id";

-- 12. scheduled_task_history table
ALTER TABLE "scheduled_task_history" RENAME COLUMN "tenant_id" TO "organization_id";

-- 13. plugin_schemas table
ALTER TABLE "plugin_schemas" RENAME COLUMN "tenant_id" TO "organization_id";
