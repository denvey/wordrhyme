-- Webhook System Tables
-- Manual migration for webhook_endpoints, webhook_deliveries, webhook_outbox

CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
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

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
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

CREATE TABLE IF NOT EXISTS "webhook_outbox" (
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

-- Foreign keys
ALTER TABLE "webhook_deliveries"
ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk"
FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "webhook_outbox"
ADD CONSTRAINT "webhook_outbox_endpoint_id_webhook_endpoints_id_fk"
FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id")
ON DELETE cascade ON UPDATE no action;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_deliveries_dedupe_uidx"
ON "webhook_deliveries" ("dedupe_key");

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_outbox_dedupe_uidx"
ON "webhook_outbox" ("dedupe_key");

CREATE INDEX IF NOT EXISTS "webhook_endpoints_tenant_idx"
ON "webhook_endpoints" ("tenant_id");

CREATE INDEX IF NOT EXISTS "webhook_deliveries_endpoint_idx"
ON "webhook_deliveries" ("endpoint_id");

CREATE INDEX IF NOT EXISTS "webhook_deliveries_status_idx"
ON "webhook_deliveries" ("status");

CREATE INDEX IF NOT EXISTS "webhook_outbox_available_idx"
ON "webhook_outbox" ("available_at");
