# Scheduler System - 使用指南

## ✅ 系统状态

调度系统已完全部署并正常运行：

- ✅ 数据库表已创建（`scheduled_tasks`, `task_executions`, `scheduler_providers`）
- ✅ 内置调度器 Provider 已注册并激活
- ✅ tRPC API 端点已启用（10 个端点）
- ✅ Cron 定时扫描器正常工作（每分钟扫描）
- ✅ 完整测试通过

## 📡 可用的 tRPC API 端点

### 任务管理

#### 1. 创建任务 - `scheduler.create`

```typescript
await trpc.scheduler.create.mutate({
  name: '每日数据同步',
  description: '同步用户数据到数据仓库',
  cronExpression: '0 2 * * *', // 每天凌晨2点
  timezone: 'Asia/Shanghai',
  handler: {
    type: 'queue-job',
    config: {
      queueName: 'data-sync',
      jobName: 'sync-users'
    }
  },
  payload: {
    dataSource: 'production'
  },
  enabled: true
});
```

**Handler 类型**：
- `queue-job` - 发送任务到 BullMQ 队列
- `webhook` - 发送 HTTP 请求
- `plugin-callback` - 调用插件方法

#### 2. 更新任务 - `scheduler.update`

```typescript
await trpc.scheduler.update.mutate({
  id: 'task-id',
  cronExpression: '*/30 * * * *', // 改为每30分钟
  enabled: false // 禁用任务
});
```

#### 3. 删除任务 - `scheduler.delete`

```typescript
await trpc.scheduler.delete.mutate({
  id: 'task-id'
});
```

#### 4. 启用任务 - `scheduler.enable`

```typescript
await trpc.scheduler.enable.mutate({
  id: 'task-id'
});
```

#### 5. 禁用任务 - `scheduler.disable`

```typescript
await trpc.scheduler.disable.mutate({
  id: 'task-id'
});
```

#### 6. 手动触发 - `scheduler.trigger`

```typescript
await trpc.scheduler.trigger.mutate({
  id: 'task-id'
});
```

### 查询接口

#### 7. 获取单个任务 - `scheduler.get`

```typescript
const task = await trpc.scheduler.get.query({
  id: 'task-id'
});

console.log(task.name);
console.log(task.nextRunAt);
console.log(task.lastStatus);
```

#### 8. 列出所有任务 - `scheduler.list`

```typescript
const tasks = await trpc.scheduler.list.query();

tasks.forEach(task => {
  console.log(`${task.name} - 下次执行: ${task.nextRunAt}`);
});
```

#### 9. 查询执行历史 - `scheduler.executions`

```typescript
const executions = await trpc.scheduler.executions.query({
  taskId: 'task-id',
  limit: 20
});

executions.forEach(exec => {
  console.log(`${exec.startedAt} - ${exec.status}`);
  if (exec.error) {
    console.error('错误:', exec.error.message);
  }
});
```

### Provider 管理

#### 10. 列出所有 Provider - `scheduler.listProviders`

```typescript
const providers = await trpc.scheduler.listProviders.query();

providers.forEach(p => {
  console.log(`${p.name} (${p.id})`);
  console.log('支持秒级调度:', p.capabilities.supportsSeconds);
  console.log('最大任务数:', p.capabilities.maxTasks);
});
```

#### 11. 切换 Provider - `scheduler.setActiveProvider`

```typescript
// 切换到第三方 Provider（例如插件提供的 Temporal）
await trpc.scheduler.setActiveProvider.mutate({
  providerId: 'com.example.temporal-scheduler'
});
```

## 🔧 Handler 类型详解

### 1. Queue Job Handler

适用于需要异步处理的长时间任务：

```typescript
{
  type: 'queue-job',
  config: {
    queueName: 'email-notifications',
    jobName: 'send-weekly-digest'
  }
}
```

### 2. Webhook Handler

适用于调用外部 API 或服务：

```typescript
{
  type: 'webhook',
  config: {
    url: 'https://api.example.com/webhooks/scheduled',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer xxx',
      'Content-Type': 'application/json'
    }
  }
}
```

### 3. Plugin Callback Handler

适用于调用插件内部方法：

```typescript
{
  type: 'plugin-callback',
  config: {
    pluginId: 'com.example.analytics',
    methodName: 'generateDailyReport'
  }
}
```

## 📋 Cron 表达式示例

```
┌───────────── 分钟 (0 - 59)
│ ┌─────────── 小时 (0 - 23)
│ │ ┌───────── 日期 (1 - 31)
│ │ │ ┌─────── 月份 (1 - 12)
│ │ │ │ ┌───── 星期 (0 - 6) (0 = Sunday)
│ │ │ │ │
* * * * *
```

**常用示例**：

| Cron 表达式 | 描述 |
|------------|------|
| `*/5 * * * *` | 每 5 分钟 |
| `0 * * * *` | 每小时整点 |
| `0 */2 * * *` | 每 2 小时 |
| `0 9 * * *` | 每天上午 9 点 |
| `0 9 * * 1` | 每周一上午 9 点 |
| `0 0 1 * *` | 每月 1 日凌晨 |
| `0 2 * * *` | 每天凌晨 2 点 |
| `30 14 * * 1-5` | 周一到周五下午 2:30 |

## 🎯 实际应用场景

### 场景 1：每日数据备份

```typescript
await trpc.scheduler.create.mutate({
  name: '数据库备份',
  cronExpression: '0 3 * * *', // 每天凌晨 3 点
  timezone: 'Asia/Shanghai',
  handler: {
    type: 'queue-job',
    config: {
      queueName: 'maintenance',
      jobName: 'database-backup'
    }
  },
  payload: {
    databases: ['users', 'orders', 'products'],
    destination: 's3://backups/daily'
  }
});
```

### 场景 2：定时清理过期数据

```typescript
await trpc.scheduler.create.mutate({
  name: '清理过期会话',
  cronExpression: '0 */6 * * *', // 每 6 小时
  timezone: 'UTC',
  handler: {
    type: 'plugin-callback',
    config: {
      pluginId: 'com.wordrhyme.session-manager',
      methodName: 'cleanupExpiredSessions'
    }
  },
  payload: {
    expirationDays: 30
  }
});
```

### 场景 3：周报生成

```typescript
await trpc.scheduler.create.mutate({
  name: '生成周报',
  cronExpression: '0 9 * * 1', // 每周一上午 9 点
  timezone: 'Asia/Shanghai',
  handler: {
    type: 'webhook',
    config: {
      url: 'https://reporting.internal/api/generate-weekly',
      method: 'POST',
      headers: {
        'X-API-Key': process.env.REPORTING_API_KEY
      }
    }
  },
  payload: {
    reportType: 'weekly-summary',
    recipients: ['team@example.com']
  }
});
```

## 🔍 监控和调试

### 查看任务执行历史

```typescript
const executions = await trpc.scheduler.executions.query({
  taskId: 'task-id',
  limit: 50
});

// 统计成功率
const successCount = executions.filter(e => e.status === 'success').length;
const successRate = (successCount / executions.length * 100).toFixed(2);
console.log(`成功率: ${successRate}%`);

// 查找失败原因
const failures = executions.filter(e => e.status === 'failed');
failures.forEach(f => {
  console.error(`失败时间: ${f.startedAt}`);
  console.error(`错误: ${f.error?.message}`);
});
```

### 手动触发测试

在开发环境中，可以手动触发任务来测试：

```typescript
// 创建任务
const task = await trpc.scheduler.create.mutate({
  name: '测试任务',
  cronExpression: '0 0 1 1 *', // 设置为很久以后（1月1日）
  enabled: false, // 先禁用
  // ... 其他配置
});

// 手动触发测试
await trpc.scheduler.trigger.mutate({
  id: task.id
});

// 查看执行结果
const executions = await trpc.scheduler.executions.query({
  taskId: task.id,
  limit: 1
});

console.log('执行结果:', executions[0]);
```

## ⚙️ Provider 能力对比

| 能力 | Built-in Provider | 插件 Provider（示例：Temporal） |
|------|-------------------|--------------------------------|
| 秒级调度 | ❌ | ✅ |
| 时区支持 | ✅ | ✅ |
| 暂停/恢复 | ✅ | ✅ |
| 最小间隔 | 1 分钟 | 1 秒 |
| 最大任务数 | 无限制 | 取决于插件 |
| 需要 Webhook | ❌ | 可能需要 |

## 🚨 注意事项

1. **Cron 表达式验证**：系统会自动验证 cron 表达式的正确性
2. **时区处理**：建议明确指定时区，避免夏令时问题
3. **失败重试**：系统会自动重试失败的任务（默认 3 次）
4. **并发执行**：同一任务不会并发执行（通过分布式锁保证）
5. **Provider 切换**：切换 Provider 后，现有任务会自动迁移

## 📊 数据库表结构

### scheduled_tasks

存储任务配置和状态：

```sql
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  handler_type TEXT NOT NULL,
  handler_config JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
  provider_id TEXT NOT NULL DEFAULT 'builtin',
  created_by TEXT NOT NULL,
  created_by_type TEXT NOT NULL,
  -- ... 其他字段
);
```

### task_executions

存储执行历史：

```sql
CREATE TABLE task_executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL,
  result JSONB,
  error JSONB,
  lock_key TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  -- ... 其他字段
);
```

## 🔧 开发测试

运行测试脚本：

```bash
pnpm tsx test-scheduler.ts
```

测试包括：
1. 创建任务
2. 查询任务
3. 更新任务
4. 创建执行记录
5. 查询执行历史
6. 清理测试数据

## 🎓 下一步

1. **创建实际任务**：根据业务需求创建定时任务
2. **监控执行情况**：定期检查执行历史和失败率
3. **优化性能**：根据任务数量调整扫描频率
4. **集成插件**：开发第三方 Scheduler Provider（如 Temporal、Celery Beat 等）

---

**系统版本**: v0.1.0
**文档更新**: 2026-01-14
