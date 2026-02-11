# Cache API

> 缓存管理系统 API 文档

## 概述

Cache API 提供双层缓存（L1 内存 + L2 Redis）的管理和监控功能，支持基于命名空间的缓存隔离、模式匹配失效和统计监控。

## 基础信息

- **路由前缀**: `trpc.cache.*`
- **认证**: 需要登录（protectedProcedure）
- **权限**: 管理员级别操作

## 缓存架构

```
┌─────────────────────────────────────────────────┐
│                  应用层                          │
├─────────────────────────────────────────────────┤
│           CacheManager (统一入口)                 │
├─────────────────────────────────────────────────┤
│  L1 (内存缓存)   │   L2 (Redis 分布式缓存)        │
│  - 超快访问       │   - 跨节点共享                 │
│  - 单节点         │   - 持久化                    │
│  - TTL 自动过期   │   - 模式匹配                  │
└─────────────────────────────────────────────────┘
```

---

## API 端点

### cache.getStats

获取缓存系统统计信息

```typescript
// 请求
// 无参数

// 响应
{
  l1Size: number;           // 内存缓存条目数
  l2Connected: boolean;     // Redis 连接状态
  l2Latency: number;        // Redis 延迟（毫秒）
}
```

**示例**:
```typescript
const stats = await trpc.cache.getStats.query();

console.log(`L1 缓存大小: ${stats.l1Size} 条目`);
console.log(`Redis 状态: ${stats.l2Connected ? '已连接' : '未连接'}`);
console.log(`Redis 延迟: ${stats.l2Latency}ms`);
```

---

### cache.scanKeys

扫描指定命名空间的缓存键

> 使用 Redis SCAN 命令，生产安全的分页迭代。

```typescript
// 请求
{
  namespace: string;      // 命名空间模式 (例如 "tenant:123:*")
  cursor?: string;        // 分页游标，默认 "0"
  limit?: number;         // 每页最大数量，默认 100，最大 1000
}

// 响应
{
  keys: string[];         // 匹配的键列表
  cursor: string;         // 下一页游标，"0" 表示结束
}
```

**示例**:
```typescript
// 扫描租户缓存
let cursor = '0';
const allKeys: string[] = [];

do {
  const result = await trpc.cache.scanKeys.query({
    namespace: 'tenant:org-123:*',
    cursor,
    limit: 100,
  });

  allKeys.push(...result.keys);
  cursor = result.cursor;
} while (cursor !== '0');

console.log(`找到 ${allKeys.length} 个缓存键`);
```

---

### cache.previewInvalidation

预览模式失效（干运行）

> 返回将被删除的示例键，不实际删除。

```typescript
// 请求
{
  namespace: string;      // 命名空间 (例如 "tenant:123" 或 "plugin:my-plugin")
  pattern: string;        // 匹配模式 (例如 "users:*")
}

// 响应
{
  matchedKeys: string[];  // 将被删除的键列表
  count: number;          // 匹配数量
}
```

**命名空间格式**:
- `tenant:{organizationId}` - 租户缓存
- `plugin:{pluginId}` - 插件缓存
- `tenant:{organizationId}:scope1:scope2` - 带额外作用域

**示例**:
```typescript
// 预览用户相关缓存清理
const preview = await trpc.cache.previewInvalidation.query({
  namespace: 'tenant:org-123',
  pattern: 'users:*',
});

console.log(`将删除 ${preview.count} 个键:`);
preview.matchedKeys.forEach(key => console.log(`  - ${key}`));
```

---

### cache.invalidatePattern

按模式失效缓存键

> ⚠️ 警告：此操作会实际删除键。建议先使用 `previewInvalidation`。

```typescript
// 请求
{
  namespace: string;      // 命名空间
  pattern: string;        // 匹配模式
  confirm: boolean;       // 必须为 true 才执行
}

// 响应
{
  deletedKeys: string[];  // 已删除的键列表
  count: number;          // 删除数量
}
```

**示例**:
```typescript
// 先预览
const preview = await trpc.cache.previewInvalidation.query({
  namespace: 'tenant:org-123',
  pattern: 'sessions:*',
});

console.log(`即将删除 ${preview.count} 个会话缓存`);

// 确认后执行
if (confirm('确定要删除这些缓存吗？')) {
  const result = await trpc.cache.invalidatePattern.mutate({
    namespace: 'tenant:org-123',
    pattern: 'sessions:*',
    confirm: true,
  });

  console.log(`已删除 ${result.count} 个缓存键`);
}
```

---

### cache.listTenants

列出所有有缓存数据的租户

```typescript
// 请求
// 无参数

// 响应
string[]  // 租户 ID 列表（已排序）
```

**示例**:
```typescript
const tenants = await trpc.cache.listTenants.query();

console.log(`${tenants.length} 个租户有缓存数据:`);
tenants.forEach(id => console.log(`  - ${id}`));
```

---

### cache.listPlugins

列出所有有缓存数据的插件

```typescript
// 请求
// 无参数

// 响应
string[]  // 插件 ID 列表（已排序）
```

**示例**:
```typescript
const plugins = await trpc.cache.listPlugins.query();

console.log(`${plugins.length} 个插件有缓存数据:`);
plugins.forEach(id => console.log(`  - ${id}`));
```

---

## 缓存命名规则

### 键格式

```
{scope}:{scopeId}:{...path}:{key}
```

### 常见模式

| 模式 | 说明 | 示例 |
|------|------|------|
| `tenant:*` | 所有租户缓存 | `tenant:org-123:users:*` |
| `plugin:*` | 所有插件缓存 | `plugin:seo-plugin:meta:*` |
| `*:users:*` | 所有用户相关缓存 | 跨租户用户缓存 |

---

## 使用场景

### 1. 清理特定用户缓存

```typescript
await trpc.cache.invalidatePattern.mutate({
  namespace: 'tenant:org-123',
  pattern: `users:${userId}:*`,
  confirm: true,
});
```

### 2. 清理插件缓存

```typescript
await trpc.cache.invalidatePattern.mutate({
  namespace: 'plugin:my-plugin',
  pattern: '*',
  confirm: true,
});
```

### 3. 监控缓存健康

```typescript
const stats = await trpc.cache.getStats.query();

if (!stats.l2Connected) {
  console.error('Redis 连接断开！');
}

if (stats.l2Latency > 100) {
  console.warn(`Redis 延迟过高: ${stats.l2Latency}ms`);
}
```

---

## 错误处理

| 错误码 | 说明 |
|--------|------|
| `BAD_REQUEST` | 无效的命名空间格式 |
| `INTERNAL_SERVER_ERROR` | 缓存操作失败 |

---

## 最佳实践

1. **先预览后删除**: 始终使用 `previewInvalidation` 确认影响范围
2. **分批操作**: 大量键清理时使用 `scanKeys` 分页处理
3. **监控指标**: 定期检查 `getStats` 确保缓存健康
4. **命名规范**: 使用一致的键命名便于模式匹配清理
5. **谨慎通配符**: `pattern: "*"` 会删除命名空间下所有缓存

