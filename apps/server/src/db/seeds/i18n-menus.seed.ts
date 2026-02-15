#!/usr/bin/env tsx
/**
 * 添加 i18n 菜单项到侧边栏
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

async function seedI18nMenus() {
  try {
    console.log('📝 Adding i18n menu items...');

    // 查找 "Settings" 父菜单 (使用 code 查找)
    const settingsMenu = await client`
      SELECT id, code FROM menus
      WHERE code = 'core:settings' AND organization_id IS NULL
      LIMIT 1
    `;

    if (settingsMenu.length === 0) {
      console.log('⚠️  Settings menu not found, creating it...');

      const newSettingsMenu = await client`
        INSERT INTO menus (id, code, type, source, organization_id, label, path, icon, parent_code, "order", target, visible)
        VALUES (
          ${crypto.randomUUID()},
          'core:settings',
          'system',
          'core',
          NULL,
          'Settings',
          '/settings',
          'Settings',
          NULL,
          100,
          'admin',
          true
        )
        RETURNING id, code
      `;

      var settingsCode = newSettingsMenu[0]?.['code'] || 'core:settings';
    } else {
      var settingsCode = settingsMenu[0]?.['code'] || 'core:settings';
    }

    console.log(`✅ Settings menu code: ${settingsCode}`);

    // 检查是否已存在 i18n 菜单
    const existingLanguages = await client`
      SELECT id FROM menus WHERE code = 'core:i18n-languages'
    `;

    if (existingLanguages.length > 0) {
      console.log('⏭️  i18n menus already exist, skipping');
      return;
    }

    // 添加语言管理菜单
    await client`
      INSERT INTO menus (id, code, type, source, organization_id, label, path, icon, parent_code, "order", target, visible)
      VALUES (
        ${crypto.randomUUID()},
        'core:i18n-languages',
        'system',
        'core',
        NULL,
        'Languages',
        '/settings/languages',
        'Languages',
        ${settingsCode},
        70,
        'admin',
        true
      )
    `;

    console.log('  ✅ Added: Languages');

    // 添加翻译管理菜单
    await client`
      INSERT INTO menus (id, code, type, source, organization_id, label, path, icon, parent_code, "order", target, visible)
      VALUES (
        ${crypto.randomUUID()},
        'core:i18n-translations',
        'system',
        'core',
        NULL,
        'Translations',
        '/settings/translations',
        'FileText',
        ${settingsCode},
        71,
        'admin',
        true
      )
    `;

    console.log('  ✅ Added: Translations');

    console.log('✅ i18n menu items added successfully');

  } catch (error) {
    console.error('❌ Failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

seedI18nMenus();
