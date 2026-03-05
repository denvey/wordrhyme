/**
 * 迁移: Infra Policy v1 keys → v2 key format
 *
 * v2 guard 从 global scope 的 `infra.policy.{module}` 读取策略模式。
 * 此迁移将旧 key 复制到新格式：
 *
 * 1. `core.currency.policy` (global) → `infra.policy.currency` (global)
 * 2. `infra.policy` (plugin_global, scopeId=pluginId) → `infra.policy.{normalizedId}` (global)
 * 3. 为已有自定义货币的租户设置 `infra.customized.currency` 标记 (tenant)
 *
 * 幂等: ON CONFLICT DO NOTHING
 *
 * @migration infra_policy_v2_keys
 */

import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Normalize manifest pluginId to module key.
 * Must stay in sync with infra-policy-guard.ts normalizeModuleId().
 */
function normalizeId(pluginId: string): string {
  return pluginId
    .replace(/^com\.wordrhyme\./, '')
    .replace(/\./g, '-');
}

export async function up(db: Database): Promise<void> {
  // ─── 1. Currency policy: core.currency.policy → infra.policy.currency ───

  const currencyPolicy = await db.execute(sql`
    SELECT value FROM settings
    WHERE scope = 'global'
      AND key = 'core.currency.policy'
      AND scope_id IS NULL
    LIMIT 1
  `);

  if (currencyPolicy.length > 0) {
    const row = currencyPolicy[0] as { value: unknown };
    await db.execute(sql`
      INSERT INTO settings (id, scope, key, value, description, created_at, updated_at)
      VALUES (
        gen_random_uuid()::text,
        'global',
        'infra.policy.currency',
        ${JSON.stringify(row.value)}::jsonb,
        'Currency tenant policy mode (v2, migrated)',
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING
    `);
    console.log('[Migration] core.currency.policy → infra.policy.currency');
  } else {
    console.log('[Migration] No currency policy found, skipping');
  }

  // ─── 2. Plugin policies: plugin_global:infra.policy → global:infra.policy.{normalizedId} ───

  const pluginPolicies = await db.execute(sql`
    SELECT scope_id, value FROM settings
    WHERE scope = 'plugin_global'
      AND key = 'infra.policy'
      AND scope_id IS NOT NULL
  `);

  // Detect normalization collisions before migrating
  const seenModuleIds = new Map<string, string>();
  for (const row of pluginPolicies as unknown as Array<{ scope_id: string; value: unknown }>) {
    const moduleId = normalizeId(row.scope_id);
    if (seenModuleIds.has(moduleId)) {
      console.warn(
        `[Migration] WARNING: Normalization collision! "${row.scope_id}" and "${seenModuleIds.get(moduleId)}" both normalize to "${moduleId}". First one wins.`
      );
    } else {
      seenModuleIds.set(moduleId, row.scope_id);
    }
  }

  for (const row of pluginPolicies as unknown as Array<{ scope_id: string; value: unknown }>) {
    const moduleId = normalizeId(row.scope_id);
    await db.execute(sql`
      INSERT INTO settings (id, scope, key, value, description, created_at, updated_at)
      VALUES (
        gen_random_uuid()::text,
        'global',
        ${`infra.policy.${moduleId}`},
        ${JSON.stringify(row.value)}::jsonb,
        ${`Infrastructure policy for ${moduleId} (v2, migrated)`},
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING
    `);
    console.log(`[Migration] plugin_global:infra.policy (${row.scope_id}) → infra.policy.${moduleId}`);
  }

  // ─── 3. Currency customization flag: DB query → Settings flag ───

  const tenantCurrencies = await db.execute(sql`
    SELECT DISTINCT organization_id FROM currencies
    WHERE organization_id IS NOT NULL
      AND organization_id != 'platform'
  `);

  let flagCount = 0;
  for (const row of tenantCurrencies as unknown as Array<{ organization_id: string }>) {
    await db.execute(sql`
      INSERT INTO settings (id, scope, organization_id, key, value, description, created_at, updated_at)
      VALUES (
        gen_random_uuid()::text,
        'tenant',
        ${row.organization_id},
        'infra.customized.currency',
        'true'::jsonb,
        'Currency customization flag (v2, migrated from DB)',
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING
    `);
    flagCount++;
  }
  console.log(`[Migration] Set infra.customized.currency for ${flagCount} tenants`);

  console.log('[Migration] Infra Policy v2 key migration complete');
}

export async function down(db: Database): Promise<void> {
  // Remove v2 policy keys (keep legacy keys intact)
  await db.execute(sql`
    DELETE FROM settings
    WHERE scope = 'global'
      AND key LIKE 'infra.policy.%'
      AND description LIKE '%(v2, migrated)%'
  `);

  // Remove migrated customization flags
  await db.execute(sql`
    DELETE FROM settings
    WHERE scope = 'tenant'
      AND key = 'infra.customized.currency'
      AND description LIKE '%(v2, migrated from DB)%'
  `);

  console.log('[Migration] Infra Policy v2 key rollback complete');
}
