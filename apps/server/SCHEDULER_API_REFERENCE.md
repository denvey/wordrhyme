# Scheduler API 端点映射

## 实际 tRPC 端点（代码实现）

| 功能 | 端点名称 | 类型 | 说明 |
|------|---------|------|------|
| 创建任务 | `scheduler.create` | mutation | ✅ |
| 列出任务 | `scheduler.list` | query | ✅ |
| 获取任务 | `scheduler.get` | query | ✅ |
| 启用/禁用 | `scheduler.toggle` | mutation | ✅ |
| 删除任务 | `scheduler.delete` | mutation | ✅ |
| 立即执行 | `scheduler.runNow` | mutation | ✅ |
| 执行历史 | `scheduler.history` | query | ✅ |
| 列出 Providers | `scheduler.listProviders` | query | ✅ |
| 当前 Provider | `scheduler.getActiveProvider` | query | ✅ |
| 切换 Provider | `scheduler.switchProvider` | mutation | ✅ |

## API 调用示例（实际端点）

### 1. 创建任务
```typescript
await trpc.scheduler.create.mutate({
  name: '每日数据同步',
  description: '同步用户数据',
  cronExpression: '0 2 * * *',
  timezone: 'Asia/Shanghai',
  handlerType: 'queue-job',
  handlerConfig: {
    queueName: 'data-sync',
    jobName: 'sync-users'
  },
  payload: { source: 'production' },
  maxRetries: 3
});
```

### 2. 列出任务
```typescript
await trpc.scheduler.list.query({
  enabled: true,  // 可选：仅启用的任务
  limit: 20,
  offset: 0
});
```

### 3. 获取单个任务
```typescript
await trpc.scheduler.get.query({
  id: 'task-id'
});
```

### 4. 启用/禁用任务
```typescript
// 启用
await trpc.scheduler.toggle.mutate({
  id: 'task-id',
  enabled: true
});

// 禁用
await trpc.scheduler.toggle.mutate({
  id: 'task-id',
  enabled: false
});
```

### 5. 删除任务
```typescript
await trpc.scheduler.delete.mutate({
  id: 'task-id'
});
```

### 6. 立即执行任务
```typescript
await trpc.scheduler.runNow.mutate({
  id: 'task-id'
});
```

### 7. 查询执行历史
```typescript
await trpc.scheduler.history.query({
  taskId: 'task-id',
  limit: 20,
  offset: 0
});
```

### 8. 列出所有 Providers
```typescript
const providers = await trpc.scheduler.listProviders.query();
// 返回: [{ id, name, version, capabilities }]
```

### 9. 获取当前 Provider
```typescript
const provider = await trpc.scheduler.getActiveProvider.query();
// 返回: { id, name, version, capabilities, healthy, latency }
```

### 10. 切换 Provider
```typescript
await trpc.scheduler.switchProvider.mutate({
  providerId: 'com.example.temporal-scheduler'
});
```

## 端点权限

所有端点都使用 `protectedProcedure`，需要：
- ✅ 用户已登录（`ctx.userId`）
- ✅ 租户上下文（`ctx.tenantId`）（部分端点）

## Handler 类型

```typescript
type HandlerType = 'queue-job' | 'webhook' | 'plugin-callback';
```

### Queue Job
```typescript
handlerConfig: {
  queueName: string;
  jobName: string;
}
```

### Webhook
```typescript
handlerConfig: {
  url: string;
}
```

### Plugin Callback
```typescript
handlerConfig: {
  pluginId: string;
  methodName: string;
}
```

## 返回类型

### ScheduledTask
```typescript
{
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  cronExpression: string;
  timezone: string;
  handlerType: 'queue-job' | 'webhook' | 'plugin-callback';
  handlerConfig: object;
  payload?: object;
  enabled: boolean;
  lastRunAt?: Date;
  lastStatus?: 'success' | 'failed';
  nextRunAt: Date;
  consecutiveFailures: number;
  maxRetries: number;
  providerId: string;
  createdBy: string;
  createdByType: 'user' | 'plugin' | 'system';
  createdAt: Date;
  updatedAt: Date;
}
```

### TaskExecution
```typescript
{
  id: string;
  taskId: string;
  tenantId: string;
  scheduledAt: Date;
  startedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'running' | 'success' | 'failed' | 'timeout';
  attempt: number;
  result?: object;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  lockKey: string;
  workerId: string;
}
```

### Provider
```typescript
{
  id: string;
  name: string;
  version: string;
  capabilities: {
    supportsSeconds: boolean;
    supportsTimezone: boolean;
    supportsPauseResume: boolean;
    minInterval: number;
    maxTasks: number;
    requiresWebhook: boolean;
  };
}
```

### ActiveProvider
```typescript
{
  id: string;
  name: string;
  version: string;
  capabilities: object;
  healthy: boolean;
  latency: number;
}
```
