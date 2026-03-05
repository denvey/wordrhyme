CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"tenant_id" text,
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
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"tenant_id" text,
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
	"created_at" timestamp NOT NULL,
	"archived_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
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
	"idempotency_key" text,
	"source_plugin_id" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"source" text DEFAULT 'system' NOT NULL,
	"category" text DEFAULT 'system' NOT NULL,
	"latest_actors" jsonb DEFAULT '[]'::jsonb,
	"pinned" boolean DEFAULT false NOT NULL,
	"visual_priority" text DEFAULT 'medium' NOT NULL,
	"actor" jsonb,
	"target" jsonb,
	"aggregation_strategy" text DEFAULT 'none' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "notifications_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"title" jsonb NOT NULL,
	"message" jsonb NOT NULL,
	"variables" jsonb,
	"default_channels" jsonb DEFAULT '["in-app"]'::jsonb NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"plugin_id" text,
	"deprecated" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"enabled_channels" jsonb DEFAULT '["in-app"]'::jsonb NOT NULL,
	"template_overrides" jsonb,
	"quiet_hours" jsonb,
	"email_frequency" text DEFAULT 'instant' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"icon" text,
	"plugin_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config_schema" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_channels_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "setting_schemas" (
	"id" text PRIMARY KEY NOT NULL,
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
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text,
	"tenant_id" text,
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
	"id" text PRIMARY KEY NOT NULL,
	"flag_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"enabled" boolean NOT NULL,
	"rollout_percentage" integer,
	"conditions" jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_percentage" integer DEFAULT 100 NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"storage_bucket" text,
	"public_url" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"checksum" text,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"file_id" text NOT NULL,
	"type" text NOT NULL,
	"width" integer,
	"height" integer,
	"format" text,
	"alt" text,
	"title" text,
	"tags" text[] DEFAULT '{}',
	"folder_path" text,
	"variants" jsonb DEFAULT '[]'::jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
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
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"retry_policy" jsonb DEFAULT '{"attempts":5,"backoffMs":1000}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
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
ALTER TABLE "role_permissions" RENAME COLUMN "capability" TO "action";--> statement-breakpoint
DROP INDEX "role_permissions_role_cap_uidx";--> statement-breakpoint
ALTER TABLE "role_permissions" ADD COLUMN "subject" text NOT NULL;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD COLUMN "fields" jsonb;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD COLUMN "conditions" jsonb;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD COLUMN "inverted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_ip" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "trace_id" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_team_id" text;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_flag_id_feature_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."feature_flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_outbox" ADD CONSTRAINT "webhook_outbox_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_idx" ON "audit_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_time_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("entity_type","action");--> statement-breakpoint
CREATE INDEX "audit_events_trace_idx" ON "audit_events" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "audit_events_archive_entity_idx" ON "audit_events_archive" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_archive_tenant_idx" ON "audit_events_archive" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_events_archive_time_idx" ON "audit_events_archive" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_archive_tenant_idx" ON "audit_logs_archive" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_logs_archive_actor_idx" ON "audit_logs_archive" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_archive_time_idx" ON "audit_logs_archive" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "team_organizationId_idx" ON "team" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "teamMember_teamId_idx" ON "team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teamMember_userId_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teamMember_team_user_uidx" ON "team_member" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_read" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "idx_notifications_template" ON "notifications" USING btree ("template_key");--> statement-breakpoint
CREATE INDEX "idx_notifications_group" ON "notifications" USING btree ("group_key");--> statement-breakpoint
CREATE INDEX "idx_notifications_expires" ON "notifications" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_tenant_user" ON "notifications" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_category" ON "notifications" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_notifications_source" ON "notifications" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_notifications_pinned" ON "notifications" USING btree ("pinned");--> statement-breakpoint
CREATE INDEX "idx_notifications_cleanup" ON "notifications" USING btree ("category","read","created_at");--> statement-breakpoint
CREATE INDEX "idx_templates_plugin" ON "notification_templates" USING btree ("plugin_id");--> statement-breakpoint
CREATE INDEX "idx_templates_category" ON "notification_templates" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_preferences_user_tenant" ON "notification_preferences" USING btree ("user_id","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_channels_plugin" ON "notification_channels" USING btree ("plugin_id");--> statement-breakpoint
CREATE INDEX "idx_channels_enabled" ON "notification_channels" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_setting_schemas_pattern_version" ON "setting_schemas" USING btree ("key_pattern","version");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_settings_unique" ON "settings" USING btree ("scope",COALESCE("scope_id", ''),COALESCE("tenant_id", ''),"key");--> statement-breakpoint
CREATE INDEX "idx_settings_scope_key" ON "settings" USING btree ("scope","key");--> statement-breakpoint
CREATE INDEX "idx_settings_tenant" ON "settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_settings_plugin" ON "settings" USING btree ("scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ff_overrides_flag_tenant" ON "feature_flag_overrides" USING btree ("flag_id","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_ff_overrides_tenant" ON "feature_flag_overrides" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_feature_flags_key" ON "feature_flags" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "files_storage_unique" ON "files" USING btree ("tenant_id","storage_provider","storage_key");--> statement-breakpoint
CREATE INDEX "idx_files_tenant" ON "files" USING btree ("tenant_id") WHERE "files"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_files_mime" ON "files" USING btree ("tenant_id","mime_type") WHERE "files"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_files_created" ON "files" USING btree ("tenant_id","created_at") WHERE "files"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_files_deleted" ON "files" USING btree ("deleted_at") WHERE "files"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_assets_tenant" ON "assets" USING btree ("tenant_id") WHERE "assets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_assets_type" ON "assets" USING btree ("tenant_id","type") WHERE "assets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_assets_folder" ON "assets" USING btree ("tenant_id","folder_path") WHERE "assets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_assets_tags" ON "assets" USING gin ("tags") WHERE "assets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_assets_deleted" ON "assets" USING btree ("deleted_at") WHERE "assets"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_endpoint" ON "webhook_deliveries" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_tenant_status" ON "webhook_deliveries" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_webhook_deliveries_dedupe" ON "webhook_deliveries" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_created" ON "webhook_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_endpoints_tenant" ON "webhook_endpoints" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_endpoints_enabled" ON "webhook_endpoints" USING btree ("tenant_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_webhook_endpoints_tenant_url" ON "webhook_endpoints" USING btree ("tenant_id","url");--> statement-breakpoint
CREATE INDEX "idx_webhook_outbox_available" ON "webhook_outbox" USING btree ("available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_webhook_outbox_dedupe" ON "webhook_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_webhook_outbox_tenant" ON "webhook_outbox" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_role_action_subject_uidx" ON "role_permissions" USING btree ("role_id","action","subject");--> statement-breakpoint
CREATE INDEX "role_permissions_source_idx" ON "role_permissions" USING btree ("source");--> statement-breakpoint
CREATE INDEX "audit_logs_trace_idx" ON "audit_logs" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "invitation_teamId_idx" ON "invitation" USING btree ("team_id");