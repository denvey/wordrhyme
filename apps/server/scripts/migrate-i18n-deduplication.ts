#!/usr/bin/env tsx
/**
 * Run i18n deduplication migration
 *
 * Before: 456 records (97.4% redundancy)
 * After: ~12 global + user overrides (near 0% redundancy)
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

async function runDeduplication() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set');
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    console.log('📦 Running i18n deduplication migration...\n');

    // 迁移前统计
    const before = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE organization_id IS NOT NULL) as tenant_records
      FROM i18n_messages
    `;
    console.log('=== 迁移前 ===');
    if (before[0]) {
      console.log(`总记录数: ${before[0]['total']}`);
      console.log(`租户级记录: ${before[0]['tenant_records']}\n`);
    }

    // 执行迁移
    const migrationSQL = readFileSync(
      join(__dirname, '../drizzle/0016_i18n_deduplication.sql'),
      'utf-8'
    );

    await sql.unsafe(migrationSQL);

    console.log('✅ Deduplication migration completed\n');

    // 迁移后统计
    const after = await sql`
      SELECT
        COUNT(*) FILTER (WHERE organization_id IS NULL) as global_count,
        COUNT(*) FILTER (WHERE organization_id IS NOT NULL) as tenant_count,
        COUNT(*) as total_count
      FROM i18n_messages
    `;

    console.log('=== 迁移后 ===');
    if (after[0]) {
      const a = after[0];
      console.log(`全局翻译: ${a['global_count']} 条`);
      console.log(`租户覆盖: ${a['tenant_count']} 条`);
      console.log(`总记录数: ${a['total_count']} 条`);

      const beforeTotal = Number(before[0]?.['total'] || 0);
      const afterTotal = Number(a['total_count']);
      const saved = beforeTotal - afterTotal;
      const savedPercent = ((saved / beforeTotal) * 100).toFixed(1);

      console.log(`\n节省记录数: ${saved} (${savedPercent}%)`);
    }

    // 验证去重逻辑
    const duplicates = await sql`
      SELECT namespace, key, COUNT(*) as count
      FROM i18n_messages
      WHERE organization_id IS NULL
      GROUP BY namespace, key
      HAVING COUNT(*) > 1
    `;

    if (duplicates.length > 0) {
      console.warn('\n⚠️  警告: 发现重复的全局翻译');
      duplicates.forEach(d => {
        console.log(`  ${d['namespace']}.${d['key']} (${d['count']} 条)`);
      });
    } else {
      console.log('\n✅ 全局翻译无重复');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

runDeduplication().catch(console.error);
