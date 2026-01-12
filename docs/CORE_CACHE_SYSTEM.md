# Core Cache System 使用指南

**状态**: ✅ 生产可用
**版本**: v1.0.0
**最后更新**: 2026-01-10

---

## 📚 目录

1. [概述](#概述)
2. [快速开始](#快速开始)
3. [核心概念](#核心概念)
4. [API 参考](#api-参考)
5. [最佳实践](#最佳实践)
6. [故障排查](#故障排查)
7. [迁移指南](#迁移指南)
8. [性能调优](#性能调优)

---

## 概述

Core Cache System 是 WordRhyme 的统一缓存基础设施，提供以下特性：

### ✨ 核心特性

- **双层缓存架构**：L1 (内存) + L2 (Redis)
- **自动失效传播**：跨实例 Pub/Sub 同步
- **命名空间隔离**：强制的 Tenant/Plugin 隔离
- **优雅降级**：Redis 故障时自动回源
- **OOM 防护**：流式删除，10k keys 安全限制
- **开发者友好**：人性化 TTL（'5m', '1h', '30s'）

### 🏗️ 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    CacheManager (Singleton)              │
│  ┌───────────────┐              ┌──────────────────┐   │
│  │  L1 (Memory)  │              │   L2 (Redis)     │   │
│  │  - LRU Cache  │──Fallback──▶ │   - Persistent   │   │
│  │  - 1 min TTL  │              │   - 1 hour TTL   │   │
│  │  - 1000 keys  │◀──Populate── │   - Pub/Sub      │   │
│  └───────────────┘              └──────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────┐                 ┌──────────────────┐
│ Tenant Namespace│                 │ Plugin Namespace │
│ tenant:123:*    │                 │ plugin:crm:*     │
└─────────────────┘                 └──────────────────┘
```

---

## 快速开始

### 1. 基础用法

```typescript
import { Injectable } from '@nestjs/common';
import { CacheManager } from '../cache/cache-manager';

@Injectable()
export class UserService {
  constructor(private cacheManager: CacheManager) {}

  async getUser(userId: string, tenantId: string) {
    // 使用 wrap 模式：缓存未命中时自动调用 fetcher
    const cache = this.cacheManager.forTenant(tenantId).forScope('users');

    return cache.wrap(
      `profile:${userId}`,
      async () => {
        // 这是你的 "Source of Truth"
        return this.db.users.findById(userId);
      },
      { ttl: '5m' } // 5 分钟 TTL
    );
  }
}
```

### 2. 手动缓存控制

```typescript
// 写入缓存
await cache.set('user:123', userData, { ttl: '10m' });

// 读取缓存
const user = await cache.get<User>('user:123');

// 删除缓存
await cache.del('user:123');

// 模式匹配删除
await cache.invalidatePattern('user:*');
```

### 3. 插件使用示例

```typescript
@Injectable()
export class CRMPluginService {
  constructor(private cacheManager: CacheManager) {}

  async getContacts(tenantId: string) {
    // 插件专属命名空间
    const cache = this.cacheManager
      .forTenant(tenantId)
      .forPlugin('crm')
      .forScope('contacts');

    return cache.wrap('list', async () => {
      return this.fetchContactsFromDB();
    });
  }
}
```

---

## 核心概念

### 1. Namespace 命名空间

**强制隔离规则**：所有缓存键必须属于一个命名空间。

#### 命名空间层次

```
CacheManager
├── forTenant(tenantId)              # tenant:123:*
│   ├── forScope(scope)              # tenant:123:users:*
│   └── forPlugin(pluginId)          # tenant:123:plugin:crm:*
│       └── forScope(scope)          # tenant:123:plugin:crm:contacts:*
│
└── forPlugin(pluginId)              # plugin:analytics:* (全局)
    └── forScope(scope)              # plugin:analytics:reports:*
```

#### 使用场景

| 场景 | API 调用 | 生成的 Key 前缀 |
|------|---------|---------------|
| 用户数据 | `forTenant('t1').forScope('users')` | `tenant:t1:users:` |
| 插件全局配置 | `forPlugin('crm')` | `plugin:crm:` |
| 租户插件数据 | `forTenant('t1').forPlugin('crm')` | `tenant:t1:plugin:crm:` |

### 2. Wrap 模式（推荐）

`wrap` 方法是推荐的缓存使用模式，它自动处理：

```typescript
const result = await cache.wrap(
  'my-key',
  async () => {
    // 仅在缓存未命中时调用
    return fetchDataFromDatabase();
  },
  { ttl: '5m' }
);
```

**优点**：
- ✅ 防止缓存穿透
- ✅ 自动回源逻辑
- ✅ 强制提供数据源（符合治理规则）
- ✅ 简化代码，避免手动 if/else

**执行流程**：
1. 检查 L1 (内存)
2. 未命中 → 检查 L2 (Redis)
3. 未命中 → 调用 `fetcher()`
4. 将结果存入 L1 + L2
5. 返回数据

### 3. TTL 管理

#### 支持的格式

```typescript
// 数字（秒）
{ ttl: 300 }                    // 5 分钟

// 字符串（人性化）
{ ttl: '5m' }                   // 5 分钟
{ ttl: '1h' }                   // 1 小时
{ ttl: '30s' }                  // 30 秒
{ ttl: '2d' }                   // 2 天
{ ttl: '1w' }                   // 1 周
```

#### 单位对照表

| 单位 | 说明 | 示例 |
|------|------|------|
| `s` | 秒 | `'30s'` = 30 秒 |
| `m` | 分钟 | `'5m'` = 5 分钟 |
| `h` | 小时 | `'1h'` = 1 小时 |
| `d` | 天 | `'7d'` = 7 天 |
| `w` | 周 | `'2w'` = 2 周 |

#### 默认 TTL

- **L1 (内存)**：固定 1 分钟（不可配置）
- **L2 (Redis)**：1 小时（未指定 ttl 时）

### 4. 错误处理

#### 错误类型

```typescript
import {
  CacheException,              // 基类
  InvalidNamespaceError,       // 命名空间非法
  CacheSerializationError,     // JSON 序列化失败
  CacheInfrastructureError,    // Redis 连接失败
} from '../cache/cache.errors';
```

#### 错误分类

| 错误类型 | 分类 | 行为 | 示例 |
|---------|------|------|------|
| `InvalidNamespaceError` | 操作错误 | **抛出异常** | 空命名空间 |
| `CacheSerializationError` | 操作错误 | **抛出异常** | 循环引用 |
| `CacheInfrastructureError` | 基础设施错误 | **静默降级** | Redis 断开 |

#### 优雅降级

```typescript
// 默认：吞掉基础设施错误
const user = await cache.get('user:123'); // Redis 失败 → 返回 null

// 严格模式：抛出所有错误
const user = await cache.get('user:123', { swallowErrors: false });
```

---

## API 参考

### CacheManager

#### 工厂方法

```typescript
// 创建租户命名空间
forTenant(tenantId: string): ITenantCacheNamespace

// 创建插件命名空间
forPlugin(pluginId: string): IPluginCacheNamespace

// 获取 Admin 接口
admin(): ICacheAdminInterface
```

### ICacheNamespace

所有命名空间实现的通用接口。

#### wrap()

**推荐使用**：带回源的缓存读取。

```typescript
wrap<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: CacheOptions
): Promise<T>
```

**参数**：
- `key`: 缓存键（自动加命名空间前缀）
- `fetcher`: 数据源函数（缓存未命中时调用）
- `options`: 可选配置
  - `ttl`: 过期时间（'5m' 或 300）
  - `swallowErrors`: 是否吞掉基础设施错误（默认 true）

**返回**：缓存数据或 fetcher 返回的新数据

**示例**：
```typescript
const user = await cache.wrap(
  `user:${userId}`,
  async () => db.users.find(userId),
  { ttl: '10m' }
);
```

---

#### get()

低级 API：仅读取缓存。

```typescript
get<T>(key: string): Promise<T | null>
```

**参数**：
- `key`: 缓存键

**返回**：缓存值或 `null`

**示例**：
```typescript
const user = await cache.get<User>('user:123');
if (!user) {
  // 手动处理缓存未命中
}
```

---

#### set()

低级 API：写入缓存。

```typescript
set<T>(key: string, value: T, options?: CacheOptions): Promise<void>
```

**参数**：
- `key`: 缓存键
- `value`: 缓存值（必须可 JSON 序列化）
- `options`: 可选配置

**示例**：
```typescript
await cache.set('user:123', userData, { ttl: '5m' });
```

**注意**：
- ⚠️ 值必须可 JSON 序列化（不支持 Function、Symbol、循环引用）
- ⚠️ 直接使用 `set` 会绕过 "Source of Truth" 治理规则，仅在必要时使用

---

#### del()

删除单个缓存键。

```typescript
del(key: string): Promise<void>
```

**参数**：
- `key`: 缓存键

**示例**：
```typescript
await cache.del('user:123');
```

**行为**：
1. 删除本地 L1 缓存
2. 删除 Redis L2 缓存
3. 通过 Pub/Sub 通知其他实例删除 L1

---

#### invalidatePattern()

模式匹配批量删除。

```typescript
invalidatePattern(
  pattern: string,
  dryRun?: boolean
): Promise<InvalidationResult>
```

**参数**：
- `pattern`: 通配符模式（支持 `*` 和 `?`）
- `dryRun`: 是否仅预览（不实际删除）

**返回**：
```typescript
interface InvalidationResult {
  count: number;           // 匹配的 key 数量
  sampleKeys: string[];    // 前 10 个 key 示例
  pattern: string;         // 完整的匹配模式
}
```

**示例**：
```typescript
// 删除所有用户缓存
const result = await cache.invalidatePattern('user:*');
console.log(`Deleted ${result.count} keys`);

// 预览（不删除）
const preview = await cache.invalidatePattern('user:*', true);
console.log(`Would delete: ${preview.sampleKeys}`);
```

**安全限制**：
- ⚠️ 最多删除 10,000 个 key（防止 OOM）
- ⚠️ 使用流式删除（不会一次性加载所有 key）
- ⚠️ 超过限制时会在日志中警告

---

#### forScope()

创建子命名空间。

```typescript
forScope(scope: string): ICacheNamespace
```

**参数**：
- `scope`: 作用域名称

**返回**：新的命名空间实例

**示例**：
```typescript
// 从 tenant:123: 创建 tenant:123:users:
const userCache = tenantCache.forScope('users');

// 嵌套作用域
const profileCache = userCache.forScope('profiles');
// 生成前缀: tenant:123:users:profiles:
```

---

### ITenantCacheNamespace

租户命名空间的扩展接口。

#### forPlugin()

在租户上下文中创建插件命名空间。

```typescript
forPlugin(pluginId: string): ICacheNamespace
```

**参数**：
- `pluginId`: 插件 ID

**返回**：插件命名空间（前缀：`tenant:{id}:plugin:{pluginId}:`）

**示例**：
```typescript
const cache = cacheManager
  .forTenant('tenant-123')
  .forPlugin('crm')
  .forScope('contacts');

// 生成前缀: tenant:tenant-123:plugin:crm:contacts:
```

---

### ICacheAdminInterface

管理员接口，用于监控和维护。

#### scan()

扫描命名空间中的 key。

```typescript
scan(
  namespace: string,
  cursor: string,
  limit: number
): Promise<{ cursor: string; keys: string[] }>
```

**参数**：
- `namespace`: 命名空间模式（如 `'tenant:123:*'`）
- `cursor`: 分页游标（'0' 表示开始）
- `limit`: 每页最大 key 数

**返回**：
```typescript
{
  cursor: string;    // 下一页的游标（'0' 表示结束）
  keys: string[];    // 当前页的 key 列表
}
```

**示例**：
```typescript
const admin = cacheManager.admin();

// 扫描所有租户 123 的 key
let cursor = '0';
do {
  const result = await admin.scan('tenant:123:*', cursor, 100);
  console.log(`Found ${result.keys.length} keys`);
  cursor = result.cursor;
} while (cursor !== '0');
```

**注意**：
- ✅ 使用 Redis SCAN（不阻塞）
- ✅ 生产环境安全
- ⚠️ 仅用于 Admin UI，不要在业务代码中使用

---

#### getStats()

获取缓存系统统计信息。

```typescript
getStats(): Promise<CacheStats>
```

**返回**：
```typescript
interface CacheStats {
  memoryUsage: number;                      // L1 缓存中的 key 数量
  l2Status: 'connected' | 'disconnected';   // Redis 连接状态
  l2Latency: number;                        // 最后一次 Redis 操作延迟（ms）
}
```

**示例**：
```typescript
const admin = cacheManager.admin();
const stats = await admin.getStats();

console.log(`Memory keys: ${stats.memoryUsage}`);
console.log(`Redis status: ${stats.l2Status}`);
console.log(`Redis latency: ${stats.l2Latency}ms`);
```

---

## 最佳实践

### 1. 使用 wrap 模式

✅ **推荐**：
```typescript
const user = await cache.wrap('user:123', async () => {
  return db.users.find(123);
});
```

❌ **不推荐**：
```typescript
let user = await cache.get('user:123');
if (!user) {
  user = await db.users.find(123);
  await cache.set('user:123', user);
}
```

**原因**：
- 代码更简洁
- 防止缓存穿透
- 符合治理规则

---

### 2. 合理设置 TTL

| 数据类型 | 推荐 TTL | 原因 |
|---------|---------|------|
| 用户资料 | `'5m' - '10m'` | 更新频率低 |
| 热点数据 | `'1m' - '3m'` | 防止过期数据 |
| 配置项 | `'1h' - '1d'` | 几乎不变 |
| 实时数据 | `'30s' - '1m'` | 需要新鲜度 |
| 统计数据 | `'10m' - '30m'` | 允许延迟 |

---

### 3. 命名空间规划

✅ **好的设计**：
```typescript
// 清晰的层次结构
forTenant(tenantId)
  .forScope('orders')           // tenant:123:orders:
  .forScope('pending')          // tenant:123:orders:pending:
```

❌ **不好的设计**：
```typescript
// 扁平化，难以批量失效
forTenant(tenantId)
  .wrap('order_123_pending', ...)
  .wrap('order_456_pending', ...)
```

---

### 4. 批量失效策略

当更新数据时，及时失效相关缓存：

```typescript
async updateUser(userId: string, tenantId: string, data: any) {
  // 1. 更新数据库
  await db.users.update(userId, data);

  // 2. 失效相关缓存
  const cache = this.cacheManager.forTenant(tenantId).forScope('users');
  await cache.del(`profile:${userId}`);
  await cache.invalidatePattern(`list:*`); // 失效用户列表
}
```

---

### 5. 避免缓存大对象

❌ **不推荐**：
```typescript
// 缓存整个 10MB 的报表
await cache.set('report:full', hugeReport, { ttl: '1h' });
```

✅ **推荐**：
```typescript
// 缓存分页数据
await cache.set('report:page:1', page1Data, { ttl: '1h' });
await cache.set('report:page:2', page2Data, { ttl: '1h' });
```

**原因**：
- 减少内存压力
- 提高序列化性能
- 避免 Redis 单 key 过大

---

### 6. 监控缓存命中率

定期检查缓存效果：

```typescript
// 在关键业务逻辑中添加指标
const startTime = Date.now();
const user = await cache.wrap('user:123', async () => {
  const fetchStartTime = Date.now();
  const data = await db.users.find(123);
  // 记录 fetcher 调用（表示缓存未命中）
  metrics.increment('cache.miss', { scope: 'users' });
  metrics.timing('cache.fetch_duration', Date.now() - fetchStartTime);
  return data;
});
metrics.timing('cache.total_duration', Date.now() - startTime);
```

---

## 故障排查

### 问题 1: 缓存未生效

**症状**：数据总是从数据库读取，缓存似乎不工作。

**排查步骤**：

1. **检查 Redis 连接**：
   ```typescript
   const admin = cacheManager.admin();
   const stats = await admin.getStats();
   console.log(stats.l2Status); // 应该是 'connected'
   ```

2. **检查 TTL 设置**：
   ```typescript
   // 确保 TTL 不是 0 或负数
   await cache.set('test', 'value', { ttl: '5m' });
   ```

3. **检查命名空间**：
   ```typescript
   // 确保 get/set 使用相同的命名空间
   const cache = cacheManager.forTenant('t1').forScope('users');
   await cache.set('key', 'value');
   const value = await cache.get('key'); // 必须使用同一个 cache 实例
   ```

---

### 问题 2: Redis 连接失败

**症状**：日志中出现 "Redis connection failed, using memory-only cache"。

**原因**：
- Redis 服务未启动
- `REDIS_URL` 环境变量未设置或错误
- 网络问题

**解决方案**：

1. **检查 Redis 服务**：
   ```bash
   redis-cli ping
   # 应该返回: PONG
   ```

2. **检查环境变量**：
   ```bash
   echo $REDIS_URL
   # 应该是: redis://localhost:6379 或其他有效 URL
   ```

3. **查看日志**：
   ```
   [CacheManager] Redis connection failed, using memory-only cache: ...
   ```

**影响**：
- ✅ 系统继续运行（优雅降级）
- ⚠️ 仅使用 L1（内存），跨实例不同步
- ⚠️ 重启后缓存丢失

---

### 问题 3: 内存占用过高

**症状**：Node.js 进程内存持续增长。

**排查步骤**：

1. **检查 L1 缓存大小**：
   ```typescript
   const stats = await cacheManager.admin().getStats();
   console.log(`Memory keys: ${stats.memoryUsage}`);
   // 最大值: 1000（配置的 maxSize）
   ```

2. **检查大对象缓存**：
   ```typescript
   // 避免缓存超大对象
   const data = await cache.get('key');
   console.log(`Size: ${JSON.stringify(data).length} bytes`);
   ```

3. **检查 TTL**：
   ```typescript
   // 确保没有永久缓存（TTL 过长）
   await cache.set('key', value, { ttl: '1h' }); // 不要超过 1 天
   ```

**解决方案**：
- 减少缓存对象大小
- 缩短 TTL
- 使用 `invalidatePattern` 定期清理

---

### 问题 4: 缓存未失效

**症状**：更新数据后，仍然读取到旧数据。

**原因**：
- 未调用 `del()` 或 `invalidatePattern()`
- 命名空间不匹配
- Pub/Sub 失败（跨实例）

**解决方案**：

1. **确保调用失效 API**：
   ```typescript
   await db.users.update(userId, data);
   await cache.del(`user:${userId}`); // ← 必须调用
   ```

2. **检查命名空间一致性**：
   ```typescript
   // 写入
   const cache1 = cacheManager.forTenant('t1').forScope('users');
   await cache1.set('key', value);

   // 删除（必须使用同一个命名空间）
   const cache2 = cacheManager.forTenant('t1').forScope('users');
   await cache2.del('key'); // ✅

   // 错误示例
   const cache3 = cacheManager.forTenant('t2').forScope('users');
   await cache3.del('key'); // ❌ 命名空间不同，删除无效
   ```

3. **检查 Pub/Sub**：
   ```bash
   # Redis CLI 监听 Pub/Sub 消息
   redis-cli
   > SUBSCRIBE cache:invalidate

   # 在另一个终端触发缓存删除，观察是否有消息
   ```

---

### 问题 5: 序列化错误

**症状**：`CacheSerializationError: Cannot serialize value with circular reference`

**原因**：尝试缓存包含循环引用的对象。

**示例**：
```typescript
const obj = { name: 'Test' };
obj.self = obj; // 循环引用

await cache.set('key', obj); // ❌ 抛出 CacheSerializationError
```

**解决方案**：

1. **移除循环引用**：
   ```typescript
   const cleanObj = { name: obj.name }; // 仅保留需要的字段
   await cache.set('key', cleanObj); // ✅
   ```

2. **使用 DTO**：
   ```typescript
   class UserDTO {
     constructor(public id: string, public name: string) {}

     static fromEntity(user: User): UserDTO {
       return new UserDTO(user.id, user.name);
     }
   }

   await cache.set('key', UserDTO.fromEntity(user)); // ✅
   ```

---

## 迁移指南

### 从旧的 Redis 直接使用迁移

#### 迁移前

```typescript
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class UserService {
  private redis = new Redis();

  async getUser(userId: string) {
    // 1. 尝试从 Redis 获取
    const cached = await this.redis.get(`user:${userId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // 2. 从数据库读取
    const user = await this.db.users.find(userId);

    // 3. 写入 Redis
    await this.redis.setex(`user:${userId}`, 300, JSON.stringify(user));

    return user;
  }
}
```

#### 迁移后

```typescript
import { Injectable } from '@nestjs/common';
import { CacheManager } from '../cache/cache-manager';

@Injectable()
export class UserService {
  constructor(
    private cacheManager: CacheManager,
    private contextService: ContextService // 获取 tenantId
  ) {}

  async getUser(userId: string) {
    const tenantId = this.contextService.getTenantId();
    const cache = this.cacheManager.forTenant(tenantId).forScope('users');

    return cache.wrap(
      userId,
      async () => this.db.users.find(userId),
      { ttl: '5m' }
    );
  }
}
```

**优化点**：
- ✅ 减少 15 行代码 → 3 行
- ✅ 自动 L1 + L2 双层缓存
- ✅ 跨实例 Pub/Sub 同步
- ✅ 强制命名空间隔离

---

### 从 SettingsCacheService 迁移

SettingsCacheService 已经迁移为 CacheManager 的适配器，**无需修改业务代码**。

如果你想直接使用新 API，可以按以下方式重构：

#### 迁移前

```typescript
constructor(
  private settingsCacheService: SettingsCacheService
) {}

async getSetting(key: string, tenantId: string) {
  const cacheKey = this.settingsCacheService.buildKey(
    'tenant',
    key,
    tenantId,
    null
  );
  return this.settingsCacheService.get(cacheKey);
}
```

#### 迁移后

```typescript
constructor(
  private cacheManager: CacheManager
) {}

async getSetting(key: string, tenantId: string) {
  const cache = this.cacheManager.forTenant(tenantId).forScope('settings');
  return cache.get(key);
}
```

---

## 性能调优

### 1. 监控指标

**关键指标**：
- **缓存命中率**：`(cache_hits / total_requests) * 100%`
  - 目标：> 80%
- **L1 命中率**：优先使用内存缓存
  - 目标：> 60%
- **Redis 延迟**：`l2Latency`
  - 目标：< 5ms (本地), < 20ms (远程)

**获取统计信息**：
```typescript
const admin = cacheManager.admin();
const stats = await admin.getStats();

console.log(`Memory cache size: ${stats.memoryUsage}/1000`);
console.log(`Redis status: ${stats.l2Status}`);
console.log(`Redis latency: ${stats.l2Latency}ms`);
```

---

### 2. TTL 优化策略

| 场景 | 策略 | TTL 设置 |
|------|------|---------|
| 热点数据 | 短 TTL + 高频访问 | `'1m' - '3m'` |
| 冷数据 | 长 TTL + 低频访问 | `'1h' - '1d'` |
| 实时性要求高 | 极短 TTL | `'30s'` |
| 配置类数据 | 长 TTL | `'1d' - '1w'` |

**动态 TTL**：
```typescript
function getTTL(accessCount: number): string {
  if (accessCount > 1000) return '5m';  // 热点
  if (accessCount > 100) return '10m';  // 温数据
  return '30m';                         // 冷数据
}

await cache.set('key', value, { ttl: getTTL(user.accessCount) });
```

---

### 3. 批量操作优化

**场景**：需要缓存多个用户资料。

❌ **不推荐**（N 次 Redis 往返）：
```typescript
for (const userId of userIds) {
  await cache.set(`user:${userId}`, userData);
}
```

✅ **推荐**（使用 Redis Pipeline）：
```typescript
// 注意：当前版本不支持 pipeline，需要手动实现
// 或者使用更大的 scope 缓存整个列表
await cache.set('users:batch', usersMap, { ttl: '5m' });
```

---

### 4. 内存优化

**L1 缓存配置**（固定）：
- `maxSize`: 1000 keys
- `ttl`: 1 分钟

**优化建议**：
1. **避免缓存大对象**：
   ```typescript
   // 每个 key 建议 < 100KB
   const size = JSON.stringify(data).length;
   if (size > 100_000) {
     console.warn(`Large cache object: ${size} bytes`);
   }
   ```

2. **使用分页缓存**：
   ```typescript
   // 不要缓存全部数据
   const allUsers = await cache.get('users:all'); // ❌

   // 按页缓存
   const page1 = await cache.get('users:page:1'); // ✅
   ```

3. **定期清理**：
   ```typescript
   // 定时任务清理过期命名空间
   @Cron('0 0 * * *') // 每天凌晨
   async cleanupCache() {
     const cache = this.cacheManager.forTenant('old-tenant');
     await cache.invalidatePattern('*');
   }
   ```

---

### 5. Redis 优化

**连接池配置**（默认）：
```typescript
// 在 cache-manager.ts 中自动配置
new Redis(redisUrl); // 默认配置已优化
```

**监控 Redis 性能**：
```bash
# Redis CLI
redis-cli --latency
redis-cli --stat
redis-cli INFO memory
```

**Redis 内存策略**：
```bash
# 建议配置 maxmemory-policy
redis-cli CONFIG SET maxmemory-policy allkeys-lru
redis-cli CONFIG SET maxmemory 1gb
```

---

## 附录

### A. 完整示例

```typescript
import { Injectable } from '@nestjs/common';
import { CacheManager } from '../cache/cache-manager';
import { ContextService } from '../context/context.service';

@Injectable()
export class ProductService {
  constructor(
    private cacheManager: CacheManager,
    private contextService: ContextService
  ) {}

  /**
   * 获取产品详情（带缓存）
   */
  async getProduct(productId: string): Promise<Product> {
    const tenantId = this.contextService.getTenantId();
    const cache = this.cacheManager
      .forTenant(tenantId)
      .forScope('products');

    return cache.wrap(
      `detail:${productId}`,
      async () => {
        console.log('Cache miss - fetching from DB');
        return this.db.products.findById(productId);
      },
      { ttl: '10m' }
    );
  }

  /**
   * 获取产品列表（带缓存）
   */
  async listProducts(page: number = 1): Promise<Product[]> {
    const tenantId = this.contextService.getTenantId();
    const cache = this.cacheManager
      .forTenant(tenantId)
      .forScope('products')
      .forScope('list'); // tenant:xxx:products:list:

    return cache.wrap(
      `page:${page}`,
      async () => {
        console.log(`Cache miss - fetching page ${page}`);
        return this.db.products.findAll({ page, limit: 20 });
      },
      { ttl: '5m' }
    );
  }

  /**
   * 更新产品（失效缓存）
   */
  async updateProduct(productId: string, data: any): Promise<void> {
    const tenantId = this.contextService.getTenantId();

    // 1. 更新数据库
    await this.db.products.update(productId, data);

    // 2. 失效详情缓存
    const detailCache = this.cacheManager
      .forTenant(tenantId)
      .forScope('products');
    await detailCache.del(`detail:${productId}`);

    // 3. 失效列表缓存
    const listCache = detailCache.forScope('list');
    await listCache.invalidatePattern('page:*');

    console.log(`Cache invalidated for product ${productId}`);
  }

  /**
   * 批量预热缓存
   */
  async warmupCache(productIds: string[]): Promise<void> {
    const tenantId = this.contextService.getTenantId();
    const cache = this.cacheManager
      .forTenant(tenantId)
      .forScope('products');

    for (const productId of productIds) {
      const product = await this.db.products.findById(productId);
      await cache.set(`detail:${productId}`, product, { ttl: '10m' });
    }

    console.log(`Warmed up cache for ${productIds.length} products`);
  }
}
```

---

### B. 常见问题 FAQ

#### Q1: 缓存键会自动加前缀吗？

**A**: 是的。使用 `forTenant()` / `forPlugin()` / `forScope()` 后，所有操作会自动添加命名空间前缀。

```typescript
const cache = cacheManager.forTenant('t1').forScope('users');
await cache.set('profile:123', data);

// 实际 Redis key: tenant:t1:users:profile:123
```

---

#### Q2: 可以跨命名空间查询吗？

**A**: 不可以。这是设计上的强制隔离，确保多租户安全。

如果需要查询多个命名空间，使用 Admin API：

```typescript
const admin = cacheManager.admin();
const result = await admin.scan('tenant:*:users:*', '0', 100);
```

---

#### Q3: 如何清空所有缓存？

**A**: 使用 Admin API 的 `invalidatePattern('*')`，但**非常危险**，仅用于开发环境。

```typescript
// ⚠️ 危险操作：清空所有租户的所有缓存
const admin = cacheManager.admin();
await admin.scan('*', '0', 10000); // 获取所有 key
// ... 手动删除
```

**推荐**：按命名空间清理：

```typescript
const cache = cacheManager.forTenant('t1');
await cache.invalidatePattern('*'); // 仅清理租户 t1
```

---

#### Q4: Redis 故障时会发生什么？

**A**: 系统会自动降级到仅使用 L1（内存）缓存：

- ✅ 请求继续正常响应
- ⚠️ 跨实例不同步
- ⚠️ 重启后缓存丢失
- 📝 日志中会有警告信息

**恢复后自动重连**：
```
[CacheManager] Redis connection failed, using memory-only cache
[CacheManager] Redis reconnected successfully
```

---

#### Q5: 如何实现缓存预热？

**A**: 在应用启动时调用：

```typescript
@Injectable()
export class CacheWarmupService implements OnModuleInit {
  constructor(private cacheManager: CacheManager) {}

  async onModuleInit() {
    await this.warmupCommonData();
  }

  private async warmupCommonData() {
    const cache = this.cacheManager.forPlugin('core').forScope('config');

    // 预热配置数据
    const config = await this.loadConfig();
    await cache.set('system', config, { ttl: '1d' });

    console.log('Cache warmup completed');
  }
}
```

---

### C. 相关资源

- **实施计划**: `.claude/plan/core-cache-system.md`
- **架构文档**: `REFERENCE_ARCHITECTURE.md`
- **治理规则**: `SYSTEM_INVARIANTS.md` § Cache Governance
- **源代码**: `apps/server/src/cache/`

---

### D. 版本历史

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-01-10 | 初始版本：双层缓存、命名空间隔离、Admin API |

---

**文档维护人**: Claude (Orchestrator)
**最后审查**: 2026-01-10
**状态**: ✅ 已批准
