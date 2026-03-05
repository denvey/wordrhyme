/**
 * Migration: Initialize billing default undeclared policy setting
 *
 * Seeds the platform-level default policy for undeclared plugin billing:
 * - `billing.defaultUndeclaredPolicy = 'audit'`
 *
 * This setting controls what happens when a plugin procedure has no billing declaration:
 * - 'allow': pass through without billing check
 * - 'deny': reject the request
 * - 'audit': log and pass through (default, safe for existing plugins)
 *
 * @migration billing_default_policy_seed
 */

import { sql } from 'drizzle-orm';
import type { Database } from '../client';

export async function up(db: Database): Promise<void> {
  await db.execute(sql`
    INSERT INTO settings (id, scope, key, value, description, created_at, updated_at)
    VALUES (
      gen_random_uuid()::text,
      'global',
      'billing.defaultUndeclaredPolicy',
      '"audit"'::jsonb,
      'Default billing policy for plugin procedures without explicit billing declaration. Values: allow | deny | audit',
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING
  `);

  console.log('[Migration] Initialized billing.defaultUndeclaredPolicy = "audit"');
}

export async function down(db: Database): Promise<void> {
  await db.execute(sql`
    DELETE FROM settings
    WHERE scope = 'global'
      AND key = 'billing.defaultUndeclaredPolicy'
  `);

  console.log('[Migration] Removed billing.defaultUndeclaredPolicy setting');
}
