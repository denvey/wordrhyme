CREATE TABLE IF NOT EXISTS "plugin_com_wordrhyme_shop_attribute_values" (
	"id" text PRIMARY KEY,
	"attribute_id" text NOT NULL,
	"value" jsonb NOT NULL,
	"slug" text NOT NULL,
	"color_hex" text,
	"image" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_com_wordrhyme_shop_attributes" (
	"id" text PRIMARY KEY,
	"name" jsonb NOT NULL,
	"slug" text NOT NULL,
	"type" text DEFAULT 'select' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_com_wordrhyme_shop_categories" (
	"id" text PRIMARY KEY,
	"name" jsonb NOT NULL,
	"slug" text NOT NULL,
	"description" jsonb,
	"main_image" text,
	"parent_id" text,
	"nested_level" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"seo_title" jsonb,
	"seo_description" jsonb,
	"organization_id" text NOT NULL,
	"acl_tags" text[] DEFAULT '{}'::text[],
	"deny_tags" text[] DEFAULT '{}'::text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_com_wordrhyme_shop_external_mappings" (
	"id" text PRIMARY KEY,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"platform" text NOT NULL,
	"direction" text NOT NULL,
	"external_id" text NOT NULL,
	"external_sku" text,
	"external_url" text,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"sync_error" text,
	"metadata" jsonb DEFAULT '{}',
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_com_wordrhyme_shop_order_items" (
	"id" text PRIMARY KEY,
	"order_id" text NOT NULL,
	"spu_id" text,
	"sku_id" text,
	"sku_code" text,
	"name" jsonb NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"total_price_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_com_wordrhyme_shop_orders" (
	"id" text PRIMARY KEY,
	"order_id" text,
	"order_number" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"subtotal_price_cents" integer,
	"total_price_cents" integer,
	"total_tax_cents" integer,
	"total_discount_cents" integer,
	"shipping_price_cents" integer,
	"payment_method" text,
	"note" text,
	"email" text,
	"phone" text,
	"shipping" jsonb,
	"line_items" jsonb DEFAULT '[]',
	"version" integer DEFAULT 1 NOT NULL,
	"source" text,
	"source_status" text,
	"tracking_number" text,
	"carrier" text,
	"tracking_url" text,
	"fulfilled_at" timestamp with time zone,
	"organization_id" text NOT NULL,
	"acl_tags" text[] DEFAULT '{}'::text[],
	"deny_tags" text[] DEFAULT '{}'::text[],
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"refunded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_com_wordrhyme_shop_product_attributes" (
	"id" text PRIMARY KEY,
	"spu_id" text NOT NULL,
	"attribute_id" text NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"is_variation" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"organization_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_com_wordrhyme_shop_product_categories" (
	"spu_id" text,
	"category_id" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"organization_id" text NOT NULL,
	CONSTRAINT "plugin_com_wordrhyme_shop_product_categories_pkey" PRIMARY KEY("spu_id","category_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_com_wordrhyme_shop_product_images" (
	"id" text PRIMARY KEY,
	"spu_id" text NOT NULL,
	"sku_id" text,
	"src" text NOT NULL,
	"alt" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}',
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_com_wordrhyme_shop_product_variations" (
	"sku_id" text PRIMARY KEY,
	"spu_id" text NOT NULL,
	"name" jsonb,
	"price_cents" integer,
	"regular_price_cents" integer,
	"sale_price_cents" integer,
	"stock_quantity" integer DEFAULT 0 NOT NULL,
	"stock_status" text DEFAULT 'instock' NOT NULL,
	"image" jsonb,
	"sku_code" text,
	"sku_type" text DEFAULT 'single' NOT NULL,
	"weight" integer,
	"length" integer,
	"width" integer,
	"height" integer,
	"attribute_type" text DEFAULT 'general' NOT NULL,
	"purchase_cost" integer,
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_com_wordrhyme_shop_products" (
	"spu_id" text PRIMARY KEY,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"short_description" jsonb,
	"seo_title" jsonb,
	"seo_description" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"price_cents" integer,
	"regular_price_cents" integer,
	"sale_price_cents" integer,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"manage_stock" boolean DEFAULT false NOT NULL,
	"stock_quantity" integer DEFAULT 0 NOT NULL,
	"stock_status" text DEFAULT 'instock' NOT NULL,
	"source" text,
	"url" text,
	"tags" jsonb DEFAULT '[]',
	"price_range" jsonb DEFAULT '[]',
	"main_image" text,
	"spu_code" text,
	"sourcing_platform" text,
	"sourcing_memo" text,
	"organization_id" text NOT NULL,
	"acl_tags" text[] DEFAULT '{}'::text[],
	"deny_tags" text[] DEFAULT '{}'::text[],
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plugin_com_wordrhyme_shop_variant_attribute_values" (
	"sku_id" text,
	"attribute_value_id" text,
	"organization_id" text NOT NULL,
	CONSTRAINT "plugin_com_wordrhyme_shop_variant_attribute_values_pkey" PRIMARY KEY("sku_id","attribute_value_id")
);
