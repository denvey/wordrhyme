-- Settings System Migration
-- Creates audit_events, settings, setting_schemas, feature_flags, and feature_flag_overrides tables

-- Audit Events Table (generic audit logging)
CREATE TABLE IF NOT EXISTS "audit_events" (
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
  "request_id" text,
  "session_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_tenant_idx" ON "audit_events" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_time_idx" ON "audit_events" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_action_idx" ON "audit_events" USING btree ("entity_type", "action");
--> statement-breakpoint

-- Settings Table
CREATE TABLE IF NOT EXISTS "settings" (
  "id" text PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "scope_id" text,
  "tenant_id" text,
  "key" text NOT NULL,
  "value" jsonb,
  "value_type" text DEFAULT 'string',
  "encrypted" boolean NOT NULL DEFAULT false,
  "schema_version" integer NOT NULL DEFAULT 1,
  "description" text,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "idx_settings_unique" ON "settings" USING btree ("scope", COALESCE("scope_id", ''), COALESCE("tenant_id", ''), "key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_settings_scope_key" ON "settings" USING btree ("scope", "key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_settings_tenant" ON "settings" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_settings_plugin" ON "settings" USING btree ("scope_id");
--> statement-breakpoint

-- Setting Schemas Table
CREATE TABLE IF NOT EXISTS "setting_schemas" (
  "id" text PRIMARY KEY NOT NULL,
  "key_pattern" text NOT NULL,
  "schema" jsonb NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "default_value" jsonb,
  "description" text,
  "deprecated" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "idx_setting_schemas_pattern_version" ON "setting_schemas" USING btree ("key_pattern", "version");
--> statement-breakpoint

-- Feature Flags Table
CREATE TABLE IF NOT EXISTS "feature_flags" (
  "id" text PRIMARY KEY NOT NULL,
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "enabled" boolean NOT NULL DEFAULT false,
  "rollout_percentage" integer NOT NULL DEFAULT 100,
  "conditions" jsonb NOT NULL DEFAULT '[]',
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_feature_flags_key" ON "feature_flags" USING btree ("key");
--> statement-breakpoint

-- Feature Flag Overrides Table
CREATE TABLE IF NOT EXISTS "feature_flag_overrides" (
  "id" text PRIMARY KEY NOT NULL,
  "flag_id" text NOT NULL REFERENCES "feature_flags"("id") ON DELETE CASCADE,
  "tenant_id" text NOT NULL,
  "enabled" boolean NOT NULL,
  "rollout_percentage" integer,
  "conditions" jsonb,
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "idx_ff_overrides_flag_tenant" ON "feature_flag_overrides" USING btree ("flag_id", "tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ff_overrides_tenant" ON "feature_flag_overrides" USING btree ("tenant_id");
