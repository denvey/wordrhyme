CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" text NOT NULL,
	"feature_key" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer,
	"reset_mode" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"overage_price_cents" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
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
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"gateway" text,
	"external_id" text,
	"metadata" jsonb,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"feature_key" text NOT NULL,
	"amount" integer NOT NULL,
	"quota_ids" jsonb,
	"overage_charged_cents" integer,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"feature_key" text NOT NULL,
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
	"user_id" text PRIMARY KEY NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_plan_items_plan_id" ON "plan_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_user_source" ON "transactions" USING btree ("user_id","source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transactions_external_id" ON "transactions" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_status" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_usage_records_user_feature" ON "usage_records" USING btree ("user_id","feature_key");--> statement-breakpoint
CREATE INDEX "idx_usage_records_occurred_at" ON "usage_records" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_user_quotas_user_feature" ON "user_quotas" USING btree ("user_id","feature_key");--> statement-breakpoint
CREATE INDEX "idx_user_quotas_waterfall" ON "user_quotas" USING btree ("user_id","feature_key","balance","priority","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_quotas_source" ON "user_quotas" USING btree ("user_id","feature_key","source_type","source_id");