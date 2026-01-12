-- Migration: Unified Notification Contract
-- Adds support for SaaS + Social notification scenarios

-- Add new columns for unified notification contract
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'system';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'system';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS latest_actors JSONB DEFAULT '[]';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS visual_priority TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor JSONB;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target JSONB;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS aggregation_strategy TEXT NOT NULL DEFAULT 'none';

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_source ON notifications(source);
CREATE INDEX IF NOT EXISTS idx_notifications_pinned ON notifications(pinned) WHERE pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_notifications_cleanup ON notifications(category, read, created_at);

-- Update existing notifications with default values for migration
-- Set source='system' for existing notifications (already done by default)
-- Set category='system' for existing notifications (already done by default)
-- Set visual_priority based on type
UPDATE notifications
SET visual_priority = CASE
  WHEN type = 'error' THEN 'high'
  WHEN type = 'warning' THEN 'high'
  WHEN type = 'success' THEN 'medium'
  WHEN type = 'info' THEN 'medium'
  ELSE 'medium'
END
WHERE visual_priority = 'medium' OR visual_priority IS NULL;
