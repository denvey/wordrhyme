#!/usr/bin/env tsx
/**
 * 重命名 i18n 父级菜单为更短的名称
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

const client = postgres(databaseUrl);

async function renameI18nMenu() {
  try {
    console.log('📝 Renaming i18n parent menu to shorter name...\n');

    // 更新菜单标签为 "i18n"
    const updated = await client`
      UPDATE menus
      SET label = 'i18n'
      WHERE code = 'core:i18n'
      RETURNING code, label
    `;

    if (updated.length > 0) {
      console.log(`✅ Renamed menu: ${updated[0]['code']}`);
      console.log(`   Old: "Internationalization"`);
      console.log(`   New: "${updated[0]['label']}"`);
    } else {
      console.log('⚠️  Menu not found');
    }

    // 验证结果
    console.log('\n=== Final Menu Structure ===\n');

    const menus = await client`
      SELECT code, label, parent_code, "order"
      FROM menus
      WHERE code IN ('core:settings', 'core:i18n', 'core:i18n-languages', 'core:i18n-translations')
      ORDER BY
        CASE
          WHEN parent_code IS NULL THEN 0
          WHEN parent_code = 'core:settings' THEN 1
          WHEN parent_code = 'core:i18n' THEN 2
        END,
        "order"
    `;

    let currentParent = '';
    menus.forEach(menu => {
      if (menu['parent_code'] === null) {
        console.log(`${menu['label']} (${menu['code']})`);
        currentParent = menu['code'];
      } else if (menu['parent_code'] === 'core:settings') {
        if (currentParent !== 'core:settings') {
          console.log(`  Settings children:`);
          currentParent = 'core:settings';
        }
        console.log(`    └─ ${menu['label']} (${menu['code']})`);
      } else if (menu['parent_code'] === 'core:i18n') {
        if (currentParent !== 'core:i18n') {
          console.log(`      └─ i18n children:`);
          currentParent = 'core:i18n';
        }
        console.log(`          ├─ ${menu['label']} (${menu['code']})`);
      }
    });

    console.log('\n✅ Menu renaming completed');

  } catch (error) {
    console.error('❌ Failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

renameI18nMenu();
