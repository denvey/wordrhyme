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
    "remoteEntry": "./dist/admin/remoteEntry.js"
  }
}
```

## Step 3: Create Server Entry

Create `src/server/index.ts`:

```typescript
import { pluginRouter, pluginProcedure, type PluginContext } from '@wordrhyme/plugin';
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
import React from 'react';
import { ExtensionPoint, type Extension } from '@wordrhyme/admin';

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

// Export extensions for Admin host
export const extensions: Extension[] = [
  {
    id: 'page',
    pluginId: 'com.example.my-plugin',
    type: ExtensionPoint.SIDEBAR,
    label: 'My Plugin',
    icon: 'Package',
    path: '/p/com.example.my-plugin',
    component: MyPluginPage,
  },
  {
    id: 'settings',
    pluginId: 'com.example.my-plugin',
    type: ExtensionPoint.SETTINGS_TAB,
    label: 'My Plugin',
    component: MyPluginSettings,
  },
];
```

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

To add database tables for your plugin, create migration files in `migrations/`:

```
plugins/my-plugin/
├── migrations/
│   ├── 0001_create_items_table.sql
│   └── 0002_add_status_column.sql
```

Migration files are executed automatically when the plugin is enabled.

## Best Practices

1. **Namespace permissions** with your plugin ID prefix
2. **Use the context** for tenant-scoped data access
3. **Handle errors gracefully** with try/catch blocks
4. **Log important events** using `ctx.logger`
5. **Validate inputs** with Zod schemas
