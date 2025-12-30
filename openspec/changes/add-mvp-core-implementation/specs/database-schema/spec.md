# Database Schema Specification

## ADDED Requirements

### Requirement: Core Tables

The database schema SHALL include Core tables: `tenants`, `workspaces`, `users`, `plugins`, `permissions`, `role_permissions`, `user_roles`. All tables MUST be created via Drizzle ORM migrations.

#### Scenario: Tables exist after migration
- **WHEN** the database migration runs
- **THEN** all core tables are created
- **AND** indexes are applied (e.g., tenant_id, user_id)
- **AND** foreign key constraints are enforced

---

### Requirement: Plugin Metadata Storage

The `plugins` table SHALL store plugin metadata: `id`, `plugin_id`, `version`, `status`, `manifest` (JSONB), `installed_at`, `updated_at`.

#### Scenario: Plugin metadata stored
- **WHEN** a plugin is installed
- **THEN** a row is inserted into the `plugins` table
- **AND** the `manifest` column stores the full `manifest.json` as JSONB
- **AND** the `status` is set to `enabled`

---

### Requirement: Multi-Tenant Schema

All tenant-scoped tables SHALL include a `tenant_id` column. Foreign keys to `tenants` table SHALL enforce referential integrity.

#### Scenario: Tenant isolation enforced
- **WHEN** querying the `users` table
- **THEN** rows are filtered by `tenant_id`
- **AND** cross-tenant data is not accessible

---

### Requirement: Permission Schema

The `permissions` table SHALL store capability definitions: `id`, `capability` (e.g., `content:read`), `description`. The `role_permissions` table SHALL map roles to capabilities. The `user_roles` table SHALL map users to roles (tenant-scoped).

#### Scenario: Permission hierarchy
- **WHEN** User A has role "editor" in tenant T1
- **AND** role "editor" has capability `content:create`
- **THEN** User A can perform `content:create` in tenant T1
- **AND** User A cannot perform `content:delete` (not in role)

---

## Implementation Details

### Schema Strategy

**Choice**: 复用 better-auth 表 + 自定义扩展

better-auth 自动管理以下表 (不手动定义):
- `user` - 用户基础信息
- `session` - 会话管理  
- `organization` - 组织/租户 (= tenantId)
- `member` - 组织成员 (含角色)
- `invitation` - 组织邀请

我们手动定义:
- `plugins` - 插件元数据
- `permissions` - 能力定义
- `plugin_configs` - 插件配置存储

### File Structure

```
apps/server/src/db/
├── index.ts           # Drizzle 连接
├── schema/
│   ├── index.ts       # Schema 导出
│   ├── plugins.ts     # 插件表
│   └── permissions.ts # 权限表
└── seed.ts            # 种子数据
```

### Plugins Table

```typescript
// apps/server/src/db/schema/plugins.ts
import { pgTable, text, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PluginManifest } from '@wordrhyme/plugin';

export const plugins = pgTable('plugins', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pluginId: text('plugin_id').notNull(),
  organizationId: text('organization_id').notNull(),
  version: text('version').notNull(),
  status: text('status').notNull().$type<PluginStatus>(),
  manifest: jsonb('manifest').notNull().$type<PluginManifest>(),
  installedAt: timestamp('installed_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uniquePluginPerOrg: uniqueIndex('unique_plugin_per_org')
    .on(table.organizationId, table.pluginId),
}));

export type PluginStatus = 'enabled' | 'disabled' | 'crashed' | 'invalid';

export const pluginConfigs = pgTable('plugin_configs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pluginId: text('plugin_id').notNull(),
  organizationId: text('organization_id').notNull(),
  key: text('key').notNull(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uniqueConfigKey: uniqueIndex('unique_config_key')
    .on(table.organizationId, table.pluginId, table.key),
}));
```

### Permissions Table

```typescript
// apps/server/src/db/schema/permissions.ts
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const permissions = pgTable('permissions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  capability: text('capability').notNull().unique(),
  source: text('source').notNull(), // 'core' | pluginId
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// MVP: 内存中的角色权限映射
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ['*:*:*'],
  admin: ['organization:*:*', 'plugin:*:*', 'user:manage:*', 'content:*:*'],
  editor: ['content:create:space', 'content:update:own', 'content:read:*'],
  member: ['content:read:space', 'content:comment:*'],
  viewer: ['content:read:public'],
};
```

### Plugin Migrations Table

```typescript
// apps/server/src/db/schema/plugin-migrations.ts
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const pluginMigrations = pgTable('plugin_migrations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pluginId: text('plugin_id').notNull(),
  organizationId: text('organization_id').notNull(),
  migrationFile: text('migration_file').notNull(),
  appliedAt: timestamp('applied_at').notNull().defaultNow(),
  checksum: text('checksum').notNull(), // SHA256 of file content for integrity
}, (table) => ({
  uniqueMigration: uniqueIndex('unique_plugin_migration')
    .on(table.organizationId, table.pluginId, table.migrationFile),
}));
```

**Purpose**: 跟踪每个组织中已应用的插件迁移，防止重复执行。

| 字段 | 用途 |
|------|------|
| `pluginId` | 插件标识符 |
| `organizationId` | 组织/租户 ID |
| `migrationFile` | 迁移文件名 (e.g., `0001_create_events.sql`) |
| `checksum` | 文件内容的 SHA256 哈希，用于检测迁移文件是否被修改 |

---

### Menus Table

```typescript
// apps/server/src/db/schema/menus.ts
import { pgTable, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const menus = pgTable('menus', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Source (来源：core 或 pluginId)
  source: text('source').notNull(), // 'core' | pluginId (e.g., 'com.vendor.seo')

  // Multi-Tenant
  organizationId: text('organization_id').notNull(),

  // Menu Metadata
  label: text('label').notNull(), // 显示文本 (支持 i18n key)
  icon: text('icon'), // Lucide icon name (e.g., 'ChartBar', 'Users')
  path: text('path').notNull(), // 路由路径 (e.g., '/settings', '/plugins/seo/dashboard')

  // Hierarchy
  parentId: text('parent_id').references(() => menus.id, { onDelete: 'cascade' }),
  order: integer('order').notNull().default(0), // 显示顺序 (同级菜单排序)

  // Permission Control
  requiredPermission: text('required_permission'), // 可选，未设置则默认管理员可见

  // Target Application
  target: text('target').notNull().$type<'admin' | 'web'>(), // 菜单归属应用

  // Extensibility
  metadata: jsonb('metadata'), // 扩展字段 (e.g., { badge: '3', disabled: true })

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  // 查询优化索引
  sourceIdx: index('menus_source_idx').on(table.source),
  orgIdx: index('menus_org_idx').on(table.organizationId),
  targetIdx: index('menus_target_idx').on(table.target),
}));

export type Menu = typeof menus.$inferSelect;
export type InsertMenu = typeof menus.$inferInsert;
```

**Purpose**: 存储系统菜单（Core + 插件），支持基于权限的动态显示。

| 字段 | 说明 | 示例 |
|-----|------|------|
| `source` | 菜单来源 | `'core'` 或 `'com.vendor.seo'` |
| `organizationId` | 组织/租户 ID | UUID |
| `label` | 菜单显示文本 | `"用户管理"` / `"SEO Dashboard"` |
| `icon` | Lucide 图标名称 | `Users` / `ChartBar` |
| `path` | 前端路由路径 | `/settings/users` / `/plugins/seo/dashboard` |
| `parentId` | 父菜单ID（支持多级菜单） | `null` 或父菜单 ID |
| `order` | 同级排序权重 | `10` |
| `requiredPermission` | 所需权限（可选） | `user:manage:organization` |
| `target` | 目标应用 | `admin` 或 `web` |
| `metadata` | 扩展数据 | `{ badge: '3' }` |

**可见性逻辑**:
- `requiredPermission = null` → 默认管理员可见
- `requiredPermission != null` → 调用 `permissionKernel.can(requiredPermission)` 检查

**数据清理**:
- 插件卸载时，删除所有 `source = pluginId` 的菜单
- 父菜单删除时，子菜单自动级联删除

**Core 菜单示例**:
```typescript
// Core 菜单通过 seed 脚本初始化
await db.insert(menus).values([
  {
    id: 'core:settings',
    source: 'core',
    organizationId: org.id,
    label: '系统设置',
    icon: 'Settings',
    path: '/settings',
    order: 100,
    target: 'admin',
    requiredPermission: 'organization:update:organization',
  },
  {
    id: 'core:users',
    source: 'core',
    organizationId: org.id,
    label: '用户管理',
    icon: 'Users',
    path: '/settings/users',
    parentId: 'core:settings',
    order: 10,
    target: 'admin',
    requiredPermission: 'user:manage:organization',
  },
]);

---

### Database Connection

```typescript
// apps/server/src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
```

### Auto-generated Zod Schemas

```typescript
// apps/server/src/db/schema/index.ts
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { plugins, pluginConfigs, permissions } from '.';

export const insertPluginSchema = createInsertSchema(plugins);
export const selectPluginSchema = createSelectSchema(plugins);
export const insertPluginConfigSchema = createInsertSchema(pluginConfigs);
export const selectPluginConfigSchema = createSelectSchema(pluginConfigs);
export const insertPermissionSchema = createInsertSchema(permissions);
export const selectPermissionSchema = createSelectSchema(permissions);
```

---

### Audit Log Table

```typescript
// apps/server/src/db/schema/audit-logs.ts
import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Actor (谁执行的操作)
  actorType: text('actor_type').notNull().$type<'user' | 'plugin' | 'system'>(),
  actorId: text('actor_id').notNull(), // userId or pluginId

  // Context (在什么上下文中)
  tenantId: text('tenant_id').notNull(),
  organizationId: text('organization_id'), // 与 tenantId 一致，兼容 better-auth

  // Action (做了什么)
  action: text('action').notNull(), // 'permission.check', 'plugin.install', 'content.delete'
  resource: text('resource'), // 'user:123', 'plugin:seo', 'content:456'

  // Result (结果)
  result: text('result').notNull().$type<'allow' | 'deny' | 'error'>(),
  reason: text('reason'), // 拒绝原因 (e.g., "Missing capability: content:delete:space")

  // Metadata (额外信息)
  metadata: jsonb('metadata'), // { ip, userAgent, requestId, ... }

  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // 查询优化索引
  tenantIdx: index('audit_logs_tenant_idx').on(table.tenantId),
  actorIdx: index('audit_logs_actor_idx').on(table.actorType, table.actorId),
  actionIdx: index('audit_logs_action_idx').on(table.action),
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}));

export type AuditLogEntry = typeof auditLogs.$inferSelect;
```

**Purpose**: 记录所有权限检查、敏感操作的审计日志。

| 字段 | 说明 | 示例 |
|-----|------|------|
| `actorType` | 执行者类型 | `user`, `plugin`, `system` |
| `actorId` | 执行者ID | `user-123`, `plugin:seo` |
| `action` | 操作类型 | `permission.check`, `plugin.install` |
| `result` | 操作结果 | `allow`, `deny`, `error` |
| `reason` | 拒绝原因 | `"Missing capability: content:delete:space"` |

---

### Seed Data Script

```typescript
// apps/server/src/db/seed.ts
import { db } from './index';
import { permissions } from './schema/permissions';

/**
 * 种子数据：Core 权限定义
 *
 * 规则：
 * 1. Core 权限在系统初始化时写入 permissions 表
 * 2. 插件权限在插件安装时动态注册
 * 3. 权限格式: resource:action:scope
 */
export async function seedPermissions() {
  const corePermissions = [
    // === Organization 管理 ===
    { capability: 'organization:read:instance', source: 'core', description: '查看组织信息' },
    { capability: 'organization:create:instance', source: 'core', description: '创建组织' },
    { capability: 'organization:update:organization', source: 'core', description: '修改组织设置' },
    { capability: 'organization:delete:organization', source: 'core', description: '删除组织' },

    // === User 管理 ===
    { capability: 'user:read:organization', source: 'core', description: '查看组织成员' },
    { capability: 'user:invite:organization', source: 'core', description: '邀请成员' },
    { capability: 'user:manage:organization', source: 'core', description: '管理成员角色' },
    { capability: 'user:remove:organization', source: 'core', description: '移除成员' },

    // === Content 管理 ===
    { capability: 'content:read:public', source: 'core', description: '查看公开内容' },
    { capability: 'content:read:space', source: 'core', description: '查看空间内容' },
    { capability: 'content:create:space', source: 'core', description: '创建内容' },
    { capability: 'content:update:own', source: 'core', description: '修改自己的内容' },
    { capability: 'content:update:space', source: 'core', description: '修改空间内容' },
    { capability: 'content:delete:own', source: 'core', description: '删除自己的内容' },
    { capability: 'content:delete:space', source: 'core', description: '删除空间内容' },
    { capability: 'content:publish:space', source: 'core', description: '发布内容' },

    // === Plugin 管理 ===
    { capability: 'plugin:read:organization', source: 'core', description: '查看插件列表' },
    { capability: 'plugin:install:organization', source: 'core', description: '安装插件' },
    { capability: 'plugin:enable:organization', source: 'core', description: '启用插件' },
    { capability: 'plugin:disable:organization', source: 'core', description: '停用插件' },
    { capability: 'plugin:uninstall:organization', source: 'core', description: '卸载插件' },
    { capability: 'plugin:configure:organization', source: 'core', description: '配置插件' },
  ];

  console.log('🌱 Seeding core permissions...');

  for (const perm of corePermissions) {
    await db.insert(permissions)
      .values(perm)
      .onConflictDoNothing(); // 幂等性：已存在则跳过
  }

  console.log(`✅ Seeded ${corePermissions.length} core permissions`);
}

/**
 * 种子数据：默认租户（开发环境）
 */
export async function seedDevelopmentData() {
  if (process.env.NODE_ENV !== 'development') {
    console.log('⏭️  Skipping dev seed data (not in development mode)');
    return;
  }

  console.log('🌱 Seeding development data...');

  // better-auth 会自动管理 organization 表，这里只是示例
  // 实际使用时通过 better-auth API 创建
  console.log('ℹ️  Note: Organizations managed by better-auth, create via API');

  console.log('✅ Development seed data ready');
}

// 主函数
export async function seed() {
  await seedPermissions();
  await seedDevelopmentData();
}

// 直接运行: tsx src/db/seed.ts
if (require.main === module) {
  seed()
    .then(() => {
      console.log('✅ Seed completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}
```

