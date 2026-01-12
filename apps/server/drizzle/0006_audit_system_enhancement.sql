-- Audit System Enhancement Migration
-- Adds user_agent, trace_id fields; creates archive tables; adds indexes

-- ============================================
-- 1. Add new columns to audit_events
-- ============================================
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "trace_id" text;

-- ============================================
-- 2. Add new columns to audit_logs
-- ============================================
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_ip" text;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "trace_id" text;

-- ============================================
-- 3. Create audit_events_archive table
-- ============================================
CREATE TABLE IF NOT EXISTS "audit_events_archive" (
  "id" text PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "tenant_id" text,
  "action" text NOT NULL,
  "changes" jsonb,
  "metadata" jsonb,
  "actor_id" text NOT NULL,
  "actor_type" text NOT NULL DEFAULT 'user',
  "actor_ip" text,
  "user_agent" text,
  "trace_id" text,
  "request_id" text,
  "session_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "archived_at" timestamp DEFAULT now() NOT NULL
);

-- Archive table indexes
CREATE INDEX IF NOT EXISTS "audit_events_archive_entity_idx" ON "audit_events_archive" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "audit_events_archive_tenant_idx" ON "audit_events_archive" ("tenant_id");
CREATE INDEX IF NOT EXISTS "audit_events_archive_time_idx" ON "audit_events_archive" ("created_at");

-- ============================================
-- 4. Create audit_logs_archive table
-- ============================================
CREATE TABLE IF NOT EXISTS "audit_logs_archive" (
  "id" text PRIMARY KEY NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text NOT NULL,
  "tenant_id" text NOT NULL,
  "organization_id" text,
  "action" text NOT NULL,
  "resource" text,
  "result" text NOT NULL,
  "reason" text,
  "metadata" jsonb,
  "actor_ip" text,
  "user_agent" text,
  "trace_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "archived_at" timestamp DEFAULT now() NOT NULL
);

-- Archive table indexes
CREATE INDEX IF NOT EXISTS "audit_logs_archive_tenant_idx" ON "audit_logs_archive" ("tenant_id");
CREATE INDEX IF NOT EXISTS "audit_logs_archive_actor_idx" ON "audit_logs_archive" ("actor_type", "actor_id");
CREATE INDEX IF NOT EXISTS "audit_logs_archive_time_idx" ON "audit_logs_archive" ("created_at");

-- ============================================
-- 5. Add trace_id index to main tables
-- ============================================
CREATE INDEX IF NOT EXISTS "audit_events_trace_idx" ON "audit_events" ("trace_id");
CREATE INDEX IF NOT EXISTS "audit_logs_trace_idx" ON "audit_logs" ("trace_id");
