#!/usr/bin/env tsx
/**
 * 为所有组织添加 i18n seed 数据
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { i18nLanguages, i18nMessages } from '@wordrhyme/db';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

const client = postgres(databaseUrl);
const db = drizzle(client);

async function seedAllOrganizations() {
  try {
    console.log('🌐 Seeding i18n data for all organizations...');

    // 获取所有组织
    const orgs = await client`SELECT id, name FROM organization`;
    console.log(`Found ${orgs.length} organization(s)`);

    for (const org of orgs) {
      const orgId = org.id as string;
      const orgName = org.name as string;
      console.log(`\n📦 Processing: ${orgName} (${orgId})`);

      // 检查是否已有语言
      const existing = await client`
        SELECT COUNT(*)::int as count FROM i18n_languages
        WHERE organization_id = ${orgId}
      `;

      if (existing[0]?.count > 0) {
        console.log(`  ⏭️  Already has ${existing[0].count} languages, skipping`);
        continue;
      }

      // 添加语言
      const languages = [
        {
          id: crypto.randomUUID(),
          organizationId: orgId,
          locale: 'zh-CN',
          name: '简体中文',
          nativeName: '简体中文',
          isDefault: true,
          isEnabled: true,
          sortOrder: 1,
          direction: 'ltr' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: crypto.randomUUID(),
          organizationId: orgId,
          locale: 'en-US',
          name: 'English (US)',
          nativeName: 'English (US)',
          isDefault: false,
          isEnabled: true,
          sortOrder: 2,
          direction: 'ltr' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      for (const lang of languages) {
        await db.insert(i18nLanguages).values(lang);
        console.log(`    ✅ Added: ${lang.name}`);
      }

      // 添加核心翻译
      const coreMessages = [
        { namespace: 'common', key: 'save', translations: { 'zh-CN': '保存', 'en-US': 'Save' } },
        { namespace: 'common', key: 'cancel', translations: { 'zh-CN': '取消', 'en-US': 'Cancel' } },
        { namespace: 'common', key: 'delete', translations: { 'zh-CN': '删除', 'en-US': 'Delete' } },
        { namespace: 'common', key: 'edit', translations: { 'zh-CN': '编辑', 'en-US': 'Edit' } },
        { namespace: 'common', key: 'create', translations: { 'zh-CN': '新建', 'en-US': 'Create' } },
        { namespace: 'common', key: 'search', translations: { 'zh-CN': '搜索', 'en-US': 'Search' } },
        { namespace: 'common', key: 'loading', translations: { 'zh-CN': '加载中...', 'en-US': 'Loading...' } },
        { namespace: 'common', key: 'confirm', translations: { 'zh-CN': '确认', 'en-US': 'Confirm' } },
        { namespace: 'admin', key: 'dashboard', translations: { 'zh-CN': '仪表盘', 'en-US': 'Dashboard' } },
        { namespace: 'admin', key: 'settings', translations: { 'zh-CN': '设置', 'en-US': 'Settings' } },
        { namespace: 'admin', key: 'languages', translations: { 'zh-CN': '语言管理', 'en-US': 'Languages' } },
        { namespace: 'admin', key: 'translations', translations: { 'zh-CN': '翻译管理', 'en-US': 'Translations' } },
      ];

      for (const msg of coreMessages) {
        await db.insert(i18nMessages).values({
          id: crypto.randomUUID(),
          organizationId: orgId,
          namespace: msg.namespace,
          key: msg.key,
          type: 'page',
          translations: msg.translations,
          source: 'core',
          isEnabled: true,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      console.log(`    ✅ Added ${coreMessages.length} translations`);
    }

    console.log('\n✅ i18n seed completed for all organizations');

  } catch (error) {
    console.error('❌ Failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

seedAllOrganizations();
