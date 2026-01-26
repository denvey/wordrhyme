-- Migration: Add Team Hierarchy + LBAC Support
-- Description: Adds team hierarchy (ltree) and prepares for LBAC

-- 1. Enable ltree extension for hierarchical queries
CREATE EXTENSION IF NOT EXISTS ltree;

-- 2. Add hierarchy fields to team table
ALTER TABLE "team"
ADD COLUMN IF NOT EXISTS "parent_id" text REFERENCES "team"("id") ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS "path" text,
ADD COLUMN IF NOT EXISTS "level" int4 NOT NULL DEFAULT 0;

-- Initialize existing teams as root level (path = id)
UPDATE "team" SET "path" = "id", "level" = 0 WHERE "path" IS NULL;

-- Make path NOT NULL after initialization
ALTER TABLE "team" ALTER COLUMN "path" SET NOT NULL;

-- Create indexes for team hierarchy
CREATE INDEX IF NOT EXISTS team_parent_idx ON "team"("parent_id");
CREATE INDEX IF NOT EXISTS team_path_gist_idx ON "team" USING GIST("path"::ltree);
CREATE INDEX IF NOT EXISTS team_org_path_idx ON "team"("organization_id", "path");

-- 3. Note: LBAC fields (aclTags, denyTags) should be added to business tables as needed
-- Example for a hypothetical articles table:
--
-- ALTER TABLE "articles"
-- ADD COLUMN IF NOT EXISTS "space_id" text,
-- ADD COLUMN IF NOT EXISTS "team_id" text,
-- ADD COLUMN IF NOT EXISTS "owner_id" text,
-- ADD COLUMN IF NOT EXISTS "creator_id" text,
-- ADD COLUMN IF NOT EXISTS "acl_tags" text[] NOT NULL DEFAULT '{}',
-- ADD COLUMN IF NOT EXISTS "deny_tags" text[] NOT NULL DEFAULT '{}';
--
-- CREATE INDEX IF NOT EXISTS idx_articles_acl_tags ON "articles" USING GIN(acl_tags);
-- CREATE INDEX IF NOT EXISTS idx_articles_deny_tags ON "articles" USING GIN(deny_tags);
