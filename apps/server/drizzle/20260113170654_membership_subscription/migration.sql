CREATE TABLE "plan_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
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
CREATE TABLE "tenant_quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"feature_key" text NOT NULL,
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
ALTER TABLE "plan_items" ADD COLUMN "reset_strategy" text DEFAULT 'hard';--> statement-breakpoint
ALTER TABLE "plan_items" ADD COLUMN "reset_cap" integer;--> statement-breakpoint
ALTER TABLE "plan_items" ADD COLUMN "quota_scope" text DEFAULT 'tenant' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_quotas" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "plan_subscriptions" ADD CONSTRAINT "plan_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_subscriptions" ADD CONSTRAINT "plan_subscriptions_initial_transaction_id_transactions_id_fk" FOREIGN KEY ("initial_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_subscriptions" ADD CONSTRAINT "plan_subscriptions_latest_transaction_id_transactions_id_fk" FOREIGN KEY ("latest_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_subscriptions" ADD CONSTRAINT "plan_subscriptions_scheduled_plan_id_plans_id_fk" FOREIGN KEY ("scheduled_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_subscriptions_tenant" ON "plan_subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_status" ON "plan_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_period_end" ON "plan_subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subscriptions_external_id" ON "plan_subscriptions" USING btree ("external_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subscriptions_tenant_plan_active" ON "plan_subscriptions" USING btree ("tenant_id","plan_id") WHERE status IN ('active', 'trialing');--> statement-breakpoint
CREATE INDEX "idx_tenant_quotas_tenant_feature" ON "tenant_quotas" USING btree ("tenant_id","feature_key");--> statement-breakpoint
CREATE INDEX "idx_tenant_quotas_waterfall" ON "tenant_quotas" USING btree ("tenant_id","feature_key","balance","priority","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_quotas_source" ON "tenant_quotas" USING btree ("tenant_id","feature_key","source_type","source_id");