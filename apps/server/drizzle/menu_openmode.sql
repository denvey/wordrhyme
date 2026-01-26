-- Add openMode column to menus table
-- This allows menus to be opened as routes, external links, or iframes

ALTER TABLE "menus"
ADD COLUMN IF NOT EXISTS "openMode" text NOT NULL DEFAULT 'route';

-- Create index for openMode
CREATE INDEX IF NOT EXISTS "menus_open_mode_idx" ON "menus"("openMode");

-- Update comment
COMMENT ON COLUMN "menus"."openMode" IS 'How the menu opens: route (default), external (new tab), or iframe (embedded). When external or iframe, path contains the full URL.';

