# API Reference

## @wordrhyme/plugin

The plugin SDK for building WordRhyme plugins.

### Plugin Definition

```typescript
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin';

export const router = pluginRouter({
  myProcedure: pluginProcedure
    .input(z.object({ ... }))
    .query(async ({ input, ctx }) => { ... })
});
```

### PluginContext

Available in all plugin procedures:

| Property | Type | Description |
|----------|------|-------------|
| `tenantId` | `string` | Current tenant ID |
| `userId` | `string` | Current user ID |
| `pluginId` | `string` | Plugin's ID |
| `logger` | `Logger` | Scoped logger |
| `permissions` | `PermissionCapability` | Permission checks |
| `data` | `DataCapability` | Database access |

### Lifecycle Hooks

```typescript
export function onInstall(ctx: PluginContext) { }
export function onEnable(ctx: PluginContext) { }
export function onDisable(ctx: PluginContext) { }
export function onUninstall(ctx: PluginContext) { }
```

### Manifest Schema

See [manifest.ts](../packages/plugin/src/manifest.ts) for full schema.

---

## @wordrhyme/core

Core API client for plugins to call Core APIs.

```typescript
import { createClient } from '@wordrhyme/core';

const client = createClient(ctx);
const menus = await client.menu.list.query({ target: 'admin' });
```

---

## Core tRPC API

### Plugin Router (`/trpc/plugin.*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `plugin.list` | Query | List all plugins |
| `plugin.get` | Query | Get plugin by ID |
| `plugin.enable` | Mutation | Enable a plugin |
| `plugin.disable` | Mutation | Disable a plugin |
| `plugin.install` | Mutation | Install a plugin |
| `plugin.uninstall` | Mutation | Uninstall a plugin |

### Menu Router (`/trpc/menu.*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `menu.list` | Query | List menus by target |
| `menu.tree` | Query | Get menu tree |

### Health Check

```bash
curl http://localhost:3000/health
```
