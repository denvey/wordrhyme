-- File/Asset System Migration
-- Creates files and assets tables
-- Note: Multipart upload state is stored in Redis (not in database)

-- Files Table: Raw file storage metadata
CREATE TABLE IF NOT EXISTS "files" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,

  -- File information
  "filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "size" bigint NOT NULL,

  -- Storage information
  "storage_provider" text NOT NULL,
  "storage_key" text NOT NULL,
  "storage_bucket" text,

  -- Public access
  "public_url" text,
  "is_public" boolean NOT NULL DEFAULT false,

  -- Metadata
  "metadata" jsonb DEFAULT '{}',
  "checksum" text,

  -- Audit
  "uploaded_by" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp,

  -- Unique constraint
  CONSTRAINT "files_storage_unique" UNIQUE ("tenant_id", "storage_provider", "storage_key")
);
--> statement-breakpoint

-- Files indexes
CREATE INDEX IF NOT EXISTS "idx_files_tenant" ON "files" USING btree ("tenant_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_files_mime" ON "files" USING btree ("tenant_id", "mime_type") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_files_created" ON "files" USING btree ("tenant_id", "created_at" DESC) WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_files_deleted" ON "files" USING btree ("deleted_at") WHERE "deleted_at" IS NOT NULL;
--> statement-breakpoint

-- Assets Table: File with CMS semantics (images, videos, documents)
-- Variants are stored inline as JSONB for simplicity
CREATE TABLE IF NOT EXISTS "assets" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "file_id" text NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,

  -- Asset type
  "type" text NOT NULL,

  -- Image-specific info (only when type='image')
  "width" integer,
  "height" integer,
  "format" text,

  -- Organization
  "alt" text,
  "title" text,
  "tags" text[] DEFAULT '{}',
  "folder_path" text,

  -- Variants (inline JSONB instead of separate table)
  -- Structure: [{ name, fileId, width, height, format, createdAt }]
  "variants" jsonb DEFAULT '[]',

  -- Audit
  "created_by" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);
--> statement-breakpoint

-- Assets indexes
CREATE INDEX IF NOT EXISTS "idx_assets_tenant" ON "assets" USING btree ("tenant_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assets_type" ON "assets" USING btree ("tenant_id", "type") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assets_folder" ON "assets" USING btree ("tenant_id", "folder_path") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assets_tags" ON "assets" USING GIN ("tags") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assets_deleted" ON "assets" USING btree ("deleted_at") WHERE "deleted_at" IS NOT NULL;
--> statement-breakpoint
