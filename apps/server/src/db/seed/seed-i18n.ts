/**
 * i18n System Seed Data
 *
 * Seeds default languages and core translations for an organization.
 *
 * Usage:
 * - Call seedI18nLanguages() when creating a new organization
 * - Call seedCoreTranslations() to add core UI translations
 */
import { i18nLanguages, i18nMessages } from '../schema/definitions';
import { eq, and } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDatabase = { insert: (table: any) => any; select: () => any };

/**
 * Default languages available in the system
 */
export const DEFAULT_LANGUAGES = [
  {
    locale: 'zh-CN',
    name: '简体中文',
    nativeName: '简体中文',
    isDefault: true,
    isEnabled: true,
    sortOrder: 0,
    direction: 'ltr' as const,
  },
  {
    locale: 'en-US',
    name: 'English',
    nativeName: 'English',
    isDefault: false,
    isEnabled: true,
    sortOrder: 1,
    direction: 'ltr' as const,
  },
];

/**
 * RTL languages for reference
 * Add these when the organization needs RTL support
 */
export const RTL_LANGUAGES = [
  {
    locale: 'ar-SA',
    name: 'Arabic',
    nativeName: 'العربية',
    isDefault: false,
    isEnabled: false,
    sortOrder: 10,
    direction: 'rtl' as const,
  },
  {
    locale: 'he-IL',
    name: 'Hebrew',
    nativeName: 'עברית',
    isDefault: false,
    isEnabled: false,
    sortOrder: 11,
    direction: 'rtl' as const,
  },
];

/**
 * Core UI translations
 * These are the essential system translations
 */
export const CORE_TRANSLATIONS: Array<{
  key: string;
  namespace: string;
  type: 'page' | 'api';
  translations: Record<string, string>;
  description?: string;
}> = [
  // Common actions
  {
    key: 'save',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '保存', 'en-US': 'Save' },
    description: 'Save button text',
  },
  {
    key: 'cancel',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '取消', 'en-US': 'Cancel' },
    description: 'Cancel button text',
  },
  {
    key: 'delete',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '删除', 'en-US': 'Delete' },
    description: 'Delete button text',
  },
  {
    key: 'edit',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '编辑', 'en-US': 'Edit' },
    description: 'Edit button text',
  },
  {
    key: 'create',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '创建', 'en-US': 'Create' },
    description: 'Create button text',
  },
  {
    key: 'submit',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '提交', 'en-US': 'Submit' },
    description: 'Submit button text',
  },
  {
    key: 'confirm',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '确认', 'en-US': 'Confirm' },
    description: 'Confirm button text',
  },
  {
    key: 'search',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '搜索', 'en-US': 'Search' },
    description: 'Search placeholder/button text',
  },
  {
    key: 'reset',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '重置', 'en-US': 'Reset' },
    description: 'Reset button text',
  },
  {
    key: 'back',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '返回', 'en-US': 'Back' },
    description: 'Back button text',
  },
  {
    key: 'loading',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '加载中...', 'en-US': 'Loading...' },
    description: 'Loading indicator text',
  },
  {
    key: 'noData',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '暂无数据', 'en-US': 'No data' },
    description: 'Empty state text',
  },

  // Status
  {
    key: 'status.enabled',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '启用', 'en-US': 'Enabled' },
    description: 'Enabled status',
  },
  {
    key: 'status.disabled',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '禁用', 'en-US': 'Disabled' },
    description: 'Disabled status',
  },
  {
    key: 'status.active',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '活跃', 'en-US': 'Active' },
    description: 'Active status',
  },
  {
    key: 'status.inactive',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '未激活', 'en-US': 'Inactive' },
    description: 'Inactive status',
  },

  // Messages
  {
    key: 'message.saveSuccess',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '保存成功', 'en-US': 'Saved successfully' },
    description: 'Save success message',
  },
  {
    key: 'message.saveFailed',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '保存失败', 'en-US': 'Failed to save' },
    description: 'Save failed message',
  },
  {
    key: 'message.deleteSuccess',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '删除成功', 'en-US': 'Deleted successfully' },
    description: 'Delete success message',
  },
  {
    key: 'message.deleteFailed',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '删除失败', 'en-US': 'Failed to delete' },
    description: 'Delete failed message',
  },
  {
    key: 'message.confirmDelete',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '确定要删除吗？', 'en-US': 'Are you sure you want to delete?' },
    description: 'Delete confirmation message',
  },
  {
    key: 'message.networkError',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '网络错误，请重试', 'en-US': 'Network error, please try again' },
    description: 'Network error message',
  },

  // Validation
  {
    key: 'validation.required',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '此字段为必填', 'en-US': 'This field is required' },
    description: 'Required field validation',
  },
  {
    key: 'validation.invalidEmail',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '请输入有效的邮箱地址', 'en-US': 'Please enter a valid email address' },
    description: 'Invalid email validation',
  },
  {
    key: 'validation.minLength',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '最少需要 {{min}} 个字符', 'en-US': 'Minimum {{min}} characters required' },
    description: 'Min length validation',
  },
  {
    key: 'validation.maxLength',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '最多允许 {{max}} 个字符', 'en-US': 'Maximum {{max}} characters allowed' },
    description: 'Max length validation',
  },

  // Auth
  {
    key: 'auth.login',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '登录', 'en-US': 'Log in' },
    description: 'Login button text',
  },
  {
    key: 'auth.logout',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '退出登录', 'en-US': 'Log out' },
    description: 'Logout button text',
  },
  {
    key: 'auth.register',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '注册', 'en-US': 'Sign up' },
    description: 'Register button text',
  },

  // Navigation
  {
    key: 'nav.dashboard',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '仪表盘', 'en-US': 'Dashboard' },
    description: 'Dashboard nav item',
  },
  {
    key: 'nav.settings',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '设置', 'en-US': 'Settings' },
    description: 'Settings nav item',
  },
  {
    key: 'nav.profile',
    namespace: 'common',
    type: 'page',
    translations: { 'zh-CN': '个人资料', 'en-US': 'Profile' },
    description: 'Profile nav item',
  },

  // API Error Messages
  {
    key: 'error.unauthorized',
    namespace: 'common',
    type: 'api',
    translations: { 'zh-CN': '未授权访问', 'en-US': 'Unauthorized' },
    description: 'Unauthorized error',
  },
  {
    key: 'error.forbidden',
    namespace: 'common',
    type: 'api',
    translations: { 'zh-CN': '没有权限执行此操作', 'en-US': 'You do not have permission to perform this action' },
    description: 'Forbidden error',
  },
  {
    key: 'error.notFound',
    namespace: 'common',
    type: 'api',
    translations: { 'zh-CN': '资源不存在', 'en-US': 'Resource not found' },
    description: 'Not found error',
  },
  {
    key: 'error.serverError',
    namespace: 'common',
    type: 'api',
    translations: { 'zh-CN': '服务器错误，请稍后重试', 'en-US': 'Server error, please try again later' },
    description: 'Server error',
  },
];

/**
 * Seed default languages for an organization
 */
export async function seedI18nLanguages(
  db: AnyDatabase,
  organizationId: string,
  options?: { includeRtl?: boolean }
): Promise<void> {
  const languages = options?.includeRtl
    ? [...DEFAULT_LANGUAGES, ...RTL_LANGUAGES]
    : DEFAULT_LANGUAGES;

  for (const lang of languages) {
    // Check if language already exists
    const existing = await db
      .select()
      .from(i18nLanguages)
      .where(
        and(
          eq(i18nLanguages.organizationId, organizationId),
          eq(i18nLanguages.locale, lang.locale)
        )
      )
      .then((rows: unknown[]) => rows[0]);

    if (!existing) {
      await db.insert(i18nLanguages).values({
        id: crypto.randomUUID(),
        organizationId,
        ...lang,
      });
      console.log(`  ✓ Created language: ${lang.locale} (${lang.name})`);
    } else {
      console.log(`  - Language already exists: ${lang.locale}`);
    }
  }
}

/**
 * Seed core translations for an organization
 */
export async function seedCoreTranslations(
  db: AnyDatabase,
  organizationId: string
): Promise<void> {
  for (const msg of CORE_TRANSLATIONS) {
    // Check if message already exists
    const existing = await db
      .select()
      .from(i18nMessages)
      .where(
        and(
          eq(i18nMessages.organizationId, organizationId),
          eq(i18nMessages.namespace, msg.namespace),
          eq(i18nMessages.key, msg.key)
        )
      )
      .then((rows: unknown[]) => rows[0]);

    if (!existing) {
      await db.insert(i18nMessages).values({
        id: crypto.randomUUID(),
        organizationId,
        key: msg.key,
        namespace: msg.namespace,
        type: msg.type,
        translations: msg.translations,
        description: msg.description,
        source: 'core',
        sourceId: null,
        userModified: false,
        isEnabled: true,
        version: 1,
      });
    }
  }
  console.log(`  ✓ Seeded ${CORE_TRANSLATIONS.length} core translations`);
}

/**
 * Seed all i18n data for a new organization
 */
export async function seedI18nForOrganization(
  db: AnyDatabase,
  organizationId: string,
  options?: { includeRtl?: boolean }
): Promise<void> {
  console.log(`Seeding i18n data for organization: ${organizationId}`);
  await seedI18nLanguages(db, organizationId, options);
  await seedCoreTranslations(db, organizationId);
  console.log('  ✓ i18n seeding complete');
}
