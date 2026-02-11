/**
 * 统一资源定义 (Unified Resource Definitions)
 *
 * 单一数据源(SSOT)，自动生成：
 * - Subjects 常量
 * - 菜单定义
 * - 权限配置 UI 元数据
 *
 * @priority P0 - 权限系统核心
 *
 * 设计原则：
 * 1. **关注点分离**：权限定义只包含业务逻辑属性，不包含UI属性
 *    - ✅ 包含：subject, category, actions, menuPath
 *    - ❌ 不包含：按钮label、按钮icon、按钮variant等UI属性
 *    - 理由：支持i18n、UI灵活性、职责单一
 *
 * 2. **UI元数据分离**：
 *    - 按钮的显示文本、图标等由前端 ACTION_UI_MAP 提供
 *    - 前端通过 "权限水合" 将权限数据与UI元数据结合
 *
 * 3. **Actions定义**：
 *    - 只定义具体操作（create, read, update, delete等）
 *    - manage 权限存储在数据库中，代表完全权限
 *    - 路由定义永远使用具体action，不使用manage
 *
 * 4. **资源类型**：
 *    - 所有actions都是资源操作（包括页面级和按钮级）
 *    - 不区分DIRECTORY/MENU/BUTTON类型
 *    - menuPath为空则不生成菜单项
 */

/**
 * 资源分类
 */
export type ResourceCategory =
  | 'content'     // 内容管理: Article, Page, Media
  | 'access'      // 访问控制: User, Role, Permission
  | 'system'      // 系统配置: Settings, FeatureFlag
  | 'audit'       // 审计追踪: AuditLog
  | 'extension';  // 扩展能力: Plugin, Webhook, Menu

/**
 * 核心 Actions
 *
 * 注意:
 * - manage 可以存储在数据库中（代表完全权限）
 * - 但路由定义中永远使用具体 action (create/read/update/delete)
 */
export type CoreAction = 'manage' | 'create' | 'read' | 'update' | 'delete';

/**
 * 内容专属 Actions
 */
export type ContentAction = CoreAction | 'publish';

/**
 * 操作分组类型
 */
export type ActionGroupKey = 'basic' | 'advanced' | 'dangerous';

/**
 * 操作分组定义
 */
export interface ActionGroupDefinition {
  /** 分组键 */
  key: ActionGroupKey;
  /** 分组标签 */
  label: string;
  /** 该分组包含的操作 */
  actions: readonly string[];
}

/**
 * 条件预设键（引用 condition-presets.ts）
 */
export type ConditionPresetKey =
  | 'none'
  | 'own'
  | 'team'
  | 'department'
  | 'public'
  | 'draft'
  | 'published'
  | 'assigned'
  | 'not_archived';

/**
 * 字段定义
 */
export interface FieldDefinition {
  /** 字段名称（对应数据库列名） */
  name: string;
  /** 显示标签 */
  label: string;
  /** 字段描述 */
  description?: string;
  /** 是否敏感字段（默认隐藏） */
  sensitive?: boolean;
}

/**
 * 基础资源定义类型
 */
interface BaseResourceDefinition<
  S extends string = string,
  A extends string = string
> {
  /** CASL Subject 标识 */
  subject: S;
  /** 资源分类（用于 UI 分组和排序） */
  category: ResourceCategory;
  /** 显示名称 */
  label: string;
  /** 功能描述 */
  description?: string;
  /** 图标名称（Lucide Icons） */
  icon: string;
  /** 菜单路径（null 表示目录菜单，无具体页面） */
  menuPath: string | null;
  /** 可用操作（不包含 manage，目录菜单为空数组） */
  actions: readonly A[];
  /** 父菜单 code（用于构建菜单层级） */
  parentCode?: string;
  /** 菜单排序（同级内排序） */
  order?: number;
  /**
   * 操作分组（用于权限配置 UI）
   * - basic: 基础操作（CRUD）
   * - advanced: 高级操作（导出、发布等）
   * - dangerous: 危险操作（需要警告）
   */
  actionGroups?: readonly ActionGroupDefinition[];
  /**
   * 可用的 CASL 条件预设
   * 未定义则使用默认预设（none, own）
   */
  availablePresets?: readonly ConditionPresetKey[];
  /**
   * 资源类型标记
   * - directory: 目录节点（无实际权限，用于 UI 分组）
   * - resource: 实际资源（可配置权限）
   */
  resourceType?: 'directory' | 'resource';
  /**
   * 可配置的字段列表（用于字段级权限）
   * 未定义表示不支持字段级权限
   */
  availableFields?: readonly FieldDefinition[];
  /**
   * 系统保留权限
   * 如果为 true，则此资源的权限不能通过 UI 分配给其他角色
   * 只有 owner 和 admin 默认拥有这些权限
   */
  systemReserved?: boolean;
}

/**
 * 核心资源定义 - 单一数据源
 *
 * 规则：
 * 1. Subject 使用 PascalCase 单数形式（Article, Page, User）
 * 2. label 使用英文名称（后续由翻译管理功能处理 i18n）
 * 3. actions 不包含 manage（UI 通过"全选"按钮实现）
 * 4. menuCode 自动生成，格式：core:{slug}
 * 5. parentCode 指向父菜单的 menuCode，用于构建层级
 * 6. menuPath 为 null 表示目录菜单（无具体页面）
 *
 * 菜单结构：
 * - Dashboard (独立)
 * - Plugins (独立)
 * - Team: Members, Roles, Invitations
 * - Content: Files, Assets, Menus
 * - Settings: General, Notifications, Webhooks, API Tokens, Hooks, Audit Logs
 */
export const RESOURCE_DEFINITIONS = {
  // ============================================================
  // 一级菜单（独立）
  // ============================================================

  Dashboard: {
    subject: 'Dashboard',
    category: 'system' as ResourceCategory,
    label: 'Dashboard',
    description: 'System overview and statistics',
    icon: 'LayoutDashboard',
    menuPath: '/',
    actions: ['read'] as const,
    order: 0,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
  },

  Plugin: {
    subject: 'Plugin',
    category: 'extension' as ResourceCategory,
    label: 'App Store',
    description: 'Install and manage apps',
    icon: 'Store',
    menuPath: '/plugins',
    actions: ['create', 'read', 'update', 'delete'] as const,
    order: 5,
    resourceType: 'resource' as const,
    availablePresets: ['none', 'own'] as const,
  },

  // ============================================================
  // Team 分组（父子结构）
  // ============================================================

  Team: {
    subject: 'Team',
    category: 'access' as ResourceCategory,
    label: 'Team',
    description: 'Team and member management',
    icon: 'Users',
    menuPath: null,
    actions: [] as const,
    order: 20,
    resourceType: 'directory' as const,
  },

  Member: {
    subject: 'Member',
    category: 'access' as ResourceCategory,
    label: 'Members',
    description: 'Organization member management',
    icon: 'Users',
    menuPath: '/members',
    actions: ['create', 'read', 'update', 'delete'] as const,
    parentCode: 'core:team',
    order: 10,
    resourceType: 'resource' as const,
    availablePresets: ['none', 'own', 'team', 'department'] as const,
    availableFields: [
      { name: 'name', label: 'Name', description: 'Member name' },
      { name: 'email', label: 'Email', description: 'Email address', sensitive: true },
      { name: 'role', label: 'Role', description: 'Member role' },
      { name: 'status', label: 'Status', description: 'Account status' },
      { name: 'createdAt', label: 'Created At', description: 'Join date' },
    ] as const,
  },

  Role: {
    subject: 'Role',
    category: 'access' as ResourceCategory,
    label: 'Roles',
    description: 'Role and permission management (system reserved)',
    icon: 'Shield',
    menuPath: '/roles',
    actions: ['create', 'read', 'update', 'delete'] as const,
    parentCode: 'core:team',
    order: 20,
    resourceType: 'resource' as const,
    availablePresets: ['none', 'own'] as const,
    /** System reserved: cannot be assigned to other roles via UI */
    systemReserved: true,
  },

  Invitation: {
    subject: 'Invitation',
    category: 'access' as ResourceCategory,
    label: 'Invitations',
    description: 'Member invitation management',
    icon: 'Mail',
    menuPath: '/invitations',
    actions: ['create', 'read', 'delete'] as const,
    parentCode: 'core:team',
    order: 30,
    resourceType: 'resource' as const,
    availablePresets: ['none', 'own'] as const,
  },

  // ============================================================
  // Content 分组（父子结构）
  // ============================================================

  Content: {
    subject: 'Content',
    category: 'content' as ResourceCategory,
    label: 'Content',
    description: 'Content and asset management',
    icon: 'FolderOpen',
    menuPath: null,
    actions: [] as const,
    order: 30,
    resourceType: 'directory' as const,
  },

  File: {
    subject: 'File',
    category: 'content' as ResourceCategory,
    label: 'Files',
    description: 'File management',
    icon: 'File',
    menuPath: '/files',
    actions: ['create', 'read', 'update', 'delete'] as const,
    parentCode: 'core:content',
    order: 10,
    resourceType: 'resource' as const,
    availablePresets: ['none', 'own', 'team', 'public'] as const,
    availableFields: [
      { name: 'name', label: 'Name', description: 'File name' },
      { name: 'path', label: 'Path', description: 'File path' },
      { name: 'size', label: 'Size', description: 'File size' },
      { name: 'mimeType', label: 'Type', description: 'MIME type' },
      { name: 'creatorId', label: 'Creator', description: 'File creator' },
      { name: 'createdAt', label: 'Created At', description: 'Upload date' },
    ] as const,
  },

  Asset: {
    subject: 'Asset',
    category: 'content' as ResourceCategory,
    label: 'Assets',
    description: 'Media asset management',
    icon: 'Image',
    menuPath: '/assets',
    actions: ['create', 'read', 'update', 'delete'] as const,
    parentCode: 'core:content',
    order: 20,
    resourceType: 'resource' as const,
    availablePresets: ['none', 'own', 'team', 'public'] as const,
    availableFields: [
      { name: 'name', label: 'Name', description: 'Asset name' },
      { name: 'alt', label: 'Alt Text', description: 'Alternative text' },
      { name: 'url', label: 'URL', description: 'Asset URL' },
      { name: 'metadata', label: 'Metadata', description: 'Asset metadata' },
      { name: 'creatorId', label: 'Creator', description: 'Asset creator' },
    ] as const,
  },

  Menu: {
    subject: 'Menu',
    category: 'system' as ResourceCategory,
    label: 'Menus',
    description: 'Navigation menu configuration',
    icon: 'Menu',
    menuPath: '/menus',
    actions: ['create', 'read', 'update', 'delete'] as const,
    parentCode: 'core:settings',
    order: 25,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
  },

  // ============================================================
  // Settings 分组（父子结构）
  // ============================================================

  Settings: {
    subject: 'Settings',
    category: 'system' as ResourceCategory,
    label: 'Settings',
    description: 'System configuration',
    icon: 'Settings',
    menuPath: null,
    actions: [] as const,
    order: 100,
    resourceType: 'directory' as const,
  },

  GeneralSettings: {
    subject: 'GeneralSettings',
    category: 'system' as ResourceCategory,
    label: 'General',
    description: 'General system settings',
    icon: 'Settings2',
    menuPath: '/settings/general',
    actions: ['read', 'update'] as const,
    parentCode: 'core:settings',
    order: 10,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
  },

  Notification: {
    subject: 'Notification',
    category: 'system' as ResourceCategory,
    label: 'Notifications',
    description: 'Notification configuration',
    icon: 'Bell',
    menuPath: '/settings/notifications',
    actions: ['read', 'update'] as const,
    parentCode: 'core:settings',
    order: 20,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
  },

  Webhook: {
    subject: 'Webhook',
    category: 'extension' as ResourceCategory,
    label: 'Webhooks',
    description: 'Webhook configuration',
    icon: 'Webhook',
    menuPath: '/settings/webhooks',
    actions: ['create', 'read', 'update', 'delete'] as const,
    parentCode: 'core:settings',
    order: 30,
    resourceType: 'resource' as const,
    availablePresets: ['none', 'own'] as const,
  },

  ApiToken: {
    subject: 'ApiToken',
    category: 'extension' as ResourceCategory,
    label: 'API Tokens',
    description: 'API token management',
    icon: 'Key',
    menuPath: '/settings/api-tokens',
    actions: ['create', 'read', 'delete'] as const,
    parentCode: 'core:settings',
    order: 40,
    resourceType: 'resource' as const,
    availablePresets: ['none', 'own'] as const,
  },

  Hook: {
    subject: 'Hook',
    category: 'extension' as ResourceCategory,
    label: 'Hooks',
    description: 'System hook configuration',
    icon: 'Link',
    menuPath: '/settings/hooks',
    actions: ['create', 'read', 'update', 'delete'] as const,
    parentCode: 'core:settings',
    order: 50,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
  },

  AuditLog: {
    subject: 'AuditLog',
    category: 'audit' as ResourceCategory,
    label: 'Audit Logs',
    description: 'System operation audit records',
    icon: 'History',
    menuPath: '/settings/audit',
    actions: ['read'] as const,
    parentCode: 'core:settings',
    order: 60,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
  },

  I18n: {
    subject: 'I18n',
    category: 'system' as ResourceCategory,
    label: 'Internationalization',
    description: 'Manage languages and translations',
    icon: 'Globe',
    menuPath: null,
    actions: [] as const,
    parentCode: 'core:settings',
    order: 70,
    resourceType: 'directory' as const,
  },

  I18nLanguage: {
    subject: 'I18nLanguage',
    category: 'system' as ResourceCategory,
    label: 'Languages',
    description: 'Internationalization language management',
    icon: 'Languages',
    menuPath: '/settings/i18n/languages',
    // read 对所有登录用户开放，无需配置权限
    actions: ['create', 'update', 'delete'] as const,
    parentCode: 'core:i18n',
    order: 10,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
  },

  I18nMessage: {
    subject: 'I18nMessage',
    category: 'system' as ResourceCategory,
    label: 'Messages',
    description: 'Internationalization message and translation management',
    icon: 'MessageSquare',
    menuPath: '/settings/i18n/messages',
    // read 对所有登录用户开放，无需配置权限
    actions: ['create', 'update', 'delete'] as const,
    parentCode: 'core:i18n',
    order: 20,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
  },

  // ============================================================
  // Currency & Billing
  // ============================================================

  Currency: {
    subject: 'Currency',
    category: 'system' as ResourceCategory,
    label: 'Currencies',
    description: 'Multi-currency management',
    icon: 'DollarSign',
    menuPath: '/settings/currencies',
    // read 对所有登录用户开放，无需配置权限
    actions: ['create', 'update', 'delete'] as const,
    parentCode: 'core:settings',
    order: 80,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
  },

  ExchangeRate: {
    subject: 'ExchangeRate',
    category: 'system' as ResourceCategory,
    label: 'Exchange Rates',
    description: 'Currency exchange rate management',
    icon: 'TrendingUp',
    menuPath: '/settings/exchange-rates',
    // read 对所有登录用户开放，无需配置权限
    actions: ['create', 'update', 'delete'] as const,
    parentCode: 'core:settings',
    order: 81,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
  },

  // ============================================================
  // Platform 分组（仅平台管理员可见）
  // ============================================================

  Platform: {
    subject: 'Platform',
    category: 'system' as ResourceCategory,
    label: 'Platform',
    description: 'Platform administration (platform admin only)',
    icon: 'Server',
    menuPath: null,
    actions: [] as const,
    order: 200,
    resourceType: 'directory' as const,
    systemReserved: true,
  },

  PlatformUser: {
    subject: 'PlatformUser',
    category: 'access' as ResourceCategory,
    label: 'Users',
    description: 'Platform-wide user management',
    icon: 'Users',
    menuPath: '/platform/users',
    actions: ['read', 'update', 'delete'] as const,
    parentCode: 'core:platform',
    order: 10,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
    systemReserved: true,
  },

  PlatformSettings: {
    subject: 'PlatformSettings',
    category: 'system' as ResourceCategory,
    label: 'Settings',
    description: 'Platform system settings',
    icon: 'Settings',
    menuPath: '/platform/settings',
    actions: ['read', 'update'] as const,
    parentCode: 'core:platform',
    order: 20,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
    systemReserved: true,
  },

  PlatformOAuth: {
    subject: 'PlatformOAuth',
    category: 'system' as ResourceCategory,
    label: 'OAuth',
    description: 'OAuth provider configuration',
    icon: 'KeyRound',
    menuPath: '/platform/settings/oauth',
    actions: ['read', 'update'] as const,
    parentCode: 'core:platform-settings',
    order: 10,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
    systemReserved: true,
  },

  PlatformStorage: {
    subject: 'PlatformStorage',
    category: 'system' as ResourceCategory,
    label: 'Storage',
    description: 'Platform storage provider configuration',
    icon: 'HardDrive',
    menuPath: '/platform/storage',
    actions: ['read', 'update'] as const,
    parentCode: 'core:platform',
    order: 25,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
    systemReserved: true,
  },

  PlatformFeatureFlag: {
    subject: 'PlatformFeatureFlag',
    category: 'system' as ResourceCategory,
    label: 'Feature Flags',
    description: 'Platform feature flag management',
    icon: 'Flag',
    menuPath: '/platform/feature-flags',
    actions: ['read', 'update'] as const,
    parentCode: 'core:platform',
    order: 30,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
    systemReserved: true,
  },

  PlatformCache: {
    subject: 'PlatformCache',
    category: 'system' as ResourceCategory,
    label: 'Cache',
    description: 'Platform cache management',
    icon: 'Database',
    menuPath: '/platform/cache',
    actions: ['read', 'delete'] as const,
    parentCode: 'core:platform',
    order: 40,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
    systemReserved: true,
  },

  PlatformPluginHealth: {
    subject: 'PlatformPluginHealth',
    category: 'extension' as ResourceCategory,
    label: 'Plugin Health',
    description: 'Plugin health monitoring',
    icon: 'Activity',
    menuPath: '/platform/plugin-health',
    actions: ['read'] as const,
    parentCode: 'core:platform',
    order: 50,
    resourceType: 'resource' as const,
    availablePresets: ['none'] as const,
    systemReserved: true,
  },
} as const satisfies Record<string, BaseResourceDefinition>;

/**
 * 类型推导
 */
export type ResourceKey = keyof typeof RESOURCE_DEFINITIONS;
export type ResourceDefinition = typeof RESOURCE_DEFINITIONS[ResourceKey];
export type AppSubject = ResourceDefinition['subject'];
export type AppAction = ResourceDefinition['actions'][number];

/**
 * Subjects 常量（向后兼容）
 *
 * 使用类型断言保持精确类型
 */
export const Subjects = Object.fromEntries(
  Object.entries(RESOURCE_DEFINITIONS).map(([k, v]) => [k, v.subject])
) as { [K in ResourceKey]: typeof RESOURCE_DEFINITIONS[K]['subject'] };

/**
 * Action 中文标签
 */
export const ACTION_LABELS: Record<string, string> = {
  create: '创建',
  read: '读取',
  update: '更新',
  delete: '删除',
  publish: '发布',
} as const;

/**
 * Category 中文标签
 */
export const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  content: '内容管理',
  access: '访问控制',
  system: '系统配置',
  audit: '审计追踪',
  extension: '扩展能力',
} as const;

/**
 * 按分类分组资源
 */
export function getResourcesByCategory(): Record<ResourceCategory, ResourceDefinition[]> {
  const grouped: Partial<Record<ResourceCategory, ResourceDefinition[]>> = {};

  for (const resource of Object.values(RESOURCE_DEFINITIONS)) {
    const category = resource.category;
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category]!.push(resource);
  }

  return grouped as Record<ResourceCategory, ResourceDefinition[]>;
}

/**
 * 获取资源的所有 actions（包含中文标签）
 */
export function getResourceActions(subject: AppSubject): Array<{ value: string; label: string }> {
  const resource = Object.values(RESOURCE_DEFINITIONS).find(r => r.subject === subject);
  if (!resource) return [];

  return resource.actions.map(action => ({
    value: action,
    label: ACTION_LABELS[action] ?? action,
  }));
}

/**
 * ============================================================
 * MenuCode 自动生成
 * ============================================================
 */

/**
 * Slug 例外表（不规则复数或特殊命名）
 */
const SLUG_OVERRIDES: Partial<Record<ResourceKey, string>> = {
  Dashboard: 'dashboard',       // 单数
  Settings: 'settings',         // 单复同形
  GeneralSettings: 'settings-general',
  AuditLog: 'audit',            // 简化
  ApiToken: 'api-tokens',       // kebab-case
  Content: 'content',           // 单数（目录）
  Team: 'team',                 // 单数（目录）
  I18n: 'i18n',                 // 单数（目录）
  I18nLanguage: 'i18n-languages',
  I18nMessage: 'i18n-messages',
  // Platform 菜单（仅平台管理员可见）
  Platform: 'platform',
  PlatformUser: 'platform-users',
  PlatformSettings: 'platform-settings',
  PlatformStorage: 'platform-storage',
  PlatformOAuth: 'platform-oauth',
  PlatformFeatureFlag: 'platform-feature-flags',
  PlatformCache: 'platform-cache',
  PlatformPluginHealth: 'platform-plugin-health',
};

/**
 * 生成 menuCode
 *
 * 规则：core:{slug}
 * - 默认：subject 小写 + s（Article → articles）
 * - 例外：查 SLUG_OVERRIDES 表
 *
 * @example
 * getMenuCode('Article') // → 'core:articles'
 * getMenuCode('Media')   // → 'core:media'
 * getMenuCode('AuditLog') // → 'core:audit-logs'
 */
export function getMenuCode(subject: string): string {
  const slug = SLUG_OVERRIDES[subject as ResourceKey] ?? (subject.toLowerCase() + 's');
  return `core:${slug}`;
}

/**
 * 获取资源的 menuCode
 */
export function getResourceMenuCode(resource: ResourceDefinition): string {
  return getMenuCode(resource.subject);
}

/**
 * ============================================================
 * 资源树生成（用于权限配置 UI）
 * ============================================================
 */

/**
 * 资源树节点
 */
export interface ResourceTreeNode {
  code: string;
  subject: string;
  label: string;
  icon: string;
  category: ResourceCategory;
  order: number;
  isDirectory: boolean;
  actions: readonly string[];
  availablePresets: readonly ConditionPresetKey[];
  children: ResourceTreeNode[];
  /** System reserved: cannot be assigned to other roles via UI */
  systemReserved?: boolean;
}

/**
 * 获取资源树（用于权限配置 UI 左侧导航）
 *
 * 返回层级结构的资源列表，按 parentCode 组织父子关系
 */
export function getResourceTree(): ResourceTreeNode[] {
  const nodeMap = new Map<string, ResourceTreeNode>();
  const tree: ResourceTreeNode[] = [];

  // 第一遍：创建所有节点
  for (const [key, resource] of Object.entries(RESOURCE_DEFINITIONS)) {
    const code = getMenuCode(resource.subject);
    const isDirectory = resource.menuPath === null || (resource.resourceType as string) === 'directory';

    const node: ResourceTreeNode = {
      code,
      subject: resource.subject,
      label: resource.label,
      icon: resource.icon,
      category: resource.category,
      order: resource.order ?? 0,
      isDirectory,
      actions: resource.actions,
      availablePresets: (resource as any).availablePresets ?? ['none', 'own'],
      children: [],
      systemReserved: (resource as any).systemReserved ?? false,
    };
    nodeMap.set(code, node);
  }

  // 第二遍：构建层级关系
  for (const [key, resource] of Object.entries(RESOURCE_DEFINITIONS)) {
    const code = getMenuCode(resource.subject);
    const node = nodeMap.get(code)!;
    const parentCode = (resource as any).parentCode as string | undefined;

    if (parentCode) {
      const parent = nodeMap.get(parentCode);
      if (parent) {
        parent.children.push(node);
      } else {
        tree.push(node);
      }
    } else {
      tree.push(node);
    }
  }

  // 排序
  const sortNodes = (nodes: ResourceTreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(tree);

  return tree;
}

/**
 * 获取资源详情（用于高级配置面板）
 */
export function getResourceDetail(subject: string): {
  subject: string;
  label: string;
  description: string;
  category: ResourceCategory;
  actions: readonly string[];
  availablePresets: readonly ConditionPresetKey[];
  availableFields: readonly FieldDefinition[];
} | null {
  const resource = Object.values(RESOURCE_DEFINITIONS).find(r => r.subject === subject);
  if (!resource) return null;

  return {
    subject: resource.subject,
    label: resource.label,
    description: resource.description ?? '',
    category: resource.category,
    actions: resource.actions,
    availablePresets: (resource as any).availablePresets ?? ['none', 'own'],
    availableFields: (resource as any).availableFields ?? [],
  };
}

