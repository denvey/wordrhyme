#!/usr/bin/env tsx
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../../.env') });

async function renameToMultilingual() {
  const sql = postgres(process.env['DATABASE_URL']!, { max: 1 });

  try {
    await sql`UPDATE menus SET label = 'Multilingual' WHERE code = 'core:i18n'`;
    console.log('✅ Renamed to "Multilingual"');

    const menus = await sql`
      SELECT code, label, parent_code
      FROM menus
      WHERE code IN ('core:i18n', 'core:i18n-languages', 'core:i18n-translations')
      ORDER BY code
    `;

    console.log('\n=== Current Structure ===');
    menus.forEach(m => console.log(`${m.code}: "${m.label}" (parent: ${m.parent_code})`));
  } finally {
    await sql.end();
  }
}

renameToMultilingual();
