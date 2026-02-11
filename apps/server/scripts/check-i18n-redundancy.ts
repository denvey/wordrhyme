#!/usr/bin/env tsx
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

async function checkRedundancy() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set');
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    // 检查冗余情况
    const redundancy = await sql`
      SELECT
        namespace,
        key,
        COUNT(DISTINCT organization_id) as org_count,
        COUNT(*) as total_rows
      FROM i18n_messages
      GROUP BY namespace, key
      HAVING COUNT(DISTINCT organization_id) > 1
      ORDER BY org_count DESC
      LIMIT 10
    `;

    console.log('=== 翻译冗余分析 ===\n');

    if (redundancy.length === 0) {
      console.log('✅ 未发现冗余（每个 key 只在一个组织中存在）');
    } else {
      console.log('⚠️  发现相同的 key 在多个组织中重复存储:\n');
      redundancy.forEach(row => {
        console.log(`Key: ${row['namespace']}.${row['key']}`);
        console.log(`  重复组织数: ${row['org_count']}`);
        console.log(`  浪费的记录数: ${Number(row['total_rows']) - 1}\n`);
      });
    }

    // 统计总体情况
    const stats = await sql`
      SELECT
        COUNT(*) as total_messages,
        COUNT(DISTINCT organization_id) as total_orgs,
        COUNT(DISTINCT CONCAT(namespace, '.', key)) as unique_keys
      FROM i18n_messages
    `;

    console.log('=== 总体统计 ===');
    if (stats[0]) {
      const s = stats[0];
      console.log(`总记录数: ${s['total_messages']}`);
      console.log(`总组织数: ${s['total_orgs']}`);
      console.log(`唯一 key 数: ${s['unique_keys']}`);

      const avgPerOrg = Number(s['total_messages']) / Number(s['total_orgs']);
      console.log(`平均每组织: ${avgPerOrg.toFixed(1)} 条`);

      // 如果完全不冗余，应该是 unique_keys 条记录
      const idealTotal = Number(s['unique_keys']);
      const actualTotal = Number(s['total_messages']);
      const redundancyRate = ((actualTotal - idealTotal) / actualTotal * 100).toFixed(1);

      console.log(`\n理想记录数（无冗余）: ${idealTotal}`);
      console.log(`实际记录数: ${actualTotal}`);
      console.log(`冗余率: ${redundancyRate}%`);
    }

  } finally {
    await sql.end();
  }
}

checkRedundancy().catch(console.error);
