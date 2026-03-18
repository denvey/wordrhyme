/**
 * 迁移: S3 Plugin instances → infra.config
 *
 * 将旧 `instances` settings key 迁移到新的三键模型:
 * - instances (plugin_global) → infra.config (plugin_global)
 * - 新增 infra.policy (plugin_global) = { mode: 'unified' }
 *
 * 幂等: 如果 infra.config 已存在则跳过。
 *
 * @migration s3_infra_config
 */

import { sql } from 'drizzle-orm';
import type { Database } from '../client';

const S3_PLUGIN_ID = 'com.wordrhyme.storage-s3';
const OLD_KEY = 'instances';
const NEW_CONFIG_KEY = 'infra.config';
const NEW_POLICY_KEY = 'infra.policy';

export async function up(db: Database): Promise<void> {
  // Check if new key already exists (idempotent)
  const existing = await db.execute(sql`
    SELECT 1 FROM settings
    WHERE scope = 'plugin_global'
      AND scope_id = ${S3_PLUGIN_ID}
      AND key = ${NEW_CONFIG_KEY}
    LIMIT 1
  `);
  const existingRows = existing as Array<Record<string, unknown>>;

  if (existingRows.length > 0) {
    console.log('[Migration] infra.config already exists for S3, skipping');
    return;
  }

  // Read old instances data
  const oldData = await db.execute(sql`
    SELECT value, encrypted FROM settings
    WHERE scope = 'plugin_global'
      AND scope_id = ${S3_PLUGIN_ID}
      AND key = ${OLD_KEY}
    LIMIT 1
  `);
  const oldDataRows = oldData as unknown as Array<{ value: unknown; encrypted: boolean }>;

  if (oldDataRows.length === 0) {
    console.log('[Migration] No legacy instances data found for S3, skipping');
    return;
  }

  const row = oldDataRows[0];
  if (!row) {
    console.log('[Migration] No readable legacy instances row found for S3, skipping');
    return;
  }

  // Copy instances → infra.config (preserve encryption flag)
  await db.execute(sql`
    INSERT INTO settings (scope, scope_id, key, value, encrypted, description, created_at, updated_at)
    VALUES (
      'plugin_global',
      ${S3_PLUGIN_ID},
      ${NEW_CONFIG_KEY},
      ${JSON.stringify(row.value)}::jsonb,
      ${row.encrypted},
      'S3 platform default configuration (migrated from instances)',
      NOW(),
      NOW()
    )
  `);

  // Create default policy (unified - preserves existing behavior)
  await db.execute(sql`
    INSERT INTO settings (scope, scope_id, key, value, description, created_at, updated_at)
    VALUES (
      'plugin_global',
      ${S3_PLUGIN_ID},
      ${NEW_POLICY_KEY},
      '{"mode": "unified"}'::jsonb,
      'S3 infrastructure tenant policy',
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING
  `);

  console.log('[Migration] S3 instances → infra.config migration complete');
}

export async function down(db: Database): Promise<void> {
  await db.execute(sql`
    DELETE FROM settings
    WHERE scope = 'plugin_global'
      AND scope_id = ${S3_PLUGIN_ID}
      AND key IN (${NEW_CONFIG_KEY}, ${NEW_POLICY_KEY})
  `);

  console.log('[Migration] S3 infra.config rollback complete');
}
