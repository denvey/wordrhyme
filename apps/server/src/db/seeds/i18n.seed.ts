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
import * as schema from '@wordrhyme/db/schema';
import { relations } from '@wordrhyme/db/relations';

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

const db = drizzle(databaseUrl, { schema, relations } as any);

/**
 * 为所有组织添加默认语言和翻译
 */
async function seedI18n() {
  try {
    console.log('🌐 Seeding i18n data...');

    // 获取所有组织
    const orgs = await db.query.organization.findMany();
    if (orgs.length === 0) {
      console.log('⚠️  No organization found, skipping i18n seed');
      return;
    }

    console.log(`Found ${orgs.length} organization(s)`);

    for (const org of orgs) {
    const orgId = org.id;
    console.log(`\n📦 Organization: ${org.name} (${orgId})`);

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
      // Admin (merged into common namespace)
      {
        namespace: 'common',
        key: 'dashboard',
        translations: {
          'zh-CN': '仪表盘',
          'en-US': 'Dashboard',
        },
      },
      {
        namespace: 'common',
        key: 'settings',
        translations: {
          'zh-CN': '设置',
          'en-US': 'Settings',
        },
      },
      {
        namespace: 'common',
        key: 'languages',
        translations: {
          'zh-CN': '语言管理',
          'en-US': 'Languages',
        },
      },
      {
        namespace: 'common',
        key: 'translations',
        translations: {
          'zh-CN': '翻译管理',
          'en-US': 'Translations',
        },
      },
      // Menu labels (key format: menu.{source}.{name})
      { namespace: 'common', key: 'menu.core.dashboard', translations: { 'zh-CN': '仪表盘', 'en-US': 'Dashboard' } },
      { namespace: 'common', key: 'menu.core.plugins', translations: { 'zh-CN': '插件', 'en-US': 'Plugins' } },
      { namespace: 'common', key: 'menu.core.members', translations: { 'zh-CN': '成员', 'en-US': 'Members' } },
      { namespace: 'common', key: 'menu.core.roles', translations: { 'zh-CN': '角色', 'en-US': 'Roles' } },
      { namespace: 'common', key: 'menu.core.tenant-audit', translations: { 'zh-CN': '审计日志', 'en-US': 'Audit Logs' } },
      { namespace: 'common', key: 'menu.core.files', translations: { 'zh-CN': '文件', 'en-US': 'Files' } },
      { namespace: 'common', key: 'menu.core.assets', translations: { 'zh-CN': '资源', 'en-US': 'Assets' } },
      { namespace: 'common', key: 'menu.core.notifications', translations: { 'zh-CN': '通知', 'en-US': 'Notifications' } },
      { namespace: 'common', key: 'menu.core.notification-templates', translations: { 'zh-CN': '通知模板', 'en-US': 'Notification Templates' } },
      { namespace: 'common', key: 'menu.core.notification-test', translations: { 'zh-CN': '通知测试', 'en-US': 'Notification Test' } },
      { namespace: 'common', key: 'menu.core.webhooks', translations: { 'zh-CN': 'Webhooks', 'en-US': 'Webhooks' } },
      { namespace: 'common', key: 'menu.core.api-tokens', translations: { 'zh-CN': 'API 令牌', 'en-US': 'API Tokens' } },
      { namespace: 'common', key: 'menu.core.settings', translations: { 'zh-CN': '设置', 'en-US': 'Settings' } },
      { namespace: 'common', key: 'menu.platform.users', translations: { 'zh-CN': '平台用户', 'en-US': 'Platform Users' } },
      { namespace: 'common', key: 'menu.platform.settings', translations: { 'zh-CN': '系统设置', 'en-US': 'System Settings' } },
      { namespace: 'common', key: 'menu.platform.feature-flags', translations: { 'zh-CN': '功能开关', 'en-US': 'Feature Flags' } },
      { namespace: 'common', key: 'menu.platform.cache', translations: { 'zh-CN': '缓存管理', 'en-US': 'Cache Management' } },
      { namespace: 'common', key: 'menu.platform.plugin-health', translations: { 'zh-CN': '插件健康', 'en-US': 'Plugin Health' } },
      { namespace: 'common', key: 'menu.platform.audit', translations: { 'zh-CN': '审计日志', 'en-US': 'Audit Logs' } },
      { namespace: 'common', key: 'menu.platform.hooks', translations: { 'zh-CN': '钩子', 'en-US': 'Hooks' } },
      // Navigation UI
      { namespace: 'common', key: 'nav.title', translations: { 'zh-CN': '导航', 'en-US': 'Navigation' } },
      { namespace: 'common', key: 'nav.error', translations: { 'zh-CN': '菜单加载失败', 'en-US': 'Failed to load menus' } },
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

    } // end for orgs

    console.log('\n✅ i18n seed completed successfully');

  } catch (error) {
    console.error('❌ i18n seed failed:', error);
    throw error;
  }
}

seedI18n();
