/**
 * Migration: Add plugin instance state table
 *
 * Separates deployment-instance plugin availability from tenant-scoped
 * enable/disable state in the `plugins` table.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '../client';

export async function up(db: Database): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS plugin_instances (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      plugin_id text NOT NULL,
      version text NOT NULL,
      status text NOT NULL,
      manifest jsonb NOT NULL,
      installed_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    ALTER TABLE plugin_instances
    ALTER COLUMN id SET DEFAULT gen_random_uuid()::text
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_plugin_per_instance
    ON plugin_instances (plugin_id)
  `);
}

export async function down(db: Database): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS plugin_instances`);
}
