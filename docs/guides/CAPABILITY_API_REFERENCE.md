# Capability API 参考

> 插件能力接口完整参考文档

## 概述

Capability 是插件与 Core 系统交互的唯一接口。每个能力都经过精心设计，确保插件安全、隔离地访问系统资源。

## 能力注入顺序

```
Logger → Permission → Data → Settings → Metrics → Trace → Hook → Notification
```

## PluginContext

```typescript
interface PluginContext {
  pluginId: string;
  organizationId?: string;
  userId?: string;

  logger: PluginLogger;
  permissions: PluginPermissionCapability;
  db?: PluginDatabaseCapability;
  settings: PluginSettingsCapability;
  metrics?: PluginMetricsCapability;
  trace: PluginTraceCapability;
  hooks?: PluginHookCapability;
  notifications?: PluginNotificationCapability;
}
```

---

## Logger Capability

### 接口定义

```typescript
interface PluginLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}
```

### 方法说明

| 方法 | 说明 | 输出条件 |
|------|------|----------|
| `info` | 一般信息 | 始终输出 |
| `warn` | 警告信息 | 始终输出 |
| `error` | 错误信息 | 始终输出 |
| `debug` | 调试信息 | 仅当租户启用调试时 |

### 使用示例

```typescript
ctx.logger.info('Processing started', {
  itemId: '123',
  action: 'create',
});

ctx.logger.error('Processing failed', {
  error: err.message,
  stack: err.stack,
  itemId: '123',
});
```

### 日志格式

```json
{
  "level": "info",
  "message": "Processing started",
  "pluginId": "com.example.my-plugin",
  "organizationId": "org-123",
  "itemId": "123",
  "action": "create",
  "timestamp": "2025-01-30T12:00:00.000Z"
}
```

---

## Permission Capability

### 接口定义

```typescript
interface PluginPermissionCapability {
  check(permission: string): Promise<boolean>;
  checkAll(permissions: string[]): Promise<boolean>;
  checkAny(permissions: string[]): Promise<boolean>;
  require(permission: string): Promise<void>;
}
```

### 方法说明

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `check` | 检查单个权限 | `boolean` |
| `checkAll` | 检查是否拥有所有权限 | `boolean` |
| `checkAny` | 检查是否拥有任一权限 | `boolean` |
| `require` | 要求权限，无权限则抛错 | `void` 或抛出 `PermissionDeniedError` |

### 使用示例

```typescript
// 检查权限
if (await ctx.permissions.check('content:read')) {
  const content = await fetchContent();
}

// 检查多个权限
if (await ctx.permissions.checkAll(['content:read', 'content:write'])) {
  await updateContent(content);
}

// 要求权限（失败时抛错）
await ctx.permissions.require('content:delete');
await deleteContent(contentId);
```

### 权限格式

```
{resource}:{action}

示例:
- content:read
- content:write
- content:delete
- media:upload
- settings:write
```

### 错误处理

```typescript
import { PermissionDeniedError } from '@wordrhyme/plugin';

try {
  await ctx.permissions.require('admin:manage');
} catch (error) {
  if (error instanceof PermissionDeniedError) {
    ctx.logger.warn('Permission denied', { permission: error.permission });
  }
}
```

---

## Database Capability

### 接口定义

```typescript
interface PluginDatabaseCapability {
  query<T>(options: QueryOptions): Promise<T[]>;
  insert<T>(options: InsertOptions<T>): Promise<void>;
  update<T>(options: UpdateOptions<T>): Promise<void>;
  delete(options: DeleteOptions): Promise<void>;
  raw<T>(sql: string, params?: unknown[]): Promise<T>;
  transaction<T>(callback: (tx: PluginDatabaseCapability) => Promise<T>): Promise<T>;
}

interface QueryOptions {
  table: string;
  where?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

interface InsertOptions<T> {
  table: string;
  data: T | T[];
}

interface UpdateOptions<T> {
  table: string;
  where: Record<string, unknown>;
  data: Partial<T>;
}

interface DeleteOptions {
  table: string;
  where: Record<string, unknown>;
}
```

### 表名规则

```
实际表名 = plugin_{pluginId}_${shortName}

示例:
- 插件 ID: com.example.my-plugin
- 短名: items
- 实际表名: plugin_com_example_my_plugin_items
```

### 自动租户隔离

所有操作自动添加 `tenant_id` 过滤：

```typescript
// 你写的代码
await ctx.db.query({ table: 'items', where: { status: 'active' } });

// 实际执行
SELECT * FROM plugin_xxx_items WHERE tenant_id = 'org-123' AND status = 'active';
```

### 使用示例

```typescript
// 查询
const items = await ctx.db.query<Item>({
  table: 'items',
  where: { status: 'active' },
  limit: 10,
  offset: 0,
});

// 插入
await ctx.db.insert({
  table: 'items',
  data: { name: 'New Item', status: 'active' },
});

// 批量插入
await ctx.db.insert({
  table: 'items',
  data: [
    { name: 'Item 1' },
    { name: 'Item 2' },
  ],
});

// 更新
await ctx.db.update({
  table: 'items',
  where: { id: 'item-123' },
  data: { status: 'completed' },
});

// 删除
await ctx.db.delete({
  table: 'items',
  where: { id: 'item-123' },
});

// 原始 SQL（必须包含表前缀）
const result = await ctx.db.raw<{ count: number }>(
  `SELECT COUNT(*) as count FROM plugin_com_example_my_plugin_items WHERE status = 'active'`
);
```

---

## Settings Capability

### 接口定义

```typescript
interface PluginSettingsCapability {
  get<T = unknown>(key: string, defaultValue?: T): Promise<T | null>;
  set(key: string, value: unknown, options?: PluginSettingOptions): Promise<void>;
  delete(key: string, options?: { global?: boolean }): Promise<boolean>;
  list(options?: { global?: boolean; keyPrefix?: string }): Promise<PluginSettingEntry[]>;
  isFeatureEnabled(flagKey: string): Promise<boolean>;
}

interface PluginSettingOptions {
  global?: boolean;      // true = plugin_global, false = plugin_tenant
  encrypted?: boolean;   // 加密存储
  description?: string;  // 描述
}

interface PluginSettingEntry {
  key: string;
  value: unknown;
  scope: 'plugin_global' | 'plugin_tenant';
  encrypted: boolean;
  description?: string;
}
```

### 作用域解析

```
┌─────────────────────────────────────────┐
│  查询顺序 (高优先级 → 低优先级)          │
│                                          │
│  1. plugin_tenant (当前租户配置)         │
│  2. plugin_global (插件全局配置)         │
│  3. defaultValue (请求中的默认值)        │
└─────────────────────────────────────────┘
```

### 使用示例

```typescript
// 读取（级联解析）
const apiKey = await ctx.settings.get<string>('apiKey');
const theme = await ctx.settings.get('theme', 'light');

// 写入租户级设置
await ctx.settings.set('preference', 'dark', {
  description: '用户界面主题',
});

// 写入全局设置
await ctx.settings.set('version', '2.0', {
  global: true,
});

// 写入加密设置
await ctx.settings.set('apiSecret', 'sk-xxx', {
  encrypted: true,
  description: 'API 密钥',
});

// 列出设置
const allSettings = await ctx.settings.list();
const featureSettings = await ctx.settings.list({ keyPrefix: 'feature.' });

// 检查功能开关
if (await ctx.settings.isFeatureEnabled('beta-mode')) {
  // 启用 Beta 功能
}
```

---

## Metrics Capability

### 接口定义

```typescript
interface PluginMetricsCapability {
  increment(name: string, value?: number, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  timing(name: string, ms: number, tags?: Record<string, string>): void;
  histogram(name: string, value: number, tags?: Record<string, string>): void;
}
```

### 方法说明

| 方法 | 说明 | 用途 |
|------|------|------|
| `increment` | 增加计数器 | API 调用次数、事件计数 |
| `gauge` | 设置当前值 | 队列大小、连接数 |
| `timing` | 记录耗时 | API 延迟、处理时间 |
| `histogram` | 记录分布值 | 响应大小、批次大小 |

### 使用示例

```typescript
// 计数器
ctx.metrics?.increment('api.calls', 1, { endpoint: '/items' });
ctx.metrics?.increment('items.created');

// 当前值
ctx.metrics?.gauge('queue.size', 42);
ctx.metrics?.gauge('connections.active', 10);

// 耗时
const start = Date.now();
await processItem();
ctx.metrics?.timing('item.process.duration', Date.now() - start);

// 分布值
ctx.metrics?.histogram('response.size', responseBytes, { endpoint: '/items' });
```

### 指标命名规范

```
{domain}.{entity}.{metric}

示例:
- api.calls
- api.latency
- items.created
- items.processing.duration
- queue.size
- errors.count
```

---

## Trace Capability

### 接口定义

```typescript
interface PluginTraceCapability {
  startSpan(name: string, options?: SpanOptions): Span;
  getActiveSpan(): Span | undefined;
  injectContext(carrier: Record<string, string>): void;
  extractContext(carrier: Record<string, string>): void;
}

interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  recordException(error: Error): void;
  setStatus(status: 'ok' | 'error', message?: string): void;
  end(): void;
}

interface SpanOptions {
  kind?: 'internal' | 'client' | 'server';
  attributes?: Record<string, unknown>;
}
```

### 使用示例

```typescript
// 创建追踪 Span
const span = ctx.trace.startSpan('process-item', {
  kind: 'internal',
  attributes: { 'item.id': itemId },
});

try {
  // 添加属性
  span.setAttribute('item.type', 'article');

  // 添加事件
  span.addEvent('validation.started');

  await validateItem(item);

  span.addEvent('validation.completed');

  // 处理成功
  span.setStatus('ok');
} catch (error) {
  // 记录异常
  span.recordException(error);
  span.setStatus('error', error.message);
  throw error;
} finally {
  // 必须结束 Span
  span.end();
}
```

### 分布式追踪

```typescript
// 调用外部服务时注入上下文
const headers: Record<string, string> = {};
ctx.trace.injectContext(headers);

await fetch('https://external-api.com/process', {
  headers,
  body: JSON.stringify(data),
});
```

---

## Hook Capability

### 接口定义

```typescript
interface PluginHookCapability {
  addAction<T>(
    hookId: string,
    handler: (data: T, ctx: PluginContext) => void | Promise<void>,
    options?: HookHandlerOptions
  ): () => void;

  addFilter<T>(
    hookId: string,
    handler: (data: T, ctx: PluginContext) => T | Promise<T>,
    options?: HookHandlerOptions
  ): () => void;

  listHooks(): Promise<Array<{
    id: string;
    type: 'action' | 'filter';
    description: string;
  }>>;
}

interface HookHandlerOptions {
  priority?: number;  // 0-100, 默认 50
  timeout?: number;   // 毫秒, 默认 5000
}
```

### 使用示例

详见 [Hook 使用指南](./HOOK_USAGE.md)

---

## Notification Capability

### 接口定义

```typescript
interface PluginNotificationCapability {
  send(params: PluginNotificationSendParams): Promise<PluginNotificationSendResult>;
  registerTemplate(template: PluginNotificationTemplate): Promise<void>;
  registerChannel(channel: PluginNotificationChannel): Promise<void>;
  onNotificationCreated(
    handler: (event: PluginNotificationEvent) => void | Promise<void>
  ): () => void;
}

interface PluginNotificationSendParams {
  type: string;              // 必须在 manifest 中声明
  userId: string;
  target: {
    type: string;
    id: string;
    url: string;
  };
  actor?: {
    id: string;
    name?: string;
    avatar?: string;
  };
  data?: Record<string, unknown>;
  locale?: string;
}

interface PluginNotificationTemplate {
  key: string;
  title: Record<string, string>;    // 多语言标题
  message: Record<string, string>;  // 多语言消息
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  category?: 'system' | 'collaboration' | 'social';
}
```

### Manifest 声明

```json
{
  "notifications": {
    "permissions": ["notification:send"],
    "types": [
      {
        "id": "item-created",
        "title": "Item Created",
        "priority": "normal"
      }
    ]
  }
}
```

### 使用示例

```typescript
// 发送通知
await ctx.notifications?.send({
  type: 'item-created',
  userId: 'user-123',
  target: {
    type: 'item',
    id: 'item-456',
    url: '/items/item-456',
  },
  actor: {
    id: ctx.userId!,
    name: 'Current User',
  },
  data: {
    itemName: 'New Item',
  },
});

// 注册模板
await ctx.notifications?.registerTemplate({
  key: 'weekly-digest',
  title: {
    'en-US': 'Weekly Digest',
    'zh-CN': '每周摘要',
  },
  message: {
    'en-US': 'You have {{count}} updates this week',
    'zh-CN': '本周有 {{count}} 条更新',
  },
  priority: 'low',
});

// 监听通知事件
const unsubscribe = ctx.notifications?.onNotificationCreated(async (event) => {
  console.log(`Notification ${event.notification.id} created for ${event.user.id}`);
});
```

---

## 可用性矩阵

| Capability | 需要 Manifest 声明 | 需要 organizationId | 说明 |
|------------|-------------------|---------------------|------|
| Logger | ❌ | ❌ | 始终可用 |
| Permission | ❌ | ❌ | 始终可用 |
| Database | ✅ `capabilities.data` | ✅ | 需要声明和租户上下文 |
| Settings | ❌ | ❌ | 始终可用（无租户时使用全局） |
| Metrics | ❌ | ✅ | 需要租户上下文 |
| Trace | ❌ | ❌ | 始终可用 |
| Hook | ✅ `capabilities.hooks` | ❌ | 需要声明 |
| Notification | ✅ `notifications` | ✅ | 需要声明和租户上下文 |

---

## 错误类型

```typescript
// 权限拒绝
class PermissionDeniedError extends Error {
  permission: string;
}

// Hook 中止
class HookAbortError extends Error {}

// Hook 超时
class HookTimeoutError extends Error {}

// 通知验证错误
class PluginNotificationValidationError extends Error {
  pluginId: string;
  notificationType: string;
}
```

