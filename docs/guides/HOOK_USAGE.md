# Hook 使用指南

> WordRhyme Hook 系统开发指南

## 概述

Hook 系统是 WordRhyme 的核心扩展机制，允许插件在特定执行点介入 Core 流程。本指南遵循 `EVENT_HOOK_GOVERNANCE.md` (Frozen v1) 规范。

## 核心概念

### Hook 类型

| 类型 | 说明 | 返回值 | 用途 |
|------|------|--------|------|
| **Action** | 副作用钩子 | 无（void） | 日志、通知、同步外部系统 |
| **Filter** | 转换钩子 | 修改后的数据 | 数据验证、转换、增强 |

### 执行模型

```
┌─────────────────────────────────────────────────────────┐
│                    Core Operation                        │
│                                                          │
│  beforeCreate ──▶ [Filter Handlers] ──▶ Create Record   │
│                                              │           │
│                                              ▼           │
│                                        afterCreate       │
│                                              │           │
│                                              ▼           │
│                                    [Action Handlers]     │
└─────────────────────────────────────────────────────────┘
```

### 优先级

```typescript
enum HookPriority {
  EARLIEST = 0,    // 系统保留，插件不应使用
  EARLY = 25,      // 需要早期执行的插件
  NORMAL = 50,     // 默认优先级
  LATE = 75,       // 需要晚期执行的插件
  LATEST = 100,    // 最后执行（如日志记录）
}
```

---

## 注册 Hook

### 通过 Manifest

```json
// plugin.json
{
  "hooks": [
    {
      "hookId": "content.beforeCreate",
      "handler": "src/hooks.ts#onBeforeCreate",
      "priority": 50,
      "timeout": 5000
    },
    {
      "hookId": "content.afterCreate",
      "handler": "src/hooks.ts#onAfterCreate",
      "priority": 75
    }
  ]
}
```

### 通过 Capability API

```typescript
// src/index.ts
async function onEnable(ctx: PluginContext) {
  // 注册 Action Hook
  const unsubscribeAction = ctx.hooks.addAction(
    'content.afterCreate',
    async (content, hookCtx) => {
      ctx.logger.info(`Content created: ${content.id}`);
      await notifyExternalSystem(content);
    },
    { priority: HookPriority.LATE }
  );

  // 注册 Filter Hook
  const unsubscribeFilter = ctx.hooks.addFilter(
    'content.beforeCreate',
    async (content, hookCtx) => {
      // 添加自动生成的字段
      return {
        ...content,
        slug: generateSlug(content.title),
        readingTime: calculateReadingTime(content.body),
      };
    },
    { priority: HookPriority.NORMAL, timeout: 3000 }
  );

  // 保存取消订阅函数以便清理
  return [unsubscribeAction, unsubscribeFilter];
}
```

---

## 可用 Hook 列表

### 内容 Hooks

| Hook ID | 类型 | 说明 |
|---------|------|------|
| `content.beforeCreate` | Filter | 内容创建前，可修改内容 |
| `content.afterCreate` | Action | 内容创建后 |
| `content.beforeUpdate` | Filter | 内容更新前，可修改内容 |
| `content.afterUpdate` | Action | 内容更新后 |
| `content.beforeDelete` | Filter | 内容删除前，可阻止删除 |
| `content.afterDelete` | Action | 内容删除后 |
| `content.beforePublish` | Filter | 发布前验证 |
| `content.afterPublish` | Action | 发布后通知 |

### 用户 Hooks

| Hook ID | 类型 | 说明 |
|---------|------|------|
| `user.afterCreate` | Action | 用户创建后 |
| `user.afterLogin` | Action | 用户登录后 |
| `user.beforeDelete` | Filter | 用户删除前 |

### 媒体 Hooks

| Hook ID | 类型 | 说明 |
|---------|------|------|
| `media.beforeUpload` | Filter | 上传前验证/转换 |
| `media.afterUpload` | Action | 上传后处理 |
| `media.beforeDelete` | Filter | 删除前检查 |

### 查询 Hook ID 列表

```typescript
// 获取所有可用 Hook
const hooks = await ctx.hooks.listHooks();

hooks.forEach(hook => {
  console.log(`${hook.id} (${hook.type}): ${hook.description}`);
});
```

---

## Handler 实现

### Action Handler

```typescript
// Action 不返回值，用于副作用
async function onContentCreated(
  content: ContentData,
  ctx: HookContext
): Promise<void> {
  // 记录日志
  console.log(`[${ctx.traceId}] Content ${content.id} created`);

  // 发送通知
  await sendSlackNotification({
    channel: '#content',
    message: `New content: ${content.title}`,
  });

  // 同步到外部系统
  await syncToExternalCMS(content);
}
```

### Filter Handler

```typescript
// Filter 必须返回（修改后的）数据
async function onBeforeCreate(
  content: ContentData,
  ctx: HookContext
): Promise<ContentData> {
  // 验证
  if (!content.title) {
    throw new HookAbortError('Title is required');
  }

  // 转换/增强
  return {
    ...content,
    slug: content.slug || generateSlug(content.title),
    metadata: {
      ...content.metadata,
      pluginProcessed: true,
      processedAt: new Date().toISOString(),
    },
  };
}
```

### 阻止操作

```typescript
import { HookAbortError } from '@wordrhyme/plugin';

async function onBeforeDelete(
  content: ContentData,
  ctx: HookContext
): Promise<ContentData> {
  // 检查是否可以删除
  const hasReferences = await checkExternalReferences(content.id);

  if (hasReferences) {
    // 抛出 HookAbortError 会阻止删除操作
    throw new HookAbortError(
      `Cannot delete: content is referenced by external systems`
    );
  }

  return content;
}
```

---

## Hook 上下文

```typescript
interface HookContext {
  hookId: string;          // 当前 Hook ID
  traceId: string;         // 追踪 ID（用于日志关联）
  pluginId: string;        // 插件 ID
  organizationId: string;  // 租户 ID
  userId?: string;         // 当前用户 ID
}
```

### 使用上下文

```typescript
async function handler(data: ContentData, ctx: HookContext) {
  // 添加追踪信息到日志
  logger.info('Processing content', {
    traceId: ctx.traceId,
    contentId: data.id,
    organizationId: ctx.organizationId,
  });

  // 基于租户的逻辑
  const tenantConfig = await getConfigForTenant(ctx.organizationId);

  // 基于用户的逻辑
  if (ctx.userId) {
    await recordUserAction(ctx.userId, 'content.create');
  }
}
```

---

## 错误处理

### Handler 错误

```typescript
async function safeHandler(data: ContentData, ctx: HookContext) {
  try {
    await riskyOperation(data);
  } catch (error) {
    // 记录错误但不传播
    logger.error('Handler failed', {
      error: error.message,
      hookId: ctx.hookId,
      traceId: ctx.traceId,
    });

    // Action: 返回 void（错误被吞掉）
    // Filter: 返回原始数据（不做修改）
    return data;
  }
}
```

### 错误类型

| 错误类型 | 行为 |
|----------|------|
| `HookAbortError` | 阻止 Core 操作，返回错误给用户 |
| `HookTimeoutError` | Handler 超时，跳过并继续 |
| `HookValidationError` | 配置错误，禁用该 Handler |
| 其他错误 | 记录并继续执行 |

---

## 熔断器机制

Hook 系统内置熔断器保护：

```typescript
interface CircuitBreakerConfig {
  threshold: number;    // 连续失败阈值（默认 5）
  cooldownMs: number;   // 冷却时间（默认 5 分钟）
}
```

### 状态转换

```
     成功
       │
       ▼
┌─────────────┐     连续失败 > threshold     ┌─────────────┐
│   Closed    │ ──────────────────────────▶ │    Open     │
│  (正常运行)  │                             │  (熔断状态)  │
└─────────────┘                             └─────────────┘
       ▲                                          │
       │              cooldown 后                  │
       │         ┌─────────────┐                  │
       └──────── │  Half-Open  │ ◀────────────────┘
          成功   │  (测试状态)  │
                 └─────────────┘
```

### 监控熔断状态

```typescript
// 通过 Admin API 查看
const hookStats = await trpc.hooks.getStats.query();

hookStats.handlers.forEach(handler => {
  if (handler.circuitBreaker.state === 'open') {
    console.warn(`Handler ${handler.id} is in open state`);
  }
});
```

---

## 超时配置

```typescript
// 在 Manifest 中配置
{
  "hookId": "content.beforeCreate",
  "handler": "src/hooks.ts#onBeforeCreate",
  "timeout": 3000  // 3 秒超时
}

// 或在代码中配置
ctx.hooks.addFilter('content.beforeCreate', handler, {
  timeout: 3000,
});
```

### 超时最佳实践

| 操作类型 | 建议超时 |
|----------|----------|
| 内存计算 | 100-500ms |
| 数据库查询 | 1-3s |
| 外部 API 调用 | 5-10s |
| 文件处理 | 10-30s |

---

## 执行顺序

### 同一 Hook 的多个 Handler

```
Handler A (priority: 25) ─▶ Handler B (priority: 50) ─▶ Handler C (priority: 75)
         │                          │                          │
         ▼                          ▼                          ▼
      Filter                     Filter                     Filter
    (修改数据)                   (修改数据)                   (修改数据)
         │                          │                          │
         └──────────── 数据管道 ────┴──────────────────────────┘
```

### 多租户隔离

```typescript
// Handler 只会被相同 organizationId 的请求触发
ctx.hooks.addAction('content.afterCreate', handler);
// organizationId 自动从 PluginContext 继承
```

---

## 最佳实践

### 1. 保持 Handler 轻量

```typescript
// ❌ 不要在 Hook 中做重型工作
async function badHandler(data, ctx) {
  await heavyProcessing(data);  // 阻塞 Core
}

// ✅ 使用异步任务
async function goodHandler(data, ctx) {
  await queueService.enqueue('heavy-task', { dataId: data.id });
}
```

### 2. 幂等设计

```typescript
async function idempotentHandler(data, ctx) {
  // 使用唯一键避免重复处理
  const processed = await checkAlreadyProcessed(data.id);
  if (processed) return data;

  await processData(data);
  await markAsProcessed(data.id);
  return data;
}
```

### 3. 优雅降级

```typescript
async function resilientHandler(data, ctx) {
  try {
    const enhanced = await externalService.enhance(data);
    return enhanced;
  } catch (error) {
    // 外部服务失败时返回原始数据
    logger.warn('External service unavailable, using original data');
    return data;
  }
}
```

### 4. 适当的优先级

```typescript
// 验证类 Hook 用 EARLY
ctx.hooks.addFilter('content.beforeCreate', validateContent, {
  priority: HookPriority.EARLY,
});

// 增强类 Hook 用 NORMAL
ctx.hooks.addFilter('content.beforeCreate', enrichContent, {
  priority: HookPriority.NORMAL,
});

// 日志类 Hook 用 LATE/LATEST
ctx.hooks.addAction('content.afterCreate', logContent, {
  priority: HookPriority.LATEST,
});
```

### 5. 清理资源

```typescript
const unsubscribeFunctions: Array<() => void> = [];

function onEnable(ctx: PluginContext) {
  unsubscribeFunctions.push(
    ctx.hooks.addAction('content.afterCreate', handler1),
    ctx.hooks.addFilter('content.beforeCreate', handler2),
  );
}

function onDisable(ctx: PluginContext) {
  // 必须清理所有注册的 Handler
  unsubscribeFunctions.forEach(unsub => unsub());
  unsubscribeFunctions.length = 0;
}
```

---

## 调试

### 启用 Hook 追踪

```typescript
// 在设置中启用
await ctx.settings.set('debug.hooks', true);
```

### 查看执行日志

```bash
# Hook 执行日志格式
[HOOK] content.beforeCreate | plugin:com.example.my-plugin | 45ms | success
[HOOK] content.beforeCreate | plugin:com.other.plugin | timeout | 5001ms
```

### 监控面板

通过 Admin API 查看 Hook 统计：

```typescript
const stats = await trpc.hooks.getStats.query();
// 返回每个 Handler 的调用次数、错误率、平均耗时等
```

