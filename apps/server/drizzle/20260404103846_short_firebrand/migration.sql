CREATE TABLE "geo_countries" (
	"id" text PRIMARY KEY,
	"code2" text NOT NULL,
	"code3" text,
	"numeric_code" text,
	"name" jsonb NOT NULL,
	"official_name" jsonb,
	"flags" jsonb,
	"currency_code" text,
	"language_code" text,
	"locale" text,
	"phone_code" text,
	"is_supported" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_subdivisions" (
	"id" text PRIMARY KEY,
	"country_code2" text NOT NULL,
	"code" text NOT NULL,
	"full_code" text NOT NULL,
	"name" jsonb NOT NULL,
	"type" text,
	"is_supported" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "geo_countries_code2_uidx" ON "geo_countries" ("code2");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_countries_code3_uidx" ON "geo_countries" ("code3");--> statement-breakpoint
CREATE INDEX "geo_countries_supported_sort_idx" ON "geo_countries" ("is_supported","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_subdivisions_full_code_uidx" ON "geo_subdivisions" ("full_code");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_subdivisions_country_code_uidx" ON "geo_subdivisions" ("country_code2","code");--> statement-breakpoint
CREATE INDEX "geo_subdivisions_country_sort_idx" ON "geo_subdivisions" ("country_code2","sort_order");--> statement-breakpoint
CREATE INDEX "geo_subdivisions_country_supported_idx" ON "geo_subdivisions" ("country_code2","is_supported");--> statement-breakpoint
ALTER TABLE "geo_subdivisions" ADD CONSTRAINT "geo_subdivisions_country_code2_geo_countries_code2_fkey" FOREIGN KEY ("country_code2") REFERENCES "geo_countries"("code2") ON DELETE CASCADE;
