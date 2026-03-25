# Plugin Development Tutorial

This guide walks you through creating a complete WordRhyme plugin from scratch.

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- WordRhyme development environment running (see [GETTING_STARTED.md](../GETTING_STARTED.md))

## Step 1: Create Plugin Directory

```bash
mkdir -p plugins/my-plugin/src/{server,admin}
cd plugins/my-plugin
```

## Step 2: Create manifest.json

Every plugin requires a `manifest.json` that describes its identity and capabilities:

```json
{
  "pluginId": "com.example.my-plugin",
  "version": "1.0.0",
  "name": "My Plugin",
  "description": "A sample WordRhyme plugin",
  "vendor": "Your Name",
  "type": "full",
  "runtime": "node",
  "engines": {
    "wordrhyme": "^0.1.0"
  },
  "capabilities": {
    "ui": {
      "adminPage": true,
      "settingsTab": true
    },
    "data": {
      "read": true,
      "write": true
    }
  },
  "permissions": {
    "definitions": [
      {
        "key": "my_plugin.manage",
        "description": "Manage my plugin data"
      }
    ],
    "required": []
  },
  "server": {
    "entry": "./dist/server/index.js",
    "router": true,
    "hooks": ["onEnable", "onDisable"]
  },
  "admin": {
    "remoteEntry": "./dist/admin/remoteEntry.js",
    "extensions": [
      {
        "id": "my-plugin.page",
        "label": "My Plugin",
        "targets": [
          { "slot": "nav.sidebar", "path": "/p/com.example.my-plugin", "icon": "Package", "order": 100 }
        ]
      },
      {
        "id": "my-plugin.settings",
        "label": "My Plugin",
        "targets": [
          { "slot": "settings.plugin", "order": 100 }
        ]
      }
    ]
  }
}
```

## Step 3: Create Server Entry

Create `src/server/index.ts`:

```typescript
// tRPC builders must be imported from '@wordrhyme/plugin/server' (server-only)
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
// Types and utilities from '@wordrhyme/plugin' (browser-safe)
import type { PluginContext } from '@wordrhyme/plugin';
import { z } from 'zod';

// Define your tRPC router
export const router = pluginRouter({
  // Query example
  getItems: pluginProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      // Access plugin context
      const tenantId = ctx.tenantId;
      return { items: [], tenantId };
    }),

  // Mutation example
  createItem: pluginProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return { id: '1', name: input.name };
    }),
});

// Lifecycle hooks
export function onEnable(ctx: PluginContext) {
  ctx.logger.info('My Plugin enabled!');
}

export function onDisable(ctx: PluginContext) {
  ctx.logger.info('My Plugin disabled');
}
```

## Step 4: Create Admin UI

Create `src/admin/index.tsx`:

```tsx
import { navExtension, settingsExtension } from '@wordrhyme/plugin';

// Main page component
function MyPluginPage() {
  return (
    <div>
      <h1>My Plugin</h1>
      <p>Welcome to my plugin!</p>
    </div>
  );
}

// Settings tab component
function MyPluginSettings() {
  return (
    <div>
      <h2>Plugin Settings</h2>
      <p>Configure your plugin here.</p>
    </div>
  );
}

// Export extensions using helper functions
export const extensions = [
  navExtension({
    id: 'my-plugin.page',
    label: 'My Plugin',
    icon: 'Package',
    path: '/p/com.example.my-plugin',
    component: MyPluginPage,
  }),
  settingsExtension({
    id: 'my-plugin.settings',
    label: 'My Plugin',
    component: MyPluginSettings,
  }),
];
```

Available helper functions from `@wordrhyme/plugin`:

| Helper | Slot | Key Fields |
|--------|------|------------|
| `navExtension()` | `nav.sidebar` | `path` (required), `icon`, `order` |
| `settingsExtension()` | `settings.plugin` | `order`, `category` |
| `dashboardExtension()` | `dashboard.widgets` | `order`, `colSpan` (1-4) |
| `multiSlotExtension()` | Multiple | `targets: Target[]` (manual) |

> **💡 进阶**：如果需要将 UI 注入到其他插件（如 Shop）的页面中，使用 `multiSlotExtension()` 配合 Shop 扩展插槽。详见 [EXTENSION_SLOTS.md](./EXTENSION_SLOTS.md)。

## Step 5: Configure Build

Create `package.json`:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "pnpm build:server && pnpm build:admin",
    "build:server": "tsc -p tsconfig.server.json",
    "build:admin": "rsbuild build"
  },
  "dependencies": {
    "@wordrhyme/plugin": "workspace:*"
  },
  "devDependencies": {
    "@rsbuild/core": "^1.2.3",
    "@module-federation/enhanced": "^0.8.8",
    "typescript": "^5.7.2"
  }
}
```

## Step 6: Build and Test

```bash
# Build the plugin
pnpm build

# Restart the server to load the plugin
pnpm dev
```

Your plugin should now appear in the Admin sidebar!

## Database Migrations

All plugin database changes must be delivered as SQL migration files in `migrations/`:

```
plugins/my-plugin/
├── migrations/
│   ├── 0001_create_items_table.sql
│   └── 0002_add_status_column.sql
```

Migration files are executed automatically when the plugin is enabled.

Rules:

- Do not rely on exported Drizzle `schema` to create or alter tables at runtime.
- If you change `schema.ts`, you must generate a new migration and commit it together with the schema change.
- Review generated SQL before commit; runtime will execute the SQL files, not infer DDL from TypeScript definitions.

Use `pluginTable()` for plugin-private tables so table prefixing and policy columns stay platform-managed:

```typescript
import { pluginTable } from '@wordrhyme/db/plugin';
import { text, timestamp } from 'drizzle-orm/pg-core';

export const items = pluginTable('items', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Notes:

- `pluginTable()` derives the real table name from `manifest.json` via the plugin build/drizzle config.
- `organization_id`, `acl_tags`, and `deny_tags` are injected automatically for every plugin table.
- If plugin id injection is missing, schema loading fails fast instead of silently generating wrong table names.

## `@wordrhyme/plugin` Package Entry Points

`@wordrhyme/plugin` 提供了多个入口，按运行环境分离：

| 入口路径 | 内容 | 使用场景 |
|----------|------|----------|
| `@wordrhyme/plugin` | Types、Extension helpers、Schemas、Runtime helpers | 浏览器 + 服务器通用（browser-safe） |
| `@wordrhyme/plugin/server` | `pluginRouter`、`pluginProcedure`、`createPluginContext` | **仅服务器端**（依赖 `@trpc/server`） |
| `@wordrhyme/plugin/client` | Extension helpers + Schemas 子集 | 可选的最小浏览器入口 |
| `@wordrhyme/plugin/react` | React hooks（`usePluginTrpc`）、`PluginSlot` 组件 | 插件 Admin UI |

**关键规则**：

- **Server 代码**（`src/server/`）：tRPC builders 必须从 `@wordrhyme/plugin/server` 导入
- **Admin UI 代码**（`src/admin/`）：从 `@wordrhyme/plugin` 导入 Extension helpers 和类型
- **绝对不要**在 Admin UI 代码中导入 `@wordrhyme/plugin/server`，否则会导致浏览器运行时报错

```typescript
// ✅ 正确 - Server 文件
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import type { PluginContext } from '@wordrhyme/plugin';

// ✅ 正确 - Admin UI 文件
import { settingsExtension } from '@wordrhyme/plugin';

// ❌ 错误 - Admin UI 导入 server 模块会导致浏览器崩溃
import { pluginRouter } from '@wordrhyme/plugin/server';
```

## Best Practices

1. **Namespace permissions** with your plugin ID prefix
2. **Use the context** for tenant-scoped data access
3. **Handle errors gracefully** with try/catch blocks
4. **Log important events** using `ctx.logger`
5. **Validate inputs** with Zod schemas
6. **分离 server/client 导入** — tRPC builders 只从 `@wordrhyme/plugin/server` 导入
