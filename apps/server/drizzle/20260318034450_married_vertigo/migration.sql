CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"refill_interval" text,
	"refill_amount" text,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" text,
	"rate_limit_max" text,
	"request_count" text,
	"remaining" text,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"logo" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"impersonated_by" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"parent_id" text,
	"path" text,
	"level" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship" (
	"id" text PRIMARY KEY,
	"type" text NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "i18n_languages" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"native_name" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"direction" text DEFAULT 'ltr' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "i18n_messages" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"namespace" text NOT NULL,
	"type" text DEFAULT 'page' NOT NULL,
	"translations" jsonb DEFAULT '{}' NOT NULL,
	"description" text,
	"source" text DEFAULT 'user' NOT NULL,
	"source_id" text,
	"user_modified" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" text PRIMARY KEY,
	"role_id" text NOT NULL,
	"action" text NOT NULL,
	"subject" text NOT NULL,
	"fields" jsonb,
	"conditions" jsonb,
	"inverted" boolean DEFAULT false NOT NULL,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY,
	"capability" text NOT NULL UNIQUE,
	"source" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" text PRIMARY KEY,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"organization_id" text,
	"label" text NOT NULL,
	"icon" text,
	"path" text,
	"open_mode" text DEFAULT 'route' NOT NULL,
	"parent_code" text,
	"order" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"required_permission" text,
	"target" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_configs" (
	"id" text PRIMARY KEY,
	"plugin_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugins" (
	"id" text PRIMARY KEY,
	"plugin_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"version" text NOT NULL,
	"status" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"scheduled_deletion_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "plugin_migrations" (
	"id" text PRIMARY KEY,
	"plugin_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"migration_file" text NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"checksum" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setting_schemas" (
	"id" text PRIMARY KEY,
	"key_pattern" text NOT NULL,
	"schema" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"default_value" jsonb,
	"description" text,
	"deprecated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY,
	"scope" text NOT NULL,
	"scope_id" text,
	"organization_id" text,
	"key" text NOT NULL,
	"value" jsonb,
	"value_type" text DEFAULT 'string',
	"encrypted" boolean DEFAULT false NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"description" text,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flag_overrides" (
	"id" text PRIMARY KEY,
	"flag_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"enabled" boolean NOT NULL,
	"rollout_percentage" integer,
	"conditions" jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_percentage" integer DEFAULT 100 NOT NULL,
	"conditions" jsonb DEFAULT '[]' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"parent_id" text,
	"variant_name" text,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint DEFAULT 0 NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"storage_bucket" text,
	"public_url" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"checksum" text,
	"width" integer,
	"height" integer,
	"format" text,
	"alt" text,
	"title" text,
	"tags" text[] DEFAULT '{}'::text[],
	"folder_path" text,
	"metadata" jsonb DEFAULT '{}',
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "media_no_self_ref" CHECK ("parent_id" IS DISTINCT FROM "id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"actor_id" text,
	"entity_id" text,
	"entity_type" text,
	"template_key" text,
	"template_variables" jsonb,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"read" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"channels_sent" jsonb,
	"channels_failed" jsonb,
	"email_sent" boolean DEFAULT false NOT NULL,
	"email_sent_at" timestamp,
	"group_key" text,
	"group_count" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text UNIQUE,
	"source_plugin_id" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"source" text DEFAULT 'system' NOT NULL,
	"category" text DEFAULT 'system' NOT NULL,
	"latest_actors" jsonb DEFAULT '[]',
	"pinned" boolean DEFAULT false NOT NULL,
	"visual_priority" text DEFAULT 'medium' NOT NULL,
	"actor" jsonb,
	"target" jsonb,
	"aggregation_strategy" text DEFAULT 'none' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"title" jsonb NOT NULL,
	"message" jsonb NOT NULL,
	"variables" jsonb,
	"default_channels" jsonb DEFAULT '["in-app"]' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"plugin_id" text,
	"deprecated" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"icon" text,
	"plugin_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config_schema" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"enabled_channels" jsonb DEFAULT '["in-app"]' NOT NULL,
	"template_overrides" jsonb,
	"quiet_hours" jsonb,
	"email_frequency" text DEFAULT 'instant' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"action" text NOT NULL,
	"resource" text,
	"result" text NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"actor_ip" text,
	"user_agent" text,
	"trace_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"organization_id" text,
	"action" text NOT NULL,
	"changes" jsonb,
	"metadata" jsonb,
	"actor_id" text NOT NULL,
	"actor_type" text DEFAULT 'user' NOT NULL,
	"actor_ip" text,
	"user_agent" text,
	"request_id" text,
	"session_id" text,
	"trace_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events_archive" (
	"id" text PRIMARY KEY,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"organization_id" text,
	"action" text NOT NULL,
	"changes" jsonb,
	"metadata" jsonb,
	"actor_id" text NOT NULL,
	"actor_type" text DEFAULT 'user' NOT NULL,
	"actor_ip" text,
	"user_agent" text,
	"request_id" text,
	"session_id" text,
	"trace_id" text,
	"created_at" timestamp NOT NULL,
	"archived_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs_archive" (
	"id" text PRIMARY KEY,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"action" text NOT NULL,
	"resource" text,
	"result" text NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"actor_ip" text,
	"user_agent" text,
	"trace_id" text,
	"created_at" timestamp NOT NULL,
	"archived_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_ownerships" (
	"id" text PRIMARY KEY,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"level" text DEFAULT 'read' NOT NULL,
	"inherited_from_type" text,
	"inherited_from_id" text,
	"organization_id" text NOT NULL,
	"expire_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "ownership_audit_log" (
	"id" text PRIMARY KEY,
	"ownership_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"action" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"actor_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"reason" text,
	"organization_id" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capabilities" (
	"subject" text PRIMARY KEY,
	"type" text NOT NULL,
	"unit" text,
	"description" text,
	"source" text NOT NULL,
	"plugin_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"plan_id" text NOT NULL,
	"subject" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer,
	"reset_mode" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"overage_policy" text DEFAULT 'deny',
	"overage_price_cents" integer,
	"reset_strategy" text DEFAULT 'hard',
	"reset_cap" integer,
	"quota_scope" text DEFAULT 'tenant' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"billing_cycle_anchor" integer,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"renewal_count" integer DEFAULT 0 NOT NULL,
	"last_renewal_at" timestamp,
	"gateway" text,
	"external_subscription_id" text,
	"initial_transaction_id" uuid,
	"latest_transaction_id" uuid,
	"canceled_at" timestamp,
	"cancel_reason" text,
	"cancel_at_period_end" integer DEFAULT 0,
	"scheduled_plan_id" text,
	"scheduled_change_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"description" text,
	"interval" text NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"price_cents" integer NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"subject" text NOT NULL,
	"balance" integer NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"expires_at" timestamp,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"gateway" text,
	"external_id" text,
	"base_currency" text,
	"base_amount_cents" integer,
	"settlement_currency" text,
	"settlement_amount_cents" integer,
	"exchange_rate" text,
	"exchange_rate_at" timestamp,
	"metadata" jsonb,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"subject" text NOT NULL,
	"amount" integer NOT NULL,
	"quota_ids" jsonb,
	"overage_charged_cents" integer,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"organization_id" text,
	"subject" text NOT NULL,
	"balance" integer NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"user_id" text PRIMARY KEY,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name_i18n" jsonb NOT NULL,
	"symbol" text NOT NULL,
	"decimal_digits" integer DEFAULT 2 NOT NULL,
	"is_enabled" integer DEFAULT 1 NOT NULL,
	"is_base" integer DEFAULT 0 NOT NULL,
	"current_rate" numeric(18,8),
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"base_currency" text NOT NULL,
	"target_currency" text NOT NULL,
	"rate" numeric(18,8) NOT NULL,
	"source" text NOT NULL,
	"effective_at" timestamp NOT NULL,
	"expires_at" timestamp,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"response_code" integer,
	"error" text,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"retry_policy" jsonb DEFAULT '{"attempts":5,"backoffMs":1000}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_outbox" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"lock_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_tasks" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cron_expression" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"handler_type" text NOT NULL,
	"handler_config" jsonb NOT NULL,
	"payload" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_status" text,
	"next_run_at" timestamp with time zone NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"retry_backoff_multiplier" real DEFAULT 2 NOT NULL,
	"provider_id" text DEFAULT 'builtin' NOT NULL,
	"provider_metadata" jsonb,
	"created_by" text NOT NULL,
	"created_by_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduler_providers" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"plugin_id" text,
	"capabilities" jsonb NOT NULL,
	"status" text NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unregistered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_executions" (
	"id" text PRIMARY KEY,
	"task_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"result" jsonb,
	"error" jsonb,
	"lock_key" text NOT NULL,
	"worker_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "apikey_userId_idx" ON "apikey" ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uidx" ON "organization" ("slug");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE INDEX "team_organizationId_idx" ON "team" ("organization_id");--> statement-breakpoint
CREATE INDEX "team_parent_idx" ON "team" ("parent_id");--> statement-breakpoint
CREATE INDEX "team_org_path_idx" ON "team" ("organization_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "teamMember_team_user_uidx" ON "team_member" ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "teamMember_teamId_idx" ON "team_member" ("team_id");--> statement-breakpoint
CREATE INDEX "teamMember_userId_idx" ON "team_member" ("user_id");--> statement-breakpoint
CREATE INDEX "relationship_org_idx" ON "relationship" ("organization_id");--> statement-breakpoint
CREATE INDEX "relationship_source_idx" ON "relationship" ("type","source_id");--> statement-breakpoint
CREATE INDEX "relationship_target_idx" ON "relationship" ("type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_unique_idx" ON "relationship" ("type","source_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "i18n_languages_org_locale_uidx" ON "i18n_languages" ("organization_id","locale");--> statement-breakpoint
CREATE INDEX "i18n_languages_org_idx" ON "i18n_languages" ("organization_id");--> statement-breakpoint
CREATE INDEX "i18n_languages_enabled_idx" ON "i18n_languages" ("organization_id","is_enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "i18n_messages_org_ns_key_uidx" ON "i18n_messages" ("organization_id","namespace","key");--> statement-breakpoint
CREATE INDEX "i18n_messages_org_idx" ON "i18n_messages" ("organization_id");--> statement-breakpoint
CREATE INDEX "i18n_messages_org_ns_idx" ON "i18n_messages" ("organization_id","namespace");--> statement-breakpoint
CREATE INDEX "i18n_messages_source_idx" ON "i18n_messages" ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_slug_uidx" ON "roles" ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "roles_organization_id_idx" ON "roles" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_role_action_subject_uidx" ON "role_permissions" ("role_id","action","subject");--> statement-breakpoint
CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions" ("role_id");--> statement-breakpoint
CREATE INDEX "role_permissions_source_idx" ON "role_permissions" ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "menus_code_org_idx" ON "menus" ("code","organization_id");--> statement-breakpoint
CREATE INDEX "menus_org_idx" ON "menus" ("organization_id");--> statement-breakpoint
CREATE INDEX "menus_target_idx" ON "menus" ("target");--> statement-breakpoint
CREATE INDEX "menus_parent_code_idx" ON "menus" ("parent_code");--> statement-breakpoint
CREATE INDEX "menus_type_idx" ON "menus" ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_config_key" ON "plugin_configs" ("organization_id","plugin_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_plugin_per_org" ON "plugins" ("organization_id","plugin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_plugin_migration" ON "plugin_migrations" ("organization_id","plugin_id","migration_file");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_setting_schemas_pattern_version" ON "setting_schemas" ("key_pattern","version");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_settings_unique" ON "settings" ("scope",COALESCE("scope_id", ''),COALESCE("organization_id", ''),"key");--> statement-breakpoint
CREATE INDEX "idx_settings_scope_key" ON "settings" ("scope","key");--> statement-breakpoint
CREATE INDEX "idx_settings_tenant" ON "settings" ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_settings_plugin" ON "settings" ("scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ff_overrides_flag_tenant" ON "feature_flag_overrides" ("flag_id","organization_id");--> statement-breakpoint
CREATE INDEX "idx_ff_overrides_tenant" ON "feature_flag_overrides" ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_feature_flags_key" ON "feature_flags" ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_storage_unique" ON "media" ("organization_id","storage_provider","storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_parent_variant_unique" ON "media" ("parent_id","variant_name") WHERE "parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_media_org_folder" ON "media" ("organization_id","folder_path") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_media_org_mime" ON "media" ("organization_id","mime_type") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_media_parent" ON "media" ("parent_id") WHERE "parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_media_tags" ON "media" USING gin ("tags") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_media_org_created" ON "media" ("organization_id","created_at") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_media_deleted" ON "media" ("deleted_at") WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_notifications_user_read" ON "notifications" ("user_id","read");--> statement-breakpoint
CREATE INDEX "idx_notifications_template" ON "notifications" ("template_key");--> statement-breakpoint
CREATE INDEX "idx_notifications_group" ON "notifications" ("group_key");--> statement-breakpoint
CREATE INDEX "idx_notifications_expires" ON "notifications" ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_tenant_user" ON "notifications" ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_category" ON "notifications" ("category");--> statement-breakpoint
CREATE INDEX "idx_notifications_source" ON "notifications" ("source");--> statement-breakpoint
CREATE INDEX "idx_notifications_pinned" ON "notifications" ("pinned");--> statement-breakpoint
CREATE INDEX "idx_notifications_cleanup" ON "notifications" ("category","read","created_at");--> statement-breakpoint
CREATE INDEX "idx_templates_plugin" ON "notification_templates" ("plugin_id");--> statement-breakpoint
CREATE INDEX "idx_templates_category" ON "notification_templates" ("category");--> statement-breakpoint
CREATE INDEX "idx_channels_plugin" ON "notification_channels" ("plugin_id");--> statement-breakpoint
CREATE INDEX "idx_channels_enabled" ON "notification_channels" ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_preferences_user_tenant" ON "notification_preferences" ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "audit_logs_organization_idx" ON "audit_logs" ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_trace_idx" ON "audit_logs" ("trace_id");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_organization_idx" ON "audit_events" ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_time_idx" ON "audit_events" ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" ("entity_type","action");--> statement-breakpoint
CREATE INDEX "audit_events_trace_idx" ON "audit_events" ("trace_id");--> statement-breakpoint
CREATE INDEX "audit_events_archive_entity_idx" ON "audit_events_archive" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_archive_organization_idx" ON "audit_events_archive" ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_events_archive_time_idx" ON "audit_events_archive" ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_archive_organization_idx" ON "audit_logs_archive" ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_logs_archive_actor_idx" ON "audit_logs_archive" ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_archive_time_idx" ON "audit_logs_archive" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ownership_unique_idx" ON "entity_ownerships" ("entity_type","entity_id","scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "ownership_entity_idx" ON "entity_ownerships" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ownership_scope_idx" ON "entity_ownerships" ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "ownership_inherited_idx" ON "entity_ownerships" ("inherited_from_type","inherited_from_id");--> statement-breakpoint
CREATE INDEX "ownership_org_idx" ON "entity_ownerships" ("organization_id");--> statement-breakpoint
CREATE INDEX "ownership_expire_idx" ON "entity_ownerships" ("expire_at");--> statement-breakpoint
CREATE INDEX "audit_ownership_idx" ON "ownership_audit_log" ("ownership_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "ownership_audit_log" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "ownership_audit_log" ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_org_idx" ON "ownership_audit_log" ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_timestamp_idx" ON "ownership_audit_log" ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_capabilities_source_status" ON "capabilities" ("source","status");--> statement-breakpoint
CREATE INDEX "idx_capabilities_plugin_id" ON "capabilities" ("plugin_id");--> statement-breakpoint
CREATE INDEX "idx_plan_items_plan_id" ON "plan_items" ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_plan_items_subject" ON "plan_items" ("subject");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_tenant" ON "plan_subscriptions" ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_status" ON "plan_subscriptions" ("status");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_period_end" ON "plan_subscriptions" ("current_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subscriptions_external_id" ON "plan_subscriptions" ("external_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subscriptions_tenant_plan_active" ON "plan_subscriptions" ("organization_id","plan_id") WHERE status IN ('active', 'trialing');--> statement-breakpoint
CREATE INDEX "idx_tenant_quotas_tenant_feature" ON "tenant_quotas" ("organization_id","subject");--> statement-breakpoint
CREATE INDEX "idx_tenant_quotas_waterfall" ON "tenant_quotas" ("organization_id","subject","balance","priority","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_quotas_source" ON "tenant_quotas" ("organization_id","subject","source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_user_source" ON "transactions" ("user_id","source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transactions_external_id" ON "transactions" ("external_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_status" ON "transactions" ("status");--> statement-breakpoint
CREATE INDEX "idx_usage_records_user_feature" ON "usage_records" ("user_id","subject");--> statement-breakpoint
CREATE INDEX "idx_usage_records_occurred_at" ON "usage_records" ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_user_quotas_user_feature" ON "user_quotas" ("user_id","subject");--> statement-breakpoint
CREATE INDEX "idx_user_quotas_waterfall" ON "user_quotas" ("user_id","subject","balance","priority","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_quotas_source" ON "user_quotas" ("user_id","subject","source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_currencies_org_code" ON "currencies" ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_currencies_org_base" ON "currencies" ("organization_id") WHERE is_base = 1;--> statement-breakpoint
CREATE INDEX "idx_currencies_org" ON "currencies" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_exchange_rates_org_pair_time" ON "exchange_rates" ("organization_id","base_currency","target_currency","effective_at");--> statement-breakpoint
CREATE INDEX "idx_exchange_rates_org" ON "exchange_rates" ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_exchange_rates_current" ON "exchange_rates" ("organization_id","base_currency","target_currency") WHERE expires_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_endpoint" ON "webhook_deliveries" ("endpoint_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_tenant_status" ON "webhook_deliveries" ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_webhook_deliveries_dedupe" ON "webhook_deliveries" ("dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_created" ON "webhook_deliveries" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_endpoints_tenant" ON "webhook_endpoints" ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_endpoints_enabled" ON "webhook_endpoints" ("organization_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_webhook_endpoints_tenant_url" ON "webhook_endpoints" ("organization_id","url");--> statement-breakpoint
CREATE INDEX "idx_webhook_outbox_available" ON "webhook_outbox" ("available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_webhook_outbox_dedupe" ON "webhook_outbox" ("dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_webhook_outbox_tenant" ON "webhook_outbox" ("organization_id");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_organization_idx" ON "scheduled_tasks" ("organization_id");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_next_run_idx" ON "scheduled_tasks" ("next_run_at","enabled");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_provider_idx" ON "scheduled_tasks" ("provider_id");--> statement-breakpoint
CREATE INDEX "scheduler_providers_plugin_idx" ON "scheduler_providers" ("plugin_id");--> statement-breakpoint
CREATE INDEX "scheduler_providers_status_idx" ON "scheduler_providers" ("status");--> statement-breakpoint
CREATE INDEX "task_executions_task_idx" ON "task_executions" ("task_id","started_at");--> statement-breakpoint
CREATE INDEX "task_executions_organization_idx" ON "task_executions" ("organization_id");--> statement-breakpoint
CREATE INDEX "task_executions_status_idx" ON "task_executions" ("status");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "i18n_languages" ADD CONSTRAINT "i18n_languages_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "i18n_messages" ADD CONSTRAINT "i18n_messages_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plugin_configs" ADD CONSTRAINT "plugin_configs_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plugin_migrations" ADD CONSTRAINT "plugin_migrations_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_flag_id_feature_flags_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "feature_flags"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_parent_id_media_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "media"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_events_archive" ADD CONSTRAINT "audit_events_archive_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "audit_logs_archive" ADD CONSTRAINT "audit_logs_archive_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "entity_ownerships" ADD CONSTRAINT "entity_ownerships_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ownership_audit_log" ADD CONSTRAINT "ownership_audit_log_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_id_plans_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plan_subscriptions" ADD CONSTRAINT "plan_subscriptions_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plan_subscriptions" ADD CONSTRAINT "plan_subscriptions_plan_id_plans_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "plan_subscriptions" ADD CONSTRAINT "plan_subscriptions_initial_transaction_id_transactions_id_fkey" FOREIGN KEY ("initial_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "plan_subscriptions" ADD CONSTRAINT "plan_subscriptions_latest_transaction_id_transactions_id_fkey" FOREIGN KEY ("latest_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "plan_subscriptions" ADD CONSTRAINT "plan_subscriptions_scheduled_plan_id_plans_id_fkey" FOREIGN KEY ("scheduled_plan_id") REFERENCES "plans"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tenant_quotas" ADD CONSTRAINT "tenant_quotas_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_quotas" ADD CONSTRAINT "user_quotas_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_quotas" ADD CONSTRAINT "user_quotas_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_outbox" ADD CONSTRAINT "webhook_outbox_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_outbox" ADD CONSTRAINT "webhook_outbox_endpoint_id_webhook_endpoints_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_task_id_scheduled_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "scheduled_tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;