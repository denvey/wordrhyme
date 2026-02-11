# API Token API

> API 令牌管理系统 API 文档

## 概述

API Token API 提供程序化访问令牌的管理功能，基于 Better Auth API Key 插件实现，支持能力范围（Capabilities）控制和租户隔离。

## 基础信息

- **路由前缀**: `trpc.apiTokens.*`
- **认证**: 需要登录（protectedProcedure）
- **权限**: 基于操作的权限检查
- **多租户**: Token 自动绑定到当前租户

## 权限模型

| 操作 | 权限 |
|------|------|
| 列出 Scopes | 无需额外权限 |
| 查看 Token | `Settings:read` |
| 创建 Token | `core:api-tokens:manage` |
| 删除 Token | `core:api-tokens:manage` |
| 启用/禁用 | `core:api-tokens:manage` |

---

## API 端点

### apiTokens.scopes

列出可用的能力范围

```typescript
// 请求
// 无参数

// 响应
Array<{
  value: string;             // 范围值
  label: string;             // 显示标签
}>
```

**示例**:
```typescript
const scopes = await trpc.apiTokens.scopes.query();

scopes.forEach(scope => {
  console.log(`${scope.value}: ${scope.label}`);
});
```

**可用范围**:

| 范围 | 说明 |
|------|------|
| `content:read` | 读取内容 |
| `content:write` | 创建/更新内容 |
| `content:delete` | 删除内容 |
| `media:read` | 读取媒体文件 |
| `media:write` | 上传媒体文件 |
| `media:delete` | 删除媒体文件 |
| `settings:read` | 读取设置 |
| `settings:write` | 修改设置 |

---

### apiTokens.list

列出当前租户的所有 API Token

```typescript
// 请求
// 无参数

// 响应
Array<{
  id: string;                // Token ID
  name: string | null;       // Token 名称
  prefix: string | null;     // Token 前缀（如 "sk_****abc"）
  capabilities: string[];    // 能力范围列表
  createdAt: Date;
  expiresAt: Date | null;    // 过期时间（null 表示永不过期）
  lastUsedAt: Date | null;   // 最后使用时间
  enabled: boolean;          // 是否启用
}>
```

**示例**:
```typescript
const tokens = await trpc.apiTokens.list.query();

tokens.forEach(token => {
  const status = token.enabled ? '启用' : '禁用';
  const expiry = token.expiresAt
    ? `过期于 ${token.expiresAt.toLocaleDateString()}`
    : '永不过期';

  console.log(`${token.name} (${token.prefix})`);
  console.log(`  状态: ${status}, ${expiry}`);
  console.log(`  能力: ${token.capabilities.join(', ')}`);
  if (token.lastUsedAt) {
    console.log(`  最后使用: ${token.lastUsedAt.toLocaleString()}`);
  }
});
```

---

### apiTokens.get

获取单个 Token 详情

```typescript
// 请求
{
  id: string;
}

// 响应
{
  id: string;
  name: string | null;
  prefix: string | null;
  capabilities: string[];
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  enabled: boolean;
}
```

---

### apiTokens.create

创建新的 API Token

> ⚠️ 重要：完整的 Token 密钥仅在创建时返回一次，请妥善保存！

```typescript
// 请求
{
  name: string;              // Token 名称（1-100 字符）
  capabilities: string[];    // 能力范围（至少一个）
  expiresIn?: number;        // 过期时间（秒），可选
}

// 响应
{
  id: string;
  key: string;               // ⚠️ 完整 Token 密钥（仅此一次）
  name: string | null;
  prefix: string | null;
  capabilities: string[];
  createdAt: Date;
  expiresAt: Date | null;
}
```

**示例**:
```typescript
// 创建一个只读 Token
const result = await trpc.apiTokens.create.mutate({
  name: 'CI/CD 只读 Token',
  capabilities: ['content:read', 'media:read'],
  expiresIn: 365 * 24 * 60 * 60,  // 1 年
});

console.log('Token 创建成功！');
console.log('请立即保存以下密钥，它不会再次显示：');
console.log(result.key);

// 创建一个完全访问 Token（无过期）
const fullAccess = await trpc.apiTokens.create.mutate({
  name: '管理员 Token',
  capabilities: [
    'content:read', 'content:write', 'content:delete',
    'media:read', 'media:write', 'media:delete',
    'settings:read', 'settings:write',
  ],
});
```

---

### apiTokens.delete

删除 API Token

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

**示例**:
```typescript
await trpc.apiTokens.delete.mutate({
  id: 'token-123',
});

console.log('Token 已删除');
```

---

### apiTokens.toggle

启用/禁用 Token

> 禁用的 Token 无法用于 API 认证，但不会被删除。

```typescript
// 请求
{
  id: string;
  enabled: boolean;
}

// 响应
{
  success: true;
  enabled: boolean;
}
```

**示例**:
```typescript
// 禁用 Token
await trpc.apiTokens.toggle.mutate({
  id: 'token-123',
  enabled: false,
});

// 重新启用
await trpc.apiTokens.toggle.mutate({
  id: 'token-123',
  enabled: true,
});
```

---

## 使用 API Token

### HTTP 请求认证

在请求头中携带 Token：

```bash
curl -X GET "https://api.example.com/content" \
  -H "Authorization: Bearer wrt_live_xxxxxx"
```

### Token 格式

```
wrt_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
│   │    └── 随机字符串
│   └── 环境 (live/test)
└── 前缀 (wrt = wordrhyme token)
```

---

## 租户隔离

Token 通过 `metadata.organizationId` 绑定到租户：

- 每个 Token 只能访问创建它的租户的数据
- 跨租户访问会返回 404（而非 403，避免信息泄露）
- 管理员只能看到当前租户的 Token

---

## 能力检查

Token 携带的能力在每次 API 请求时验证：

```typescript
// 请求需要 content:read 能力
// Token 必须包含此能力才能成功

// 能力格式
{resource}:{action}

// 示例
content:read   // 可以读取内容
content:write  // 可以创建/更新内容
media:delete   // 可以删除媒体文件
```

---

## 错误处理

| 错误码 | 说明 |
|--------|------|
| `BAD_REQUEST` | 缺少组织上下文或无效能力 |
| `FORBIDDEN` | 权限不足 |
| `NOT_FOUND` | Token 不存在或属于其他租户 |
| `INTERNAL_SERVER_ERROR` | 服务错误 |

---

## 安全最佳实践

1. **最小权限**: 只授予必要的能力范围
2. **设置过期**: 为非永久用途的 Token 设置过期时间
3. **定期轮换**: 定期删除旧 Token 并创建新 Token
4. **安全存储**: 将 Token 存储在安全的密钥管理系统中
5. **监控使用**: 定期检查 `lastUsedAt` 发现异常使用
6. **及时禁用**: 发现泄露时立即禁用 Token
7. **命名规范**: 使用清晰的名称标识 Token 用途

---

## 与 API Key Guard 配合

API Token 通过 `ApiKeyGuard` 进行验证：

```typescript
// 在 NestJS 控制器中使用
@UseGuards(ApiKeyGuard)
@RequireCapabilities('content:read')
@Get('/content')
async getContent() {
  // 只有携带有效 Token 且包含 content:read 能力的请求才能访问
}
```

