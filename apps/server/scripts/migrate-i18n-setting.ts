#!/usr/bin/env tsx
/**
 * Run i18n setting migration (using Settings System)
 *
 * This migration:
 * 1. Creates global setting `features.i18n.enabled` (disabled by default)
 * 2. Auto-enables it for the 38 organizations that already have i18n data
 * 3. Uses existing Settings infrastructure (no new tables needed)
 *
 * Run with: pnpm tsx scripts/migrate-i18n-setting.ts
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from monorepo root
dotenv.config({ path: join(__dirname, '../../../.env') });

async function runMigration() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    console.log('📦 Running i18n setting migration...');

    // Check if setting already exists
    const existing = await sql`
      SELECT id FROM settings
      WHERE scope = 'global'
      AND key = 'features.i18n.enabled'
    `;

    if (existing.length > 0) {
      console.log('✅ Setting already exists, skipping migration');
      return;
    }

    // Read migration SQL
    const migrationSQL = readFileSync(
      join(__dirname, '../drizzle/0015_i18n_setting.sql'),
      'utf-8'
    );

    // Execute migration
    await sql.unsafe(migrationSQL);

    console.log('✅ i18n setting migration completed successfully');

    // Verify global setting
    const globalSetting = await sql`
      SELECT key, value FROM settings
      WHERE scope = 'global'
      AND key = 'features.i18n.enabled'
    `;

    if (globalSetting.length > 0) {
      const setting = globalSetting[0];
      if (setting) {
        console.log(`✅ Created global setting: ${setting['key']} = ${setting['value']}`);
      }
    }

    // Count auto-enabled organizations
    const tenantSettings = await sql`
      SELECT COUNT(*)::int as count
      FROM settings
      WHERE scope = 'tenant'
      AND key = 'features.i18n.enabled'
      AND value = 'true'::jsonb
    `;

    if (tenantSettings.length > 0) {
      const count = tenantSettings[0];
      if (count) {
        console.log(`✅ Auto-enabled for ${count['count']} organizations with existing i18n data`);
      }
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

runMigration().catch(console.error);
