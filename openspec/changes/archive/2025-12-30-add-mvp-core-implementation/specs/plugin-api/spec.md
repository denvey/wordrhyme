# Plugin API Specification

## ADDED Requirements

### Requirement: Plugin API Package

A separate npm package `@wordrhyme/plugin-api` SHALL be created. This package MUST export TypeScript types and runtime helpers for plugin authors. Plugins SHALL only import from `@wordrhyme/plugin-api`, never from `@wordrhyme/core`.

#### Scenario: Plugin imports API package
- **WHEN** a plugin imports `import { definePlugin } from '@wordrhyme/plugin-api'`
- **THEN** the import succeeds
- **AND** TypeScript types are available
- **AND** the plugin can use runtime helpers

---

### Requirement: Capability Interface

The Plugin API SHALL define interfaces for all capabilities: Logger, Permission, Data, Hook (future). Each capability interface MUST be fully documented with TSDoc.

#### Scenario: Logger Capability interface
- **WHEN** a plugin accesses `ctx.logger`
- **THEN** the logger conforms to the `LoggerCapability` interface
- **AND** methods include: `info()`, `warn()`, `error()`, `debug()`

#### Scenario: Permission Capability interface
- **WHEN** a plugin accesses `ctx.permissions`
- **THEN** the permissions conform to the `PermissionCapability` interface
- **AND** method `can(user, capability, scope)` is available

---

### Requirement: Plugin Context Type

The Plugin API SHALL export a `PluginContext` type that includes all available capabilities. Lifecycle hooks SHALL receive this context as their first parameter.

#### Scenario: Lifecycle hook receives context
- **WHEN** a plugin's `onEnable(ctx)` hook is called
- **THEN** `ctx` conforms to the `PluginContext` type
- **AND** `ctx.logger` is available
- **AND** `ctx.permissions` is available (permission adjudication is always available)
- **AND** `ctx.data` is available (only if declared in `manifest.json`)

---

### Requirement: Plugin Manifest Schema

The Plugin API SHALL export a TypeScript type for `manifest.json`. The schema MUST match the validation rules in `PLUGIN_CONTRACT.md`. A Zod schema SHALL be provided for runtime validation.

#### Scenario: Manifest type validates structure
- **WHEN** a plugin author writes a manifest using the `PluginManifest` type
- **THEN** TypeScript validates required fields: `pluginId`, `version`, `vendor`, `type`, `runtime`, `engines.wordrhyme`
- **AND** optional fields are typed correctly: `capabilities`, `server`, `admin`, `permissions`

#### Scenario: Zod schema validates at runtime
- **WHEN** a `manifest.json` file is parsed
- **THEN** the Zod schema validates the structure
- **AND** type errors are caught with descriptive messages
- **AND** the inferred TypeScript type matches the exported type

---

## Implementation Details

### File Structure

```
packages/plugin/src/
├── index.ts           # 主入口
├── manifest.schema.ts # 权威 Manifest Schema
├── context.ts         # PluginContext 接口
└── trpc.ts            # tRPC 工具函数
```

### PluginManifest Schema (权威定义)

```typescript
// packages/plugin/src/manifest.schema.ts
import { z } from 'zod';

const serverConfigSchema = z.object({
  entry: z.string(),
  router: z.boolean().default(true),
  hooks: z.array(z.enum(['onInstall', 'onEnable', 'onDisable', 'onUninstall'])).optional(),
});

const adminConfigSchema = z.object({
  remoteEntry: z.string(),
  exposes: z.record(z.string()).optional(),
});

const webConfigSchema = z.object({
  remoteEntry: z.string(),
  routes: z.array(z.object({
    path: z.string(),
    component: z.string(),
  })).optional(),
});

const capabilitiesSchema = z.object({
  ui: z.object({
    adminPage: z.boolean().optional(),
    webPage: z.boolean().optional(),
  }).optional(),
  data: z.object({
    read: z.boolean().optional(),
    write: z.boolean().optional(),
  }).optional(),
});

const permissionsSchema = z.object({
  scope: z.enum(['instance', 'organization', 'space', 'project']),
  definitions: z.array(z.object({
    key: z.string().min(1),
    description: z.string().min(1),
  })),
});

export const pluginManifestSchema = z.object({
  pluginId: z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string().min(1),
  vendor: z.string().min(1),
  engines: z.object({
    wordrhyme: z.string(),
    node: z.string().optional(),
  }),
  server: serverConfigSchema.optional(),
  admin: adminConfigSchema.optional(),
  web: webConfigSchema.optional(),
  capabilities: capabilitiesSchema,
  permissions: permissionsSchema.optional(),
  dependencies: z.array(z.string()).optional(),
  peerDependencies: z.record(z.string()).optional(),
  compatibilityMode: z.enum(['strict', 'lenient']).default('lenient'),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export function validateManifest(data: unknown): PluginManifest {
  return pluginManifestSchema.parse(data);
}
```

### PluginContext Interface

```typescript
// packages/plugin/src/context.ts
export interface PluginContext {
  readonly pluginId: string;
  readonly tenantId: string;
  readonly userId: string | null;
  readonly logger: PluginLogger;
  readonly permissions: PermissionCapability;
  readonly db: ScopedDb;  // Scoped Drizzle with auto tenant filtering
  readonly config: PluginConfigCapability;
}

export interface PluginLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface PermissionCapability {
  can(capability: string): Promise<boolean>;
  require(capability: string): Promise<void>;
}

/**
 * Scoped Drizzle Database Capability
 * 
 * 提供完整的 Drizzle ORM 体验，自动注入 tenantId 过滤。
 * 
 * @example
 * ```typescript
 * // SELECT - 自动过滤当前租户
 * const events = await ctx.db.select().from(analyticsEvents);
 * 
 * // INSERT - 自动注入 tenantId
 * await ctx.db.insert(analyticsEvents).values({ event: 'click', page: '/home' });
 * 
 * // UPDATE - 自动添加 tenantId 条件
 * await ctx.db.update(analyticsEvents).set({ event: 'tap' }).where(eq(analyticsEvents.id, id));
 * 
 * // DELETE - 自动添加 tenantId 条件
 * await ctx.db.delete(analyticsEvents).where(eq(analyticsEvents.id, id));
 * ```
 */
export interface ScopedDb {
  /** SELECT - 自动添加 tenant_id = currentTenant 过滤 */
  select: <T extends Record<string, any>>(fields?: T) => {
    from: <TTable>(table: TTable) => DrizzleSelectQuery<TTable>;
  };

  /** INSERT - 自动注入 tenantId 到数据 */
  insert: <TTable>(table: TTable) => {
    values: <TData>(data: TData | TData[]) => DrizzleInsertQuery;
  };

  /** UPDATE - 自动添加 tenant_id 条件 */
  update: <TTable>(table: TTable) => {
    set: <TData>(data: TData) => {
      where: (condition: SQL) => DrizzleUpdateQuery;
    };
  };

  /** DELETE - 自动添加 tenant_id 条件 */
  delete: <TTable>(table: TTable) => {
    where: (condition: SQL) => DrizzleDeleteQuery;
  };

  /** 事务支持 */
  transaction: <T>(fn: (tx: ScopedDb) => Promise<T>) => Promise<T>;

  /** 原始 Drizzle 访问 (需谨慎，不自动过滤) */
  $raw: DrizzleDatabase;
}

// Type aliases for Drizzle query types
type DrizzleSelectQuery<T> = Promise<T[]>;
type DrizzleInsertQuery = Promise<void>;
type DrizzleUpdateQuery = Promise<void>;
type DrizzleDeleteQuery = Promise<void>;
type DrizzleDatabase = any;
type SQL = any;

export interface PluginConfigCapability {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
}

export type LifecycleHook = (ctx: PluginContext) => Promise<void>;

export interface PluginLifecycleHooks {
  onInstall?: LifecycleHook;
  onEnable?: LifecycleHook;
  onDisable?: LifecycleHook;
  onUninstall?: LifecycleHook;
}
```

### Manifest 示例

```json
{
  "pluginId": "com.example.analytics",
  "version": "1.0.0",
  "name": "Analytics Plugin",
  "vendor": "Example Inc",
  "engines": { "wordrhyme": "^0.1.0" },
  "server": { "entry": "./dist/server/index.js" },
  "admin": { "remoteEntry": "./dist/admin/remoteEntry.js" },
  "capabilities": { "ui": { "adminPage": true }, "data": { "read": true } }
}
```

