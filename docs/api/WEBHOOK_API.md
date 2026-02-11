# Webhook API

> Webhook 事件通知系统 API 文档

## 概述

Webhook API 提供完整的事件通知功能，支持 HTTPS 端点注册、事件订阅、自动重试和交付日志查询。所有 Webhook 都使用 HMAC-SHA256 签名保证安全性。

## 基础信息

- **路由前缀**: `trpc.webhook.*`
- **认证**: 需要登录（protectedProcedure）
- **权限**: 基于操作的权限检查

## 权限模型

| 操作 | 权限 |
|------|------|
| 创建 Webhook | `Webhook:create` |
| 查看 Webhook | `Webhook:read` |
| 更新 Webhook | `Webhook:update` |
| 删除 Webhook | `Webhook:delete` |
| 测试 Webhook | `Webhook:test` |

---

## API 端点

### webhook.create

创建新的 Webhook 端点

```typescript
// 请求
{
  url: string;              // HTTPS URL（必须使用 HTTPS）
  events: string[];         // 订阅的事件类型（至少一个）
  enabled?: boolean;        // 是否启用，默认 true
  retryPolicy?: {           // 重试策略
    attempts: number;       // 重试次数，0-10，默认 5
    backoffMs: number;      // 基础退避时间（毫秒），100-60000，默认 1000
    maxBackoffMs?: number;  // 最大退避时间（毫秒），1000-300000
  };
}

// 响应
{
  id: string;               // Webhook ID
  url: string;
  secretPreview: string;    // 密钥预览（如 "whsec_****abc"）
  events: string[];
  enabled: boolean;
  retryPolicy: RetryPolicy;
  createdAt: Date;
  updatedAt: Date;
}
```

**示例**:
```typescript
const webhook = await trpc.webhook.create.mutate({
  url: 'https://api.example.com/webhooks/receive',
  events: ['content.created', 'content.updated', 'content.deleted'],
  retryPolicy: {
    attempts: 5,
    backoffMs: 1000,
    maxBackoffMs: 60000,
  },
});

console.log(`Webhook 创建成功: ${webhook.id}`);
console.log(`密钥预览: ${webhook.secretPreview}`);
// 注意：完整密钥仅在创建时返回一次，请妥善保存
```

---

### webhook.list

列出所有 Webhook 端点

```typescript
// 请求
// 无参数

// 响应
Array<{
  id: string;
  url: string;
  secretPreview: string;
  events: string[];
  enabled: boolean;
  retryPolicy: RetryPolicy;
  createdAt: Date;
  updatedAt: Date;
}>
```

**示例**:
```typescript
const webhooks = await trpc.webhook.list.query();

webhooks.forEach(webhook => {
  console.log(`${webhook.id}: ${webhook.url}`);
  console.log(`  事件: ${webhook.events.join(', ')}`);
  console.log(`  状态: ${webhook.enabled ? '启用' : '禁用'}`);
});
```

---

### webhook.get

获取单个 Webhook 详情

```typescript
// 请求
{
  id: string;
}

// 响应
{
  id: string;
  url: string;
  secretPreview: string;
  events: string[];
  enabled: boolean;
  retryPolicy: RetryPolicy;
  createdAt: Date;
  updatedAt: Date;
}
```

---

### webhook.update

更新 Webhook 端点

```typescript
// 请求
{
  id: string;               // Webhook ID（必需）
  url?: string;             // 新的 URL（HTTPS）
  events?: string[];        // 新的事件列表
  enabled?: boolean;        // 启用/禁用
  retryPolicy?: RetryPolicy;// 新的重试策略
  rotateSecret?: boolean;   // 是否轮换密钥
}

// 响应
{
  id: string;
  url: string;
  secretPreview: string;    // 如果轮换，返回新密钥预览
  events: string[];
  enabled: boolean;
  retryPolicy: RetryPolicy;
  createdAt: Date;
  updatedAt: Date;
}
```

**示例**:
```typescript
// 更新事件订阅
await trpc.webhook.update.mutate({
  id: 'wh-123',
  events: ['content.created', 'content.updated'],
});

// 禁用 Webhook
await trpc.webhook.update.mutate({
  id: 'wh-123',
  enabled: false,
});

// 轮换密钥
const updated = await trpc.webhook.update.mutate({
  id: 'wh-123',
  rotateSecret: true,
});
console.log(`新密钥预览: ${updated.secretPreview}`);
```

---

### webhook.delete

删除 Webhook 端点

```typescript
// 请求
{
  id: string;
}

// 响应
{
  deleted: true;
}
```

---

### webhook.test

测试 Webhook 端点

> 发送测试事件到指定 Webhook 端点。

```typescript
// 请求
{
  id: string;               // Webhook ID
  payload?: Record<string, unknown>;  // 自定义测试负载
}

// 响应
{
  success: boolean;
  statusCode: number;       // HTTP 状态码
  responseTime: number;     // 响应时间（毫秒）
  error?: string;           // 错误信息（如果失败）
}
```

**示例**:
```typescript
const result = await trpc.webhook.test.mutate({
  id: 'wh-123',
  payload: {
    testField: 'hello',
  },
});

if (result.success) {
  console.log(`测试成功！响应时间: ${result.responseTime}ms`);
} else {
  console.error(`测试失败: ${result.error}`);
}
```

---

### webhook.deliveries

查询交付历史

```typescript
// 请求
{
  id: string;               // Webhook ID
  status?: 'pending' | 'success' | 'failed';  // 状态过滤
  page?: number;            // 页码，默认 1
  pageSize?: number;        // 每页数量，默认 50，最大 100
}

// 响应
{
  deliveries: Array<{
    id: string;
    endpointId: string;
    eventType: string;
    payload: Record<string, unknown>;
    status: 'pending' | 'success' | 'failed';
    attempts: number;
    lastAttemptAt: Date | null;
    responseCode: number | null;
    error: string | null;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
```

**示例**:
```typescript
// 查询失败的交付
const result = await trpc.webhook.deliveries.query({
  id: 'wh-123',
  status: 'failed',
  page: 1,
  pageSize: 20,
});

result.deliveries.forEach(delivery => {
  console.log(`${delivery.eventType}: ${delivery.error}`);
  console.log(`  尝试次数: ${delivery.attempts}`);
});
```

---

## 事件类型

### 内容事件

| 事件 | 说明 |
|------|------|
| `content.created` | 内容创建 |
| `content.updated` | 内容更新 |
| `content.deleted` | 内容删除 |
| `content.published` | 内容发布 |
| `content.unpublished` | 内容取消发布 |

### 用户事件

| 事件 | 说明 |
|------|------|
| `user.created` | 用户创建 |
| `user.updated` | 用户更新 |
| `user.deleted` | 用户删除 |

### 媒体事件

| 事件 | 说明 |
|------|------|
| `media.uploaded` | 文件上传 |
| `media.deleted` | 文件删除 |

---

## Webhook 负载格式

```json
{
  "id": "evt_xxxx",
  "type": "content.created",
  "timestamp": "2025-01-30T12:00:00.000Z",
  "organizationId": "org-123",
  "data": {
    // 事件相关数据
  }
}
```

---

## 签名验证

所有 Webhook 请求都带有 HMAC-SHA256 签名，用于验证请求真实性。

### 签名头

```
X-Webhook-Signature: sha256=<signature>
X-Webhook-Timestamp: <timestamp>
```

### 验证示例

```typescript
import crypto from 'crypto';

function verifySignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expectedSignature}`)
  );
}
```

---

## 重试策略

使用指数退避算法：

```
等待时间 = min(backoffMs * 2^attempt, maxBackoffMs)
```

### 默认策略

| 参数 | 默认值 |
|------|--------|
| `attempts` | 5 |
| `backoffMs` | 1000ms |
| `maxBackoffMs` | 60000ms |

### 重试时间表（默认）

| 尝试 | 等待时间 |
|------|----------|
| 1 | 1 秒 |
| 2 | 2 秒 |
| 3 | 4 秒 |
| 4 | 8 秒 |
| 5 | 16 秒 |

---

## 错误处理

| 错误码 | 说明 |
|--------|------|
| `BAD_REQUEST` | URL 格式无效或未使用 HTTPS |
| `FORBIDDEN` | 权限不足 |
| `NOT_FOUND` | Webhook 不存在 |
| `INTERNAL_SERVER_ERROR` | 服务未初始化 |

---

## 最佳实践

1. **使用 HTTPS**: 必须使用 HTTPS URL 确保传输安全
2. **验证签名**: 始终验证请求签名防止伪造
3. **幂等处理**: 设计接收端支持幂等，处理重复投递
4. **快速响应**: 在 30 秒内返回 2xx 状态码
5. **异步处理**: 接收后异步处理，避免超时
6. **监控交付**: 定期检查交付日志，处理失败投递
7. **密钥轮换**: 定期轮换密钥，使用 `rotateSecret` 选项

