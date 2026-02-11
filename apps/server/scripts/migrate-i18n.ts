#!/usr/bin/env tsx
/**
 * Run i18n migration
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
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  try {
    // Check if tables already exist
    const existingTables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('i18n_languages', 'i18n_messages')
    `;

    if (existingTables.length === 2) {
      console.log('✅ i18n tables already exist, skipping migration');
      return;
    }

    console.log('📦 Running i18n migration...');

    // Read migration SQL
    const migrationSQL = readFileSync(
      join(__dirname, '../drizzle/0013_i18n_system.sql'),
      'utf-8'
    );

    // Execute migration
    await sql.unsafe(migrationSQL);

    console.log('✅ i18n migration completed successfully');

    // Verify tables
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('i18n_languages', 'i18n_messages')
    `;

    console.log(`✅ Created tables: ${tables.map(t => t.table_name).join(', ')}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

runMigration().catch(console.error);
