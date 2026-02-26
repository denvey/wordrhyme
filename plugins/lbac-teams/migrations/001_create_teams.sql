-- Migration: LBAC Teams Plugin
-- Creates team and team_member tables with hierarchy support

-- 1. Enable ltree extension for hierarchical queries
CREATE EXTENSION IF NOT EXISTS ltree;

-- 2. Team table
CREATE TABLE IF NOT EXISTS "team" (
    "id" text PRIMARY KEY,
    "name" text NOT NULL,
    "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    -- Hierarchy fields
    "parent_id" text REFERENCES "team"("id") ON DELETE RESTRICT,
    "path" text,
    "level" int4 NOT NULL DEFAULT 0,
    -- Timestamps
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Initialize path for existing teams (if upgrading)
UPDATE "team" SET "path" = "id", "level" = 0 WHERE "path" IS NULL;

-- Team indexes
CREATE INDEX IF NOT EXISTS "team_org_idx" ON "team"("organization_id");
CREATE INDEX IF NOT EXISTS "team_parent_idx" ON "team"("parent_id");
CREATE INDEX IF NOT EXISTS "team_path_gist_idx" ON "team" USING GIST(("path"::ltree));
CREATE INDEX IF NOT EXISTS "team_org_path_idx" ON "team"("organization_id", "path");

-- 3. Team Member table
CREATE TABLE IF NOT EXISTS "team_member" (
    "id" text PRIMARY KEY,
    "team_id" text NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
    "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "role" text NOT NULL DEFAULT 'member',
    "created_at" timestamp NOT NULL DEFAULT now()
);

-- Team Member indexes
CREATE UNIQUE INDEX IF NOT EXISTS "team_member_uidx" ON "team_member"("team_id", "user_id");
CREATE INDEX IF NOT EXISTS "team_member_team_idx" ON "team_member"("team_id");
CREATE INDEX IF NOT EXISTS "team_member_user_idx" ON "team_member"("user_id");

-- 4. Add active_team_id to member table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'member' AND column_name = 'active_team_id'
    ) THEN
        ALTER TABLE "member" ADD COLUMN "active_team_id" text REFERENCES "team"("id") ON DELETE SET NULL;
    END IF;
END $$;
