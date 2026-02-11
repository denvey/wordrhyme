#!/usr/bin/env tsx
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

async function verifyMenus() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set');
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    console.log('=== Verifying i18n Menus ===\n');

    // 查询所有 i18n 相关菜单
    const i18nMenus = await sql`
      SELECT code, label, path, icon, parent_code, "order", visible, target
      FROM menus
      WHERE code LIKE 'core:i18n%' OR code = 'core:settings'
      ORDER BY code
    `;

    if (i18nMenus.length === 0) {
      console.log('❌ No i18n menus found');
      return;
    }

    console.log('✅ Found i18n menus:\n');
    i18nMenus.forEach(menu => {
      console.log(`Code: ${menu['code']}`);
      console.log(`  Label: ${menu['label']}`);
      console.log(`  Path: ${menu['path']}`);
      console.log(`  Icon: ${menu['icon']}`);
      console.log(`  Parent: ${menu['parent_code'] || 'ROOT'}`);
      console.log(`  Order: ${menu['order']}`);
      console.log(`  Visible: ${menu['visible']}`);
      console.log(`  Target: ${menu['target']}`);
      console.log('');
    });

    // 检查菜单层级
    const settingsMenu = i18nMenus.find(m => m['code'] === 'core:settings');
    const i18nParentMenu = i18nMenus.find(m => m['code'] === 'core:i18n');
    const languagesMenu = i18nMenus.find(m => m['code'] === 'core:i18n-languages');
    const translationsMenu = i18nMenus.find(m => m['code'] === 'core:i18n-translations');

    console.log('=== Menu Hierarchy Validation ===\n');

    if (settingsMenu) {
      console.log(`✅ Settings menu exists (${settingsMenu['code']})`);
    } else {
      console.log('❌ Settings menu missing');
    }

    if (i18nParentMenu) {
      console.log(`✅ i18n parent menu exists (${i18nParentMenu['code']})`);
      if (i18nParentMenu['parent_code'] === 'core:settings') {
        console.log('  ✅ Parent correctly set to core:settings');
      } else {
        console.log(`  ❌ Parent incorrect: ${i18nParentMenu['parent_code']}`);
      }
    } else {
      console.log('❌ i18n parent menu missing');
    }

    if (languagesMenu) {
      console.log(`✅ Languages menu exists (${languagesMenu['code']})`);
      if (languagesMenu['parent_code'] === 'core:i18n') {
        console.log('  ✅ Parent correctly set to core:i18n');
      } else {
        console.log(`  ❌ Parent incorrect: ${languagesMenu['parent_code']}`);
      }
    } else {
      console.log('❌ Languages menu missing');
    }

    if (translationsMenu) {
      console.log(`✅ Translations menu exists (${translationsMenu['code']})`);
      if (translationsMenu['parent_code'] === 'core:i18n') {
        console.log('  ✅ Parent correctly set to core:i18n');
      } else {
        console.log(`  ❌ Parent incorrect: ${translationsMenu['parent_code']}`);
      }
    } else {
      console.log('❌ Translations menu missing');
    }

  } finally {
    await sql.end();
  }
}

verifyMenus().catch(console.error);
