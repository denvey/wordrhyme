# 插件开发指南

> WordRhyme 插件系统开发完整指南

## 概述

WordRhyme 采用**契约优先**的插件架构，插件通过定义明确的边界与核心系统交互。本指南将帮助你理解插件系统的设计理念，并创建高质量的插件。

## 核心原则

### 契约边界

```
┌─────────────────────────────────────────────────────────┐
│                     Core System                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │              @wordrhyme/plugin-api                   ││
│  │  (Capabilities, Hooks, Events, Types)               ││
│  └─────────────────────────────────────────────────────┘│
│                          ▲                               │
│                          │ 唯一接口                       │
│                          │                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │                    Plugins                           ││
│  │  ❌ 不能访问 Core 内部                                ││
│  │  ❌ 不能修改 Core 状态                                ││
│  │  ❌ 不能访问其他插件数据                              ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 关键限制

| 禁止行为 | 原因 |
|----------|------|
| 直接修改 Core 状态 | 破坏数据一致性 |
| 访问其他插件数据 | 隔离性原则 |
| 绕过权限系统 | 安全性 |
| 缓存权限结果 | 权限可能动态变化 |
| 假设执行顺序 | 插件独立性 |
| 阻塞 Core 执行 | 系统稳定性 |

---

## 插件结构

### 目录布局

```
my-plugin/
├── plugin.json          # 插件清单文件（必需）
├── src/
│   ├── index.ts         # 插件入口
│   ├── hooks.ts         # Hook 处理器
│   ├── routes.ts        # API 路由（可选）
│   └── ui/              # 前端组件（可选）
│       ├── index.tsx
│       └── settings.tsx
├── migrations/          # 数据库迁移（涉及 schema 时必需）
│   └── 001_init.sql
└── package.json
```

### 数据库变更规则

- 运行时只执行 `migrations/` 下的 SQL migration，不会根据导出的 `schema` 自动建表或改表。
- `schema.ts`/Drizzle table 定义用于类型、校验派生和卸载时的表发现，不是运行时 migration 来源。
- 插件私有表统一使用 `@wordrhyme/db/plugin` 导出的 `pluginTable()`，不要直接手写带前缀的 `pgTable('plugin_xxx_...')`。
- `pluginTable()` 会自动基于插件 `manifest.json` 注入表名前缀，以及平台保留字段：`organizationId`、`aclTags`、`denyTags`。
- 如果 schema 加载时拿不到插件 id，`pluginTable()` 会直接报错；正确做法是让插件构建脚本和 drizzle config 从 `manifest.json` 注入同一个 `pluginId`。
- 只要修改了插件数据库 schema，就必须同时：
  - 生成新的 migration SQL
  - 审查生成内容
  - 将 migration 文件提交到 git
- 禁止只改 `schema.ts` 而不提交对应 migration，否则会造成 schema drift。

### plugin.json 清单

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "示例插件",
  "author": "Your Name",
  "main": "src/index.ts",

  "capabilities": {
    "logger": true,
    "settings": true,
    "data": {
      "tables": ["items", "logs"]
    },
    "hooks": true,
    "notifications": true
  },

  "permissions": [
    "content:read",
    "content:write"
  ],

  "hooks": [
    {
      "hookId": "content.beforeCreate",
      "handler": "src/hooks.ts#onBeforeCreate",
      "priority": 50
    }
  ],

  "notifications": {
    "permissions": ["notification:send"],
    "types": [
      {
        "id": "item-created",
        "title": "Item Created",
        "priority": "normal"
      }
    ]
  },

  "ui": {
    "settings": "src/ui/settings.tsx",
    "extensions": [
      {
        "id": "my-plugin.sidebar",
        "label": "Related Items",
        "targets": [
          { "slot": "nav.sidebar", "path": "/p/com.example.my-plugin", "icon": "Package", "order": 100 }
        ]
      },
      {
        "id": "my-plugin.settings",
        "label": "My Plugin Settings",
        "targets": [
          { "slot": "settings.plugin", "order": 50 }
        ]
      }
    ]
  },

  "dataRetention": {
    "onDisable": "preserve",
    "onUninstall": "delete"
  }
}
```

### 插件表定义示例

```typescript
import { pluginTable } from '@wordrhyme/db/plugin';
import { text, timestamp } from 'drizzle-orm/pg-core';

export const greetings = pluginTable('greetings', {
  id: text('id').primaryKey(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

说明：

- 开发者只写业务字段和短表名，如 `greetings`
- 实际表名会自动变成 `plugin_<plugin_id>_greetings`
- `organization_id`、`acl_tags`、`deny_tags` 由平台统一注入

---

## 插件入口

### 基础结构

```typescript
// src/index.ts
import type { PluginContext, PluginLifecycle } from '@wordrhyme/plugin';

/**
 * 插件生命周期
 */
const plugin: PluginLifecycle = {
  /**
   * 插件启动时调用
   */
  async onEnable(ctx: PluginContext): Promise<void> {
    ctx.logger.info('Plugin enabled');

    // 初始化设置
    const apiKey = await ctx.settings.get('apiKey');
    if (!apiKey) {
      await ctx.settings.set('apiKey', '', {
        description: 'External API Key',
        encrypted: true,
      });
    }

    // 注册 Hook
    ctx.hooks?.addAction('content.created', async (content) => {
      ctx.logger.info(`Content created: ${content.id}`);
    });
  },

  /**
   * 插件禁用时调用
   */
  async onDisable(ctx: PluginContext): Promise<void> {
    ctx.logger.info('Plugin disabled');
    // 清理资源
  },

  /**
   * 插件卸载时调用
   */
  async onUninstall(ctx: PluginContext): Promise<void> {
    ctx.logger.info('Plugin uninstalled');
    // 清理数据（如果 dataRetention.onUninstall = "delete"）
  },
};

export default plugin;
```

---

## Capabilities 使用

### Logger Capability

```typescript
// 自动注入 pluginId 和 organizationId
ctx.logger.info('Operation completed', { itemId: '123' });
ctx.logger.warn('Rate limit approaching');
ctx.logger.error('Failed to process', { error: err.message });
ctx.logger.debug('Debug info');  // 仅在租户启用调试时输出
```

### Settings Capability

```typescript
// 读取设置（级联解析：plugin_tenant → plugin_global → defaultValue）
const theme = await ctx.settings.get<string>('theme', 'light');

// 写入租户级设置
await ctx.settings.set('apiKey', 'sk-xxx', {
  encrypted: true,
  description: 'API 密钥',
});

// 写入全局设置（跨所有租户）
await ctx.settings.set('version', '2.0', { global: true });

// 列出所有设置
const settings = await ctx.settings.list({ keyPrefix: 'feature.' });

// 检查功能开关
if (await ctx.settings.isFeatureEnabled('beta-features')) {
  // 启用 Beta 功能
}
```

### Database Capability

```typescript
// 查询数据（自动添加 tenant_id 过滤）
const items = await ctx.db.query<Item>({
  table: 'items',  // 实际表名: plugin_com_example_my_plugin_items
  where: { status: 'active' },
  limit: 10,
});

// 插入数据
await ctx.db.insert({
  table: 'items',
  data: { name: 'New Item', status: 'active' },
});

// 更新数据
await ctx.db.update({
  table: 'items',
  where: { id: 'item-123' },
  data: { status: 'completed' },
});

// 删除数据
await ctx.db.delete({
  table: 'items',
  where: { id: 'item-123' },
});

// 原始 SQL（必须包含表前缀）
const result = await ctx.db.raw<Result>(
  `SELECT * FROM plugin_com_example_my_plugin_items WHERE created_at > '2025-01-01'`
);
```

### Notification Capability

```typescript
// 发送通知
await ctx.notifications.send({
  type: 'item-created',  // 必须在 manifest 中声明
  userId: 'user-123',
  target: {
    type: 'item',
    id: 'item-456',
    url: '/items/item-456',
  },
  actor: {
    id: ctx.userId,
    name: 'Current User',
  },
  data: {
    itemName: 'New Item',
  },
});

// 注册自定义模板
await ctx.notifications.registerTemplate({
  key: 'weekly-digest',
  title: { 'en-US': 'Weekly Digest', 'zh-CN': '每周摘要' },
  message: { 'en-US': 'You have {{count}} updates', 'zh-CN': '您有 {{count}} 条更新' },
  priority: 'low',
});

// 监听通知创建事件
const unsubscribe = ctx.notifications.onNotificationCreated(async (event) => {
  console.log(`Notification sent to ${event.user.id}`);
});
```

### Metrics Capability

```typescript
// 记录计数器
ctx.metrics?.increment('api.calls', 1, { endpoint: '/items' });

// 记录计量值
ctx.metrics?.gauge('queue.size', 42);

// 记录耗时
ctx.metrics?.timing('api.latency', 150, { endpoint: '/items' });
```

### Trace Capability

```typescript
// 创建追踪 Span
const span = ctx.trace.startSpan('process-item');
try {
  // 处理逻辑
  span.setAttribute('item.id', 'item-123');
  // ...
} catch (error) {
  span.recordException(error);
  throw error;
} finally {
  span.end();
}
```

---

## 数据库迁移

### 迁移文件

```sql
-- migrations/001_init.sql
-- 创建插件私有表
-- 表名必须使用前缀: plugin_{pluginId}_

CREATE TABLE IF NOT EXISTS plugin_com_example_my_plugin_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,  -- 必须包含租户 ID
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_items_tenant ON plugin_com_example_my_plugin_items(tenant_id);
CREATE INDEX idx_items_status ON plugin_com_example_my_plugin_items(tenant_id, status);
```

### 迁移规则

1. **表名前缀**: `plugin_{pluginId}_` （点和横线替换为下划线）
2. **必须字段**: `tenant_id` 用于多租户隔离
3. **索引**: 所有查询字段都应包含 `tenant_id`
4. **外键**: 避免外键约束，使用应用层检查

---

## 前端 UI 扩展

### Slot & Fill 架构

WordRhyme 使用 **Slot & Fill** 模式：Core 在页面中放置 `<PluginSlot>`（slot），插件声明 `targets` 填充到对应 slot 中。

#### CORE_SLOTS 白名单

| Slot 名 | 用途 | 特有字段 |
|---------|------|---------|
| `nav.sidebar` | 左侧导航栏插件入口 | `path`（必须）、`icon`、`requiredPermission` |
| `settings.plugin` | 系统设置 → 插件 Tab | `category` |
| `dashboard.widgets` | 仪表盘小部件 | `colSpan`（1-4） |
| `dashboard.overview` | 仪表盘概览区 | `colSpan`（1-4） |

> 也支持自定义 slot（如 `article.editor.sidebar`），但不在白名单中，开发模式下会发出警告。

### 使用辅助函数注册扩展

```tsx
// src/admin/index.tsx
import {
  navExtension,
  settingsExtension,
  dashboardExtension,
  multiSlotExtension,
} from '@wordrhyme/plugin';

// 导航栏扩展
export const extensions = [
  navExtension({
    id: 'my-plugin.page',
    label: 'My Plugin',
    icon: 'Package',
    path: '/p/com.example.my-plugin',
    component: MyPluginPage,
  }),

  // 设置页扩展
  settingsExtension({
    id: 'my-plugin.settings',
    label: 'My Plugin Settings',
    component: MyPluginSettings,
  }),

  // 仪表盘小部件扩展
  dashboardExtension({
    id: 'my-plugin.widget',
    label: 'Stats Widget',
    component: StatsWidget,
    colSpan: 2,
  }),
];
```

#### 多 Slot 扩展

如果一个扩展需要同时注册到多个 slot，使用 `multiSlotExtension()`：

```tsx
import { multiSlotExtension } from '@wordrhyme/plugin';

export const extensions = [
  multiSlotExtension({
    id: 'email.main',
    label: 'Email (Resend)',
    icon: 'Mail',
    component: EmailPage,
    targets: [
      { slot: 'nav.sidebar', path: '/p/com.wordrhyme.email-resend', icon: 'Mail', order: 50 },
      { slot: 'settings.plugin', order: 50 },
    ],
  }),
];
```

### 设置页面

```tsx
// src/ui/settings.tsx
import { usePluginSettings } from '@wordrhyme/plugin-react';

export default function SettingsPage() {
  const { settings, updateSetting, isLoading } = usePluginSettings();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h2>Plugin Settings</h2>
      <label>
        API Key:
        <input
          type="password"
          value={settings.apiKey || ''}
          onChange={(e) => updateSetting('apiKey', e.target.value)}
        />
      </label>
    </div>
  );
}
```

---

## 生命周期

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Install   │ ──▶ │   Enable    │ ──▶ │   Running   │
└─────────────┘     └─────────────┘     └─────────────┘
                          │                    │
                          ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   Disable   │ ◀── │   Upgrade   │
                    └─────────────┘     └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │  Uninstall  │
                    └─────────────┘
```

### 生命周期钩子

| 钩子 | 调用时机 | 典型用途 |
|------|----------|----------|
| `onInstall` | 安装时 | 运行迁移，初始化数据 |
| `onEnable` | 启用时 | 注册 Hook，启动后台任务 |
| `onDisable` | 禁用时 | 取消注册，停止任务 |
| `onUninstall` | 卸载时 | 清理数据 |
| `onUpgrade` | 升级时 | 运行增量迁移 |

---

## 最佳实践

### 1. 错误处理

```typescript
try {
  await riskyOperation();
} catch (error) {
  ctx.logger.error('Operation failed', {
    error: error.message,
    stack: error.stack,
  });
  // 不要让错误传播到 Core
  // 优雅降级或跳过
}
```

### 2. 配置验证

```typescript
async function validateConfig(ctx: PluginContext): Promise<boolean> {
  const apiKey = await ctx.settings.get<string>('apiKey');

  if (!apiKey) {
    ctx.logger.warn('API Key not configured');
    return false;
  }

  return true;
}
```

### 3. 资源清理

```typescript
const subscriptions: Array<() => void> = [];

function onEnable(ctx: PluginContext) {
  // 保存取消订阅函数
  subscriptions.push(
    ctx.hooks?.addAction('content.created', handleContent)
  );
}

function onDisable(ctx: PluginContext) {
  // 清理所有订阅
  subscriptions.forEach(unsub => unsub());
  subscriptions.length = 0;
}
```

### 4. 性能考虑

- 避免在 Hook 中执行耗时操作
- 使用异步任务队列处理重型工作
- 合理设置 Hook 超时时间
- 使用 `ctx.metrics` 监控性能

---

## 调试技巧

### 启用调试日志

租户管理员可以在设置中启用插件调试模式，此时 `ctx.logger.debug()` 会输出日志。

### 本地开发

```bash
# 安装依赖
pnpm install

# 本地开发模式
pnpm dev

# 构建
pnpm build

# 打包
pnpm pack
```

### 测试

```typescript
// __tests__/plugin.test.ts
import { createMockContext } from '@wordrhyme/plugin-testing';

describe('MyPlugin', () => {
  it('should handle content creation', async () => {
    const ctx = createMockContext({
      pluginId: 'com.example.my-plugin',
      organizationId: 'org-123',
    });

    // 测试逻辑
  });
});
```

---

## 发布流程

1. **构建**: `pnpm build`
2. **测试**: `pnpm test`
3. **打包**: `pnpm pack` → `my-plugin-1.0.0.tgz`
4. **上传**: 通过管理后台上传插件包
5. **审核**: 等待平台审核（如果是公开插件）
6. **发布**: 审核通过后发布到插件市场
