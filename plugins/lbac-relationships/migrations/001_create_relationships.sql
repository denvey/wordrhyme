-- Migration: LBAC Relationships Plugin
-- Creates relationship table for dynamic access control

CREATE TABLE IF NOT EXISTS "relationship" (
    "id" text PRIMARY KEY,
    "type" text NOT NULL,
    "source_id" text NOT NULL,
    "target_id" text NOT NULL,
    "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "metadata" jsonb,
    "created_at" timestamp NOT NULL DEFAULT now()
);

-- Unique constraint: one relationship per type-source-target
CREATE UNIQUE INDEX IF NOT EXISTS "relationship_unique_idx"
    ON "relationship"("type", "source_id", "target_id");

-- Query by source (who does this user follow/collaborate with?)
CREATE INDEX IF NOT EXISTS "relationship_source_idx"
    ON "relationship"("type", "source_id");

-- Query by target (who follows/collaborates with this user?)
CREATE INDEX IF NOT EXISTS "relationship_target_idx"
    ON "relationship"("type", "target_id");

-- Tenant isolation
CREATE INDEX IF NOT EXISTS "relationship_org_idx"
    ON "relationship"("organization_id");

-- Common relationship types:
-- 'follow': source follows target (social)
-- 'collaborate': source collaborates with target (docs)
-- 'subscribe': source subscribes to target (content)
-- 'share': source shared with target (files)
