-- Migration: LBAC Spaces Plugin
-- Creates space and space_member tables

CREATE TABLE IF NOT EXISTS "space" (
    "id" text PRIMARY KEY,
    "name" text NOT NULL,
    "slug" text NOT NULL,
    "description" text,
    "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "parent_id" text REFERENCES "space"("id") ON DELETE SET NULL,
    "path" text,
    "level" int4 NOT NULL DEFAULT 0,
    "visibility" text NOT NULL DEFAULT 'private',
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now(),
    "created_by" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "space_org_slug_uidx" ON "space"("organization_id", "slug");
CREATE INDEX IF NOT EXISTS "space_org_idx" ON "space"("organization_id");
CREATE INDEX IF NOT EXISTS "space_parent_idx" ON "space"("parent_id");
CREATE INDEX IF NOT EXISTS "space_path_gist_idx" ON "space" USING GIST("path"::ltree);

CREATE TABLE IF NOT EXISTS "space_member" (
    "id" text PRIMARY KEY,
    "space_id" text NOT NULL REFERENCES "space"("id") ON DELETE CASCADE,
    "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "role" text NOT NULL DEFAULT 'member',
    "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "space_member_uidx" ON "space_member"("space_id", "user_id");
CREATE INDEX IF NOT EXISTS "space_member_space_idx" ON "space_member"("space_id");
CREATE INDEX IF NOT EXISTS "space_member_user_idx" ON "space_member"("user_id");
