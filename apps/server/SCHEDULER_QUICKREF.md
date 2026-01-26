# Scheduler Quick Reference

## 🚀 快速开始

### 创建任务

```typescript
await trpc.scheduler.create.mutate({
  name: '任务名称',
  cronExpression: '0 2 * * *', // 每天凌晨2点
  timezone: 'Asia/Shanghai',
  handler: {
    type: 'queue-job', // 或 'webhook', 'plugin-callback'
    config: { queueName: 'tasks', jobName: 'my-task' }
  }
});
```

### 查询任务

```typescript
// 列表
const tasks = await trpc.scheduler.list.query();

// 单个
const task = await trpc.scheduler.get.query({ id: 'xxx' });

// 执行历史
const execs = await trpc.scheduler.executions.query({ taskId: 'xxx' });
```

### 管理任务

```typescript
// 启用/禁用
await trpc.scheduler.enable.mutate({ id: 'xxx' });
await trpc.scheduler.disable.mutate({ id: 'xxx' });

// 手动触发
await trpc.scheduler.trigger.mutate({ id: 'xxx' });

// 更新
await trpc.scheduler.update.mutate({
  id: 'xxx',
  cronExpression: '*/30 * * * *'
});

// 删除
await trpc.scheduler.delete.mutate({ id: 'xxx' });
```

## ⏰ Cron 速查

| 表达式 | 说明 |
|--------|------|
| `*/5 * * * *` | 每 5 分钟 |
| `0 * * * *` | 每小时 |
| `0 */2 * * *` | 每 2 小时 |
| `0 9 * * *` | 每天 9:00 |
| `0 9 * * 1` | 每周一 9:00 |
| `0 0 1 * *` | 每月 1 日 00:00 |
| `30 14 * * 1-5` | 工作日 14:30 |

## 🔧 Handler 类型

### Queue Job
```typescript
{
  type: 'queue-job',
  config: {
    queueName: 'my-queue',
    jobName: 'my-job'
  }
}
```

### Webhook
```typescript
{
  type: 'webhook',
  config: {
    url: 'https://api.example.com/webhook',
    method: 'POST',
    headers: { 'Authorization': 'Bearer xxx' }
  }
}
```

### Plugin Callback
```typescript
{
  type: 'plugin-callback',
  config: {
    pluginId: 'com.example.plugin',
    methodName: 'myMethod'
  }
}
```

## 📊 常用场景

| 场景 | Cron | Handler |
|------|------|---------|
| 每日备份 | `0 3 * * *` | queue-job |
| 每小时同步 | `0 * * * *` | webhook |
| 每周报告 | `0 9 * * 1` | plugin-callback |
| 每月账单 | `0 0 1 * *` | queue-job |
| 15分钟健康检查 | `*/15 * * * *` | webhook |

## 🚨 必填字段

创建任务时必须提供：
- `name` - 任务名称
- `cronExpression` - Cron 表达式
- `timezone` - 时区
- `handler.type` - Handler 类型
- `handler.config` - Handler 配置
- `createdBy` - 创建者 ID（通过 context 自动填充）
- `createdByType` - 创建者类型：`'user'` | `'plugin'` | `'system'`

## 🧪 测试

```bash
# 运行测试脚本
pnpm tsx test-scheduler.ts
```

## 📖 详细文档

查看 [SCHEDULER_USAGE_GUIDE.md](./SCHEDULER_USAGE_GUIDE.md) 获取完整文档。
