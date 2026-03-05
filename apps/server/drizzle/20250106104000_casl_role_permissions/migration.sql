-- Migration: Refactor role_permissions to CASL format
-- This is a BREAKING change that converts capability strings to CASL rule format

-- Step 1: Add new CASL columns
ALTER TABLE "role_permissions" ADD COLUMN "action" text;
ALTER TABLE "role_permissions" ADD COLUMN "subject" text;
ALTER TABLE "role_permissions" ADD COLUMN "fields" jsonb;
ALTER TABLE "role_permissions" ADD COLUMN "conditions" jsonb;
ALTER TABLE "role_permissions" ADD COLUMN "inverted" boolean DEFAULT false NOT NULL;
ALTER TABLE "role_permissions" ADD COLUMN "source" text;

-- Step 2: Migrate existing capability strings to CASL format
-- Format: resource:action:scope -> action=action, subject=Resource (capitalized)
-- Special case: *:*:* -> action=manage, subject=all
UPDATE "role_permissions"
SET
    action = CASE
        WHEN capability = '*:*:*' THEN 'manage'
        WHEN capability LIKE '%:manage:%' OR capability LIKE '%:manage' THEN 'manage'
        WHEN capability LIKE '%:read:%' OR capability LIKE '%:read' THEN 'read'
        WHEN capability LIKE '%:create:%' OR capability LIKE '%:create' THEN 'create'
        WHEN capability LIKE '%:update:%' OR capability LIKE '%:update' THEN 'update'
        WHEN capability LIKE '%:delete:%' OR capability LIKE '%:delete' THEN 'delete'
        ELSE 'manage'
    END,
    subject = CASE
        WHEN capability = '*:*:*' THEN 'all'
        WHEN capability LIKE 'content:%' THEN 'Content'
        WHEN capability LIKE 'user:%' THEN 'User'
        WHEN capability LIKE 'organization:%' THEN 'Organization'
        WHEN capability LIKE 'menu:%' THEN 'Menu'
        WHEN capability LIKE 'plugin:%' THEN capability  -- Keep plugin subjects as-is
        WHEN capability LIKE 'core:%' THEN INITCAP(SPLIT_PART(capability, ':', 2))
        ELSE INITCAP(SPLIT_PART(capability, ':', 1))
    END,
    fields = NULL,
    conditions = NULL,
    inverted = false,
    source = NULL
WHERE action IS NULL;

-- Step 3: Make new columns NOT NULL after migration
ALTER TABLE "role_permissions" ALTER COLUMN "action" SET NOT NULL;
ALTER TABLE "role_permissions" ALTER COLUMN "subject" SET NOT NULL;

-- Step 4: Drop old capability column and its index
DROP INDEX IF EXISTS "role_permissions_role_cap_uidx";
ALTER TABLE "role_permissions" DROP COLUMN "capability";

-- Step 5: Create new indexes
CREATE UNIQUE INDEX "role_permissions_role_action_subject_uidx" ON "role_permissions" ("role_id", "action", "subject");
CREATE INDEX "role_permissions_source_idx" ON "role_permissions" ("source");
