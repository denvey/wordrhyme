#!/usr/bin/env tsx
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

async function verify() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set');
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    // 1. Global setting
    const globalSetting = await sql`
      SELECT scope, organization_id, key, value
      FROM settings
      WHERE scope='global' AND key='features.i18n.enabled'
    `;
    console.log('=== Global Setting ===');
    console.log(globalSetting[0]);

    // 2. Tenant settings count
    const tenantCount = await sql`
      SELECT COUNT(*)::int as count
      FROM settings
      WHERE scope='tenant' AND key='features.i18n.enabled' AND value='true'::jsonb
    `;
    console.log('\n=== Enabled Organizations ===');
    if (tenantCount[0]) {
      console.log('Count:', tenantCount[0]['count']);
    }

    // 3. Sample tenant settings
    const samples = await sql`
      SELECT scope, organization_id, value
      FROM settings
      WHERE scope='tenant' AND key='features.i18n.enabled'
      LIMIT 3
    `;
    console.log('\n=== Sample Tenant Settings ===');
    samples.forEach(s => console.log(s));

  } finally {
    await sql.end();
  }
}

verify().catch(console.error);
