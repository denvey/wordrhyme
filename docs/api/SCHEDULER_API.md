# Scheduler API

> 定时任务调度系统 API 文档

## 概述

Scheduler API 提供 Cron 表达式驱动的定时任务管理，支持多种执行处理器（队列任务、Webhook、插件回调）、分布式锁和执行历史记录。

## 基础信息

- **路由前缀**: `trpc.scheduler.*`
- **认证**: 需要登录（protectedProcedure）
- **多租户**: 任务自动绑定到当前租户

---

## API 端点

### scheduler.create

创建定时任务

```typescript
// 请求
{
  name: string;              // 任务名称（1-100 字符）
  description?: string;      // 任务描述
  cronExpression: string;    // Cron 表达式
  timezone?: string;         // 时区，默认 "UTC"
  handlerType: 'queue-job' | 'webhook' | 'plugin-callback';  // 处理器类型
  handlerConfig: {
    // queue-job 类型
    queueName?: string;      // 队列名称
    jobName?: string;        // 任务名称

    // webhook 类型
    url?: string;            // Webhook URL

    // plugin-callback 类型
    pluginId?: string;       // 插件 ID
    methodName?: string;     // 方法名称
  };
  payload?: Record<string, unknown>;  // 执行负载
  maxRetries?: number;       // 最大重试次数，0-10，默认 3
}

// 响应
{
  id: string;                // 任务 ID
  name: string;
  description: string | null;
  cronExpression: string;
  timezone: string;
  handlerType: string;
  handlerConfig: object;
  payload: object | null;
  maxRetries: number;
  enabled: boolean;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

**示例**:
```typescript
// 创建每小时执行的队列任务
const task = await trpc.scheduler.create.mutate({
  name: '数据同步任务',
  description: '每小时同步外部数据',
  cronExpression: '0 * * * *',  // 每小时整点
  timezone: 'Asia/Shanghai',
  handlerType: 'queue-job',
  handlerConfig: {
    queueName: 'sync',
    jobName: 'sync-external-data',
  },
  payload: {
    source: 'external-api',
  },
  maxRetries: 3,
});

console.log(`任务创建成功: ${task.id}`);
console.log(`下次执行: ${task.nextRunAt}`);
```

---

### scheduler.list

列出定时任务

```typescript
// 请求
{
  enabled?: boolean;         // 按启用状态过滤
  limit?: number;            // 每页数量，默认 20，最大 100
  offset?: number;           // 偏移量，默认 0
}

// 响应
{
  tasks: Array<{
    id: string;
    name: string;
    description: string | null;
    cronExpression: string;
    timezone: string;
    handlerType: string;
    enabled: boolean;
    nextRunAt: Date | null;
    lastRunAt: Date | null;
    createdAt: Date;
  }>;
  total: number;
}
```

**示例**:
```typescript
// 列出所有启用的任务
const result = await trpc.scheduler.list.query({
  enabled: true,
  limit: 50,
});

result.tasks.forEach(task => {
  console.log(`${task.name}: ${task.cronExpression}`);
  console.log(`  下次执行: ${task.nextRunAt}`);
});
```

---

### scheduler.get

获取单个任务详情

```typescript
// 请求
{
  id: string;
}

// 响应
{
  id: string;
  name: string;
  description: string | null;
  cronExpression: string;
  timezone: string;
  handlerType: string;
  handlerConfig: object;
  payload: object | null;
  maxRetries: number;
  enabled: boolean;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastRunStatus: 'success' | 'failed' | null;
  createdAt: Date;
  updatedAt: Date;
}
```

---

### scheduler.toggle

启用/禁用任务

```typescript
// 请求
{
  id: string;
  enabled: boolean;
}

// 响应
{
  id: string;
  enabled: boolean;
  nextRunAt: Date | null;    // 启用时更新下次执行时间
}
```

**示例**:
```typescript
// 禁用任务
await trpc.scheduler.toggle.mutate({
  id: 'task-123',
  enabled: false,
});

// 启用任务
await trpc.scheduler.toggle.mutate({
  id: 'task-123',
  enabled: true,
});
```

---

### scheduler.delete

删除定时任务

```typescript
// 请求
{
  id: string;
}

// 响应
{
  success: true;
}
```

---

### scheduler.runNow

立即执行任务

> 触发任务立即执行，不影响原有调度。

```typescript
// 请求
{
  id: string;
}

// 响应
{
  executionId: string;       // 执行记录 ID
  status: 'triggered';
}
```

**示例**:
```typescript
const result = await trpc.scheduler.runNow.mutate({
  id: 'task-123',
});

console.log(`任务已触发，执行 ID: ${result.executionId}`);
```

---

### scheduler.history

获取执行历史

```typescript
// 请求
{
  taskId: string;
  limit?: number;            // 每页数量，默认 20，最大 100
  offset?: number;           // 偏移量，默认 0
}

// 响应
{
  executions: Array<{
    id: string;
    taskId: string;
    status: 'pending' | 'running' | 'success' | 'failed';
    startedAt: Date;
    completedAt: Date | null;
    duration: number | null;  // 毫秒
    error: string | null;
    result: object | null;
  }>;
  total: number;
}
```

**示例**:
```typescript
const history = await trpc.scheduler.history.query({
  taskId: 'task-123',
  limit: 10,
});

history.executions.forEach(exec => {
  const duration = exec.duration ? `${exec.duration}ms` : 'N/A';
  console.log(`${exec.startedAt}: ${exec.status} (${duration})`);
  if (exec.error) {
    console.log(`  错误: ${exec.error}`);
  }
});
```

---

### scheduler.listProviders

列出可用的调度提供者

```typescript
// 请求
// 无参数

// 响应
Array<{
  id: string;                // 提供者 ID
  name: string;              // 提供者名称
  version: string;           // 版本
  capabilities: string[];    // 支持的能力
}>
```

**示例**:
```typescript
const providers = await trpc.scheduler.listProviders.query();

providers.forEach(p => {
  console.log(`${p.name} (${p.id})`);
  console.log(`  版本: ${p.version}`);
  console.log(`  能力: ${p.capabilities.join(', ')}`);
});
```

---

### scheduler.getActiveProvider

获取当前活动的调度提供者

```typescript
// 请求
// 无参数

// 响应
{
  id: string;
  name: string;
  version: string;
  capabilities: string[];
  healthy: boolean;          // 健康状态
  latency: number;           // 延迟（毫秒）
}
```

---

### scheduler.switchProvider

切换调度提供者

```typescript
// 请求
{
  providerId: string;
}

// 响应
{
  success: true;
}
```

---

## Cron 表达式

### 格式

```
┌───────────── 分钟 (0 - 59)
│ ┌───────────── 小时 (0 - 23)
│ │ ┌───────────── 日 (1 - 31)
│ │ │ ┌───────────── 月 (1 - 12)
│ │ │ │ ┌───────────── 星期 (0 - 7, 0 和 7 都是周日)
│ │ │ │ │
* * * * *
```

### 常用示例

| 表达式 | 说明 |
|--------|------|
| `* * * * *` | 每分钟 |
| `0 * * * *` | 每小时整点 |
| `0 0 * * *` | 每天午夜 |
| `0 0 * * 0` | 每周日午夜 |
| `0 0 1 * *` | 每月 1 日午夜 |
| `*/5 * * * *` | 每 5 分钟 |
| `0 9-17 * * 1-5` | 工作日 9:00-17:00 每小时 |

---

## 处理器类型

### 1. queue-job

将任务推送到 BullMQ 队列。

```typescript
handlerType: 'queue-job',
handlerConfig: {
  queueName: 'email',       // 队列名称
  jobName: 'send-digest',   // 任务名称
},
payload: {
  templateId: 'weekly-digest',
}
```

### 2. webhook

调用外部 Webhook URL。

```typescript
handlerType: 'webhook',
handlerConfig: {
  url: 'https://api.example.com/cron/trigger',
},
payload: {
  action: 'sync',
}
```

### 3. plugin-callback

调用插件注册的回调方法。

```typescript
handlerType: 'plugin-callback',
handlerConfig: {
  pluginId: 'com.example.analytics',
  methodName: 'generateReport',
},
payload: {
  reportType: 'weekly',
}
```

---

## 分布式锁

调度器使用分布式锁确保在多节点部署时任务只执行一次：

- 每次执行前获取锁
- 锁自动过期防止死锁
- 锁命名格式：`scheduler:lock:{taskId}`

---

## 错误处理

| 错误码 | 说明 |
|--------|------|
| `FORBIDDEN` | 缺少租户上下文 |
| `NOT_FOUND` | 任务不存在 |
| `BAD_REQUEST` | 无效的 Cron 表达式或配置 |
| `INTERNAL_SERVER_ERROR` | 调度服务错误 |

---

## 最佳实践

1. **时区设置**: 明确指定时区，避免使用服务器默认时区
2. **幂等设计**: 处理器应设计为幂等，支持重试
3. **监控历史**: 定期检查执行历史，关注失败任务
4. **合理重试**: 根据任务特性设置 `maxRetries`
5. **避免高频**: 避免创建过于频繁的任务（如每秒执行）
6. **错误告警**: 结合通知系统处理执行失败

