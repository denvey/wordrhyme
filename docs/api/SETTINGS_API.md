# Settings API

> 配置管理系统 API 文档

## 概述

Settings API 提供分层配置管理功能，支持多作用域（全局、租户、插件）的配置存储和检索，具备级联解析、加密存储和类型验证能力。

## 基础信息

- **路由前缀**: `trpc.settings.*`
- **认证**: 需要登录（protectedProcedure）
- **权限**: 基于作用域的权限检查

## 权限模型

| 作用域 | 读取权限 | 写入权限 |
|--------|----------|----------|
| global | `settings:read:global` | `settings:write:global` |
| tenant | `settings:read:tenant` | `settings:write:tenant` |
| plugin_global | `settings:read:global` | `settings:write:global` |
| plugin_tenant | `settings:read:tenant` | `settings:write:tenant` |

## API 端点

### settings.get

获取配置值（支持级联解析）

```typescript
// 请求
{
  scope: 'global' | 'tenant' | 'plugin_global' | 'plugin_tenant';
  key: string;
  organizationId?: string;  // 可选，默认使用上下文租户
  scopeId?: string;         // 插件 ID（plugin_* 作用域时必需）
  defaultValue?: unknown;   // 默认值
}

// 响应
{
  value: unknown;  // 配置值，若不存在则返回 defaultValue
}
```

**示例**:
```typescript
// 获取全局配置
const result = await trpc.settings.get.query({
  scope: 'global',
  key: 'app.title',
});

// 获取租户配置（带默认值）
const result = await trpc.settings.get.query({
  scope: 'tenant',
  key: 'theme.primaryColor',
  defaultValue: '#3B82F6',
});

// 获取插件配置
const result = await trpc.settings.get.query({
  scope: 'plugin_tenant',
  key: 'notification.enabled',
  scopeId: 'com.example.notification-plugin',
});
```

---

### settings.getWithMetadata

获取配置及其完整元数据

```typescript
// 请求
{
  scope: 'global' | 'tenant' | 'plugin_global' | 'plugin_tenant';
  key: string;
  organizationId?: string;
  scopeId?: string;
}

// 响应
{
  id: string;
  key: string;
  value: unknown;
  scope: string;
  organizationId: string | null;
  scopeId: string | null;
  valueType: 'string' | 'number' | 'boolean' | 'json';
  encrypted: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
} | null
```

**示例**:
```typescript
const setting = await trpc.settings.getWithMetadata.query({
  scope: 'global',
  key: 'smtp.host',
});

if (setting) {
  console.log(`Key: ${setting.key}`);
  console.log(`Value: ${setting.value}`);
  console.log(`Encrypted: ${setting.encrypted}`);
  console.log(`Description: ${setting.description}`);
}
```

---

### settings.set

设置配置值

```typescript
// 请求
{
  scope: 'global' | 'tenant' | 'plugin_global' | 'plugin_tenant';
  key: string;
  value: unknown;
  organizationId?: string;
  scopeId?: string;
  encrypted?: boolean;     // 是否加密存储
  description?: string;    // 配置描述
  valueType?: 'string' | 'number' | 'boolean' | 'json';
}

// 响应
{
  id: string;
  key: string;
  scope: string;
}
```

**示例**:
```typescript
// 设置普通配置
await trpc.settings.set.mutate({
  scope: 'global',
  key: 'app.title',
  value: 'WordRhyme CMS',
  description: '应用标题',
});

// 设置加密配置（如 API 密钥）
await trpc.settings.set.mutate({
  scope: 'tenant',
  key: 'smtp.password',
  value: 'secret-password',
  encrypted: true,
  description: 'SMTP 密码',
});

// 设置 JSON 配置
await trpc.settings.set.mutate({
  scope: 'tenant',
  key: 'email.config',
  value: { host: 'smtp.example.com', port: 587 },
  valueType: 'json',
});
```

---

### settings.delete

删除配置

```typescript
// 请求
{
  scope: 'global' | 'tenant' | 'plugin_global' | 'plugin_tenant';
  key: string;
  organizationId?: string;
  scopeId?: string;
}

// 响应
{
  deleted: true;
}
```

**错误码**:
- `NOT_FOUND`: 配置不存在

---

### settings.list

列出指定作用域的所有配置

```typescript
// 请求
{
  scope: 'global' | 'tenant' | 'plugin_global' | 'plugin_tenant';
  organizationId?: string;
  scopeId?: string;
  keyPrefix?: string;  // 按键前缀过滤
}

// 响应
{
  settings: Array<{
    id: string;
    key: string;
    value: unknown;
    scope: string;
    valueType: string;
    encrypted: boolean;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}
```

**示例**:
```typescript
// 列出所有全局配置
const result = await trpc.settings.list.query({
  scope: 'global',
});

// 按前缀过滤
const emailSettings = await trpc.settings.list.query({
  scope: 'tenant',
  keyPrefix: 'email.',
});
```

---

## 配置作用域

### 1. global

全局配置，所有租户共享。

```typescript
scope: 'global'
```

### 2. tenant

租户级配置，每个租户独立。

```typescript
scope: 'tenant'
organizationId: 'org-123'  // 可选，默认使用当前上下文
```

### 3. plugin_global

插件全局配置。

```typescript
scope: 'plugin_global'
scopeId: 'com.example.my-plugin'  // 插件 ID
```

### 4. plugin_tenant

插件租户级配置。

```typescript
scope: 'plugin_tenant'
scopeId: 'com.example.my-plugin'
organizationId: 'org-123'
```

---

## 级联解析

配置值按以下优先级解析（高到低）：

1. `plugin_tenant` - 插件租户配置
2. `plugin_global` - 插件全局配置
3. `tenant` - 租户配置
4. `global` - 全局配置
5. `defaultValue` - 请求中的默认值

---

## 加密存储

敏感配置可以使用加密存储：

```typescript
await trpc.settings.set.mutate({
  scope: 'tenant',
  key: 'api.secret',
  value: 'my-secret-key',
  encrypted: true,
});
```

- 使用 AES-256-GCM 加密
- 密钥派生自系统密钥
- 查询时自动解密

---

## 错误处理

| 错误码 | 说明 |
|--------|------|
| `FORBIDDEN` | 权限不足 |
| `NOT_FOUND` | 配置不存在 |
| `INTERNAL_SERVER_ERROR` | 服务未初始化或内部错误 |

---

## 最佳实践

1. **使用前缀组织配置**: `email.`, `theme.`, `feature.`
2. **敏感数据加密**: 密码、API 密钥等使用 `encrypted: true`
3. **提供描述**: 便于管理界面展示
4. **指定类型**: 使用 `valueType` 确保类型一致性
5. **提供默认值**: 使用 `defaultValue` 处理配置不存在的情况
