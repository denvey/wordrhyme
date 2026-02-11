#!/usr/bin/env tsx
/**
 * 重构 i18n 菜单结构 - 添加父级菜单
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

async function restructureI18nMenus() {
  try {
    console.log('📝 Restructuring i18n menus with parent...\n');

    // 1. 创建 i18n 父级菜单
    const existingI18nParent = await client`
      SELECT id, code FROM menus WHERE code = 'core:i18n'
    `;

    let i18nParentCode: string;

    if (existingI18nParent.length > 0) {
      console.log('⏭️  i18n parent menu already exists');
      i18nParentCode = 'core:i18n';
    } else {
      await client`
        INSERT INTO menus (id, code, type, source, organization_id, label, path, icon, parent_code, "order", target, visible)
        VALUES (
          ${crypto.randomUUID()},
          'core:i18n',
          'system',
          'core',
          NULL,
          'Internationalization',
          NULL,
          'Globe',
          'core:settings',
          70,
          'admin',
          true
        )
      `;
      console.log('✅ Created parent menu: Internationalization');
      i18nParentCode = 'core:i18n';
    }

    // 2. 更新 Languages 和 Translations 的父级
    const updatedLanguages = await client`
      UPDATE menus
      SET parent_code = ${i18nParentCode}, "order" = 10
      WHERE code = 'core:i18n-languages'
      RETURNING code
    `;

    if (updatedLanguages.length > 0) {
      console.log('✅ Updated Languages menu parent');
    }

    const updatedTranslations = await client`
      UPDATE menus
      SET parent_code = ${i18nParentCode}, "order" = 20
      WHERE code = 'core:i18n-translations'
      RETURNING code
    `;

    if (updatedTranslations.length > 0) {
      console.log('✅ Updated Translations menu parent');
    }

    // 3. 验证结果
    console.log('\n=== Final Structure ===\n');

    const finalMenus = await client`
      SELECT code, label, path, parent_code, "order"
      FROM menus
      WHERE code IN ('core:settings', 'core:i18n', 'core:i18n-languages', 'core:i18n-translations')
      ORDER BY parent_code NULLS FIRST, "order"
    `;

    finalMenus.forEach(menu => {
      const indent = menu['parent_code'] === 'core:i18n' ? '    ' :
                     menu['parent_code'] === 'core:settings' ? '  ' : '';
      console.log(`${indent}${menu['label']} (${menu['code']}) - order: ${menu['order']}`);
    });

    console.log('\n✅ i18n menu restructuring completed');

  } catch (error) {
    console.error('❌ Failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

restructureI18nMenus();
