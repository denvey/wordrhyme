import { sql } from 'drizzle-orm';
import type { Database } from '../client';

export async function up(db: Database): Promise<void> {
  await db.execute(sql`
    ALTER TABLE plan_items
      ADD COLUMN IF NOT EXISTS procedure_path text,
      ADD COLUMN IF NOT EXISTS group_key text
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_plan_items_procedure_path
      ON plan_items (procedure_path)
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_items_plan_procedure_path
      ON plan_items (plan_id, procedure_path)
      WHERE procedure_path IS NOT NULL
  `);

  console.log('[Migration] Added procedure_path/group_key to plan_items');
}

export async function down(db: Database): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS uq_plan_items_plan_procedure_path`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_plan_items_procedure_path`);
  await db.execute(sql`
    ALTER TABLE plan_items
      DROP COLUMN IF EXISTS procedure_path,
      DROP COLUMN IF EXISTS group_key
  `);

  console.log('[Migration] Removed procedure_path/group_key from plan_items');
}
