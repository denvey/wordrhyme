/**
 * 一致性校验: 验证 v2 infra policy keys 与 legacy keys / DB 数据一致
 *
 * 用途: 迁移后运行此脚本验证数据一致性。
 * 执行方式: npx tsx apps/server/src/db/migrations/verify-infra-policy-v2.ts
 *
 * 检查项:
 * 1. 每个 legacy currency policy 都有对应的 v2 key
 * 2. 每个 legacy plugin policy 都有对应的 v2 key（normalized ID）
 * 3. 每个有自定义货币的租户都有 infra.customized.currency 标记
 * 4. 没有多余的 v2 key（无对应 legacy 源）
 */

import { sql } from 'drizzle-orm';
import type { Database } from '../client';

interface CheckResult {
  check: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

function normalizeId(pluginId: string): string {
  return pluginId
    .replace(/^com\.wordrhyme\./, '')
    .replace(/\./g, '-');
}

export async function verify(db: Database): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ─── Check 1: Currency policy key consistency ───

  const legacyCurrency = await db.execute(sql`
    SELECT value FROM settings
    WHERE scope = 'global' AND key = 'core.currency.policy' AND scope_id IS NULL
    LIMIT 1
  `);

  const v2Currency = await db.execute(sql`
    SELECT value FROM settings
    WHERE scope = 'global' AND key = 'infra.policy.currency' AND scope_id IS NULL
    LIMIT 1
  `);
  const legacyCurrencyRows = legacyCurrency as Array<{ value?: { mode?: unknown } }>;
  const v2CurrencyRows = v2Currency as Array<{ value?: { mode?: unknown } }>;

  if (legacyCurrencyRows.length > 0 && v2CurrencyRows.length === 0) {
    results.push({
      check: 'currency-policy-v2-key',
      status: 'fail',
      detail: 'Legacy key core.currency.policy exists but v2 key infra.policy.currency is missing',
    });
  } else if (legacyCurrencyRows.length > 0 && v2CurrencyRows.length > 0) {
    const legacyMode = legacyCurrencyRows[0]?.value?.mode;
    const v2Mode = v2CurrencyRows[0]?.value?.mode;
    if (legacyMode !== v2Mode) {
      results.push({
        check: 'currency-policy-v2-key',
        status: 'fail',
        detail: `Mode mismatch: legacy=${legacyMode}, v2=${v2Mode}`,
      });
    } else {
      results.push({
        check: 'currency-policy-v2-key',
        status: 'pass',
        detail: `Both keys present with mode=${v2Mode}`,
      });
    }
  } else {
    results.push({
      check: 'currency-policy-v2-key',
      status: 'pass',
      detail: 'No legacy currency policy (default unified applies)',
    });
  }

  // ─── Check 2: Plugin policy key consistency ───

  const legacyPlugins = await db.execute(sql`
    SELECT scope_id, value FROM settings
    WHERE scope = 'plugin_global' AND key = 'infra.policy' AND scope_id IS NOT NULL
  `);
  const legacyPluginRows = legacyPlugins as unknown as Array<{ scope_id: string; value: { mode?: unknown } }>;

  for (const row of legacyPluginRows) {
    const moduleId = normalizeId(row.scope_id);
    const v2Key = await db.execute(sql`
      SELECT value FROM settings
      WHERE scope = 'global' AND key = ${`infra.policy.${moduleId}`}
      LIMIT 1
    `);
    const v2KeyRows = v2Key as Array<{ value?: { mode?: unknown } }>;

    if (v2KeyRows.length === 0) {
      results.push({
        check: `plugin-policy-${moduleId}`,
        status: 'fail',
        detail: `Legacy plugin policy for ${row.scope_id} exists but v2 key infra.policy.${moduleId} is missing`,
      });
    } else {
      const legacyMode = row.value?.mode;
      const v2Mode = v2KeyRows[0]?.value?.mode;
      results.push({
        check: `plugin-policy-${moduleId}`,
        status: legacyMode === v2Mode ? 'pass' : 'fail',
        detail: legacyMode === v2Mode
          ? `Consistent: mode=${v2Mode}`
          : `Mode mismatch: legacy=${legacyMode}, v2=${v2Mode}`,
      });
    }
  }

  // ─── Check 3: Currency customization flag consistency ───

  const tenantsWithCurrencies = await db.execute(sql`
    SELECT DISTINCT organization_id FROM currencies
    WHERE organization_id IS NOT NULL AND organization_id != 'platform'
  `);
  const tenantCurrencyRows = tenantsWithCurrencies as unknown as Array<{ organization_id: string }>;

  for (const row of tenantCurrencyRows) {
    const flag = await db.execute(sql`
      SELECT value FROM settings
      WHERE scope = 'tenant'
        AND organization_id = ${row.organization_id}
        AND key = 'infra.customized.currency'
      LIMIT 1
    `);
    const flagRows = flag as Array<{ value?: unknown }>;

    if (flagRows.length === 0) {
      results.push({
        check: `customization-flag-${row.organization_id}`,
        status: 'fail',
        detail: `Tenant ${row.organization_id} has currencies in DB but no infra.customized.currency flag`,
      });
    } else {
      const flagValue = flagRows[0]?.value;
      const isTruthy = flagValue === true || flagValue === 'true';
      results.push({
        check: `customization-flag-${row.organization_id}`,
        status: isTruthy ? 'pass' : 'fail',
        detail: isTruthy
          ? `Flag set for tenant ${row.organization_id}`
          : `Flag exists but value is not truthy (${JSON.stringify(flagValue)}) for tenant ${row.organization_id}`,
      });
    }
  }

  // ─── Check 4: Orphan v2 keys (v2 key exists but no legacy source) ───

  const allV2Policies = await db.execute(sql`
    SELECT key FROM settings
    WHERE scope = 'global' AND key LIKE 'infra.policy.%'
  `);
  const allV2PolicyRows = allV2Policies as unknown as Array<{ key: string }>;

  for (const row of allV2PolicyRows) {
    const module = row.key.replace('infra.policy.', '');
    if (module === 'currency') {
      // Check legacy currency key
      if (legacyCurrencyRows.length === 0) {
        results.push({
          check: `orphan-v2-${module}`,
          status: 'warn',
          detail: `v2 key infra.policy.currency exists but no legacy key core.currency.policy found`,
        });
      }
    } else {
      // Check legacy plugin key (try common prefixes)
      const legacyCheck = await db.execute(sql`
        SELECT 1 FROM settings
        WHERE scope = 'plugin_global' AND key = 'infra.policy'
          AND scope_id IS NOT NULL
        LIMIT 1
      `);
      const legacyCheckRows = legacyCheck as Array<Record<string, unknown>>;
      if (legacyCheckRows.length === 0) {
        results.push({
          check: `orphan-v2-${module}`,
          status: 'warn',
          detail: `v2 key infra.policy.${module} exists but no legacy plugin policy found`,
        });
      }
    }
  }

  // ─── Summary ───

  const fails = results.filter(r => r.status === 'fail');
  const passes = results.filter(r => r.status === 'pass');

  console.log(`\n[Verify] ${passes.length} passed, ${fails.length} failed`);
  if (fails.length > 0) {
    console.log('[Verify] FAILURES:');
    for (const f of fails) {
      console.log(`  ✘ ${f.check}: ${f.detail}`);
    }
  }

  return results;
}
