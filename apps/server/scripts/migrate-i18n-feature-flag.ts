#!/usr/bin/env tsx
/**
 * Run i18n feature flag migration
 *
 * This migration:
 * 1. Creates the `i18n.enabled` feature flag (disabled by default)
 * 2. Auto-enables it for the 38 organizations that already have i18n data
 * 3. Preserves backward compatibility for existing users
 *
 * Run with: pnpm tsx scripts/migrate-i18n-feature-flag.ts
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
    console.log('📦 Running i18n feature flag migration...');

    // Check if feature flag already exists
    const existing = await sql`
      SELECT id FROM feature_flags WHERE key = 'i18n.enabled'
    `;

    if (existing.length > 0) {
      console.log('✅ Feature flag already exists, skipping migration');
      return;
    }

    // Read migration SQL
    const migrationSQL = readFileSync(
      join(__dirname, '../drizzle/0015_i18n_feature_flag.sql'),
      'utf-8'
    );

    // Execute migration
    await sql.unsafe(migrationSQL);

    console.log('✅ i18n feature flag migration completed successfully');

    // Verify creation
    const flag = await sql`
      SELECT id, key, enabled FROM feature_flags WHERE key = 'i18n.enabled'
    `;

    if (flag.length > 0) {
      const firstFlag = flag[0];
      if (firstFlag) {
        console.log(`✅ Created feature flag: ${firstFlag['key']} (global enabled: ${firstFlag['enabled']})`);
      }
    }

    // Count auto-enabled organizations
    const overrides = await sql`
      SELECT COUNT(*)::int as count
      FROM feature_flag_overrides ffo
      JOIN feature_flags ff ON ff.id = ffo.flag_id
      WHERE ff.key = 'i18n.enabled' AND ffo.enabled = true
    `;

    if (overrides.length > 0) {
      const firstOverride = overrides[0];
      if (firstOverride) {
        console.log(`✅ Auto-enabled for ${firstOverride['count']} organizations with existing i18n data`);
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
