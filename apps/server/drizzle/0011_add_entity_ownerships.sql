-- Migration: Add Entity Ownerships (LBAC Write Model)
-- Description: Creates the Source of Truth for permission grants
-- @see Frozen Spec: Hybrid CQRS + LBAC

-- 1. Entity Ownerships Table (Write Model - SoT)
CREATE TABLE IF NOT EXISTS "entity_ownerships" (
    "id" text PRIMARY KEY,
    "entity_type" text NOT NULL,
    "entity_id" text NOT NULL,
    "scope_type" text NOT NULL,
    "scope_id" text NOT NULL,
    "level" text NOT NULL DEFAULT 'read',
    "inherited_from_type" text,
    "inherited_from_id" text,
    "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "expire_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now(),
    "created_by" text
);

-- Unique constraint: one grant per entity-scope combination
CREATE UNIQUE INDEX IF NOT EXISTS "ownership_unique_idx"
    ON "entity_ownerships"("entity_type", "entity_id", "scope_type", "scope_id");

-- Query by entity
CREATE INDEX IF NOT EXISTS "ownership_entity_idx"
    ON "entity_ownerships"("entity_type", "entity_id");

-- Query by scope
CREATE INDEX IF NOT EXISTS "ownership_scope_idx"
    ON "entity_ownerships"("scope_type", "scope_id");

-- Query inherited ownerships (for rebuild)
CREATE INDEX IF NOT EXISTS "ownership_inherited_idx"
    ON "entity_ownerships"("inherited_from_type", "inherited_from_id");

-- Tenant isolation
CREATE INDEX IF NOT EXISTS "ownership_org_idx"
    ON "entity_ownerships"("organization_id");

-- Expiration cleanup
CREATE INDEX IF NOT EXISTS "ownership_expire_idx"
    ON "entity_ownerships"("expire_at");

-- 2. Ownership Audit Log (Compliance)
CREATE TABLE IF NOT EXISTS "ownership_audit_log" (
    "id" text PRIMARY KEY,
    "ownership_id" text NOT NULL,
    "entity_type" text NOT NULL,
    "entity_id" text NOT NULL,
    "scope_type" text NOT NULL,
    "scope_id" text NOT NULL,
    "action" text NOT NULL,
    "before_state" jsonb,
    "after_state" jsonb,
    "actor_id" text NOT NULL,
    "actor_type" text NOT NULL,
    "reason" text,
    "organization_id" text NOT NULL,
    "timestamp" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_ownership_idx" ON "ownership_audit_log"("ownership_id");
CREATE INDEX IF NOT EXISTS "audit_entity_idx" ON "ownership_audit_log"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "audit_actor_idx" ON "ownership_audit_log"("actor_id");
CREATE INDEX IF NOT EXISTS "audit_org_idx" ON "ownership_audit_log"("organization_id");
CREATE INDEX IF NOT EXISTS "audit_timestamp_idx" ON "ownership_audit_log"("timestamp");
