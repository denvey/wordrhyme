DO $$
BEGIN
	IF to_regclass('public.apikey') IS NULL AND to_regclass('public."apiKey"') IS NOT NULL THEN
		EXECUTE 'ALTER TABLE "apiKey" RENAME TO apikey';
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "apikey" (
	"id" text PRIMARY KEY NOT NULL,
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
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'apikey_user_id_user_id_fk'
	) THEN
		ALTER TABLE "apikey"
		ADD CONSTRAINT "apikey_user_id_user_id_fk"
		FOREIGN KEY ("user_id")
		REFERENCES "public"."user"("id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apikey_userId_idx" ON "apikey" USING btree ("user_id");
