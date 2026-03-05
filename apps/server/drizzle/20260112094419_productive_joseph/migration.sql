CREATE TABLE "scheduled_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
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
	"id" text PRIMARY KEY NOT NULL,
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
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"tenant_id" text NOT NULL,
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
CREATE INDEX "scheduled_tasks_tenant_idx" ON "scheduled_tasks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_next_run_idx" ON "scheduled_tasks" USING btree ("next_run_at","enabled");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_provider_idx" ON "scheduled_tasks" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "scheduler_providers_plugin_idx" ON "scheduler_providers" USING btree ("plugin_id");--> statement-breakpoint
CREATE INDEX "scheduler_providers_status_idx" ON "scheduler_providers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "task_executions_task_idx" ON "task_executions" USING btree ("task_id","started_at");--> statement-breakpoint
CREATE INDEX "task_executions_tenant_idx" ON "task_executions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "task_executions_status_idx" ON "task_executions" USING btree ("status");