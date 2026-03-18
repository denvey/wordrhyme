/**
 * Migration: Split tenant plugin status into installation + activation
 *
 * Keeps legacy `status` column for compatibility while introducing the
 * Shopify-style tenant installation relationship.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '../client';

export async function up(db: Database): Promise<void> {
  await db.execute(sql`
    ALTER TABLE plugins
    ADD COLUMN IF NOT EXISTS installation_status text
  `);

  await db.execute(sql`
    ALTER TABLE plugins
    ADD COLUMN IF NOT EXISTS activation_status text
  `);

  await db.execute(sql`
    UPDATE plugins
    SET
      installation_status = CASE
        WHEN status = 'uninstalled' THEN 'uninstalled'
        ELSE 'installed'
      END,
      activation_status = CASE
        WHEN status = 'enabled' THEN 'enabled'
        ELSE 'disabled'
      END
    WHERE installation_status IS NULL
       OR activation_status IS NULL
  `);

  await db.execute(sql`
    ALTER TABLE plugins
    ALTER COLUMN installation_status SET DEFAULT 'installed'
  `);

  await db.execute(sql`
    ALTER TABLE plugins
    ALTER COLUMN activation_status SET DEFAULT 'enabled'
  `);

  await db.execute(sql`
    ALTER TABLE plugins
    ALTER COLUMN installation_status SET NOT NULL
  `);

  await db.execute(sql`
    ALTER TABLE plugins
    ALTER COLUMN activation_status SET NOT NULL
  `);
}

export async function down(db: Database): Promise<void> {
  await db.execute(sql`
    ALTER TABLE plugins
    DROP COLUMN IF EXISTS activation_status
  `);

  await db.execute(sql`
    ALTER TABLE plugins
    DROP COLUMN IF EXISTS installation_status
  `);
}
