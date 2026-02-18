#!/usr/bin/env tsx
/**
 * i18n System Seed Data
 *
 * Run with: pnpm tsx src/db/seeds/i18n.seed.ts
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { i18nLanguages, i18nMessages } from '@wordrhyme/db';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

// Create database connection
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

const db = drizzle(databaseUrl);

/**
 * 为第一个组织添加默认语言和翻译
 */
async function seedI18n() {
  try {
    console.log('🌐 Seeding i18n data...');

    // 获取第一个组织 ID
    const orgs = await db.query.organization.findMany({ limit: 1 });
    if (orgs.length === 0) {
      console.log('⚠️  No organization found, skipping i18n seed');
      return;
    }

    const orgId = orgs[0].id;
    console.log(`📦 Organization ID: ${orgId}`);

    // 1. 添加默认语言
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
      const existing = await db.query.i18nLanguages.findMany({
        where: {
          organizationId: orgId,
          locale: lang.locale,
        },
      });

      if (existing.length === 0) {
        await db.insert(i18nLanguages).values(lang);
        console.log(`  ✅ Added language: ${lang.name}`);
      } else {
        console.log(`  ⏭️  Language already exists: ${lang.name}`);
      }
    }

    // 2. 添加核心翻译
    const coreMessages = [
      // Common namespace
      {
        namespace: 'common',
        key: 'save',
        translations: {
          'zh-CN': '保存',
          'en-US': 'Save',
        },
      },
      {
        namespace: 'common',
        key: 'cancel',
        translations: {
          'zh-CN': '取消',
          'en-US': 'Cancel',
        },
      },
      {
        namespace: 'common',
        key: 'delete',
        translations: {
          'zh-CN': '删除',
          'en-US': 'Delete',
        },
      },
      {
        namespace: 'common',
        key: 'edit',
        translations: {
          'zh-CN': '编辑',
          'en-US': 'Edit',
        },
      },
      {
        namespace: 'common',
        key: 'create',
        translations: {
          'zh-CN': '新建',
          'en-US': 'Create',
        },
      },
      {
        namespace: 'common',
        key: 'search',
        translations: {
          'zh-CN': '搜索',
          'en-US': 'Search',
        },
      },
      {
        namespace: 'common',
        key: 'loading',
        translations: {
          'zh-CN': '加载中...',
          'en-US': 'Loading...',
        },
      },
      {
        namespace: 'common',
        key: 'confirm',
        translations: {
          'zh-CN': '确认',
          'en-US': 'Confirm',
        },
      },
      // Admin namespace
      {
        namespace: 'admin',
        key: 'dashboard',
        translations: {
          'zh-CN': '仪表盘',
          'en-US': 'Dashboard',
        },
      },
      {
        namespace: 'admin',
        key: 'settings',
        translations: {
          'zh-CN': '设置',
          'en-US': 'Settings',
        },
      },
      {
        namespace: 'admin',
        key: 'languages',
        translations: {
          'zh-CN': '语言管理',
          'en-US': 'Languages',
        },
      },
      {
        namespace: 'admin',
        key: 'translations',
        translations: {
          'zh-CN': '翻译管理',
          'en-US': 'Translations',
        },
      },
    ];

    for (const msg of coreMessages) {
      const existing = await db.query.i18nMessages.findMany({
        where: {
          organizationId: orgId,
          namespace: msg.namespace,
          key: msg.key,
        },
      });

      if (existing.length === 0) {
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
        console.log(`  ✅ Added message: ${msg.namespace}.${msg.key}`);
      } else {
        console.log(`  ⏭️  Message already exists: ${msg.namespace}.${msg.key}`);
      }
    }

    console.log('✅ i18n seed completed successfully');

  } catch (error) {
    console.error('❌ i18n seed failed:', error);
    throw error;
  }
}

seedI18n();
