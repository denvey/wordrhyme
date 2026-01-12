# Core Cache System 实施计划

**OpenSpec ID**: `core-cache-system`
**方案**: 方案 B - 全新 CacheManager 模块 + Gemini API 设计
**批准日期**: 2026-01-10
**预计工作量**: 16 小时（2 个工作日）

---

## 📋 方案概述

### 核心决策
- ✅ 创建全新 `apps/server/src/cache/` 模块
- ✅ 采用 Gemini 建议的 Fluent API + `wrap` 模式
- ✅ 复用 SettingsCacheService 的 L1/L2/Pub/Sub 逻辑
- ✅ 强制命名空间隔离：`tenant:{id}:*` / `plugin:{id}:*`

### 架构特性
1. **双层缓存**：L1 (Memory LRU) + L2 (Redis)
2. **优雅降级**：Redis 失败时静默回源
3. **命名空间强制隔离**：私有构造函数 + 工厂方法
4. **Admin UI 就绪**：scan, dryRun, CacheStats API
5. **开发者友好**：人性化 TTL（'5m', '1h'）

---

## 🏗️ 文件结构

```
apps/server/src/
├── cache/                          # 新建核心模块
│   ├── cache.module.ts             # NestJS 模块定义
│   ├── cache-manager.ts            # CacheManager 核心类
│   ├── cache-namespace.ts          # CacheNamespace 实现
│   ├── cache-admin.ts              # Admin 接口实现
│   ├── cache.types.ts              # Gemini 定义的所有类型
│   ├── cache.errors.ts             # 异常类层次结构
│   ├── duration-parser.ts          # TTL 字符串解析（'5m' → 300）
│   └── __tests__/
│       ├── cache-manager.test.ts
│       ├── namespace-isolation.test.ts
│       └── pubsub-invalidation.test.ts
│
└── settings/
    └── cache.service.ts            # 迁移为 CacheManager 的 adapter
```

---

## 📝 核心 API 设计

### 接口定义（来自 Gemini）

```typescript
interface CacheManager {
  forTenant(tenantId: string): TenantCacheNamespace;
  forPlugin(pluginId: string): PluginCacheNamespace;
  admin(): CacheAdminInterface;
}

interface CacheNamespace {
  wrap<T>(key: string, fetcher: () => Promise<T>, options?: CacheOptions): Promise<T>;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  del(key: string): Promise<void>;
  invalidatePattern(pattern: string, dryRun?: boolean): Promise<InvalidationResult>;
  forScope(scope: string): CacheNamespace;
}

interface CacheOptions {
  ttl?: string | number; // '5m' or 300
  swallowErrors?: boolean;
}
```

### 使用示例

```typescript
// 标准用法（wrap 模式）
const cache = cacheManager.forTenant(tenantId).forScope('users');
const user = await cache.wrap(
  `profile:${userId}`,
  async () => db.users.findById(userId),
  { ttl: '15m' }
);

// 插件隔离
const pluginCache = cacheManager
  .forTenant(tenantId)
  .forPlugin('crm-module');
await pluginCache.set('config', data, { ttl: '1h' });

// 批量失效
await cache.invalidatePattern('users:*');
```

---

## 📐 实施步骤

| 步骤 | 任务 | 工作量 | 状态 |
|------|------|--------|------|
| 1️⃣ | 创建 `cache.types.ts`（复制 Gemini 定义） | 0.5h | ⏳ |
| 2️⃣ | 创建 `duration-parser.ts`（支持 '5m' → 300） | 1h | ⏳ |
| 3️⃣ | 创建 `cache.errors.ts`（异常类层次） | 0.5h | ⏳ |
| 4️⃣ | 实现 `CacheManager`（复用 SettingsCacheService） | 3h | ⏳ |
| 5️⃣ | 实现 `CacheNamespace` 基类 + 子类 | 2h | ⏳ |
| 6️⃣ | 实现 `cache-admin.ts`（scan + stats） | 1h | ⏳ |
| 7️⃣ | 创建 `cache.module.ts`（NestJS 模块注册） | 1h | ⏳ |
| 8️⃣ | 编写单元测试（L1/L2/wrap/namespace） | 3h | ⏳ |
| 9️⃣ | 迁移 SettingsCacheService 为 adapter | 2h | ⏳ |
| 🔟 | 集成测试 + 性能测试 | 2h | ⏳ |

**总计**: 16 小时

---

## 🧪 测试计划

### 单元测试（6 个）
- ✅ `duration-parser.test.ts`：TTL 字符串解析
- ✅ `cache-namespace.test.ts`：命名空间前缀拼接、链式调用
- ✅ `cache-manager.test.ts`：L1/L2 读写、LRU 淘汰
- ✅ `wrap-pattern.test.ts`：`wrap` 方法调用 fetcher 逻辑
- ✅ `cache-errors.test.ts`：异常抛出和静默处理
- ✅ `admin-api.test.ts`：scan, dryRun 功能

### 集成测试（3 个）
- ✅ `pubsub-invalidation.test.ts`：跨进程 Pub/Sub 失效
- ✅ `namespace-isolation.test.ts`：Tenant A 无法读取 Tenant B 缓存
- ✅ `redis-failure.test.ts`：Redis 断线时优雅降级

### 性能测试（2 个）
- ✅ `cache-hit-rate.test.ts`：100 次请求的命中率 >80%
- ✅ `memory-leak.test.ts`：1000 次写入后内存不超过上限

---

## 🔄 迁移策略

### Phase 1：并行运行（1-2 天）
```typescript
@Injectable()
export class SettingsCacheService {
  constructor(private cacheManager: CacheManager) {}

  // Adapter 方法
  async get(scope, key, tenantId, scopeId) {
    return this.cacheManager
      .forTenant(tenantId)
      .forScope('settings')
      .get(this.buildOldKey(scope, key, scopeId));
  }
}
```

### Phase 2：逐步替换（3-5 天）
- Settings Service 直接使用 `cacheManager.forTenant().forScope('settings')`
- 删除 SettingsCacheService 类

### Phase 3：开放给插件（1 周后）
- 在 `@wordrhyme/plugin-api` 导出 `CacheManager` 类型
- 插件通过 DI 注入 `cacheManager.forPlugin(pluginId)`

---

## 🎯 关键设计决策

### 1. 为什么选择 Fluent API？
- **治理强制执行**：私有构造函数 + 工厂方法，无法绕过命名空间
- **开发者体验**：链式调用更直观，避免手动拼接前缀错误

### 2. 为什么采用 `wrap` 模式？
- **治理规则**："No Source of Truth" - 强制提供 fetcher 函数
- **减少样板代码**：避免手动 "get → if null → fetch → set" 逻辑

### 3. 为什么支持字符串 TTL？
- **人性化**：`'5m'` 比 `300` 更易读，减少秒/毫秒混淆
- **行业标准**：Redis CLI、Redis OM、ioredis-mock 都支持

### 4. 为什么优雅降级？
- **可用性优先**：Redis 失败不应导致整个系统崩溃
- **符合治理**：Cache 是派生数据，丢失后可从数据源重建

---

## 🚨 风险与缓解

| 风险 | 严重度 | 缓解措施 | 状态 |
|------|--------|----------|------|
| 命名空间绕过 | 🔴 高 | 私有构造 + TypeScript 类型检查 | ✅ 设计中已解决 |
| Pub/Sub 消息丢失 | 🟡 中 | 添加 Message ID + 幂等处理 | ⏳ Phase 2 实现 |
| L1 内存泄漏 | 🟡 中 | 严格 LRU 上限 + 监控 | ✅ 复用 SettingsCache |
| Pattern 失效性能 | 🟡 中 | SCAN 替代 KEYS | ✅ 设计中已采纳 |
| 跨实例一致性 | 🟢 低 | Pub/Sub 已验证 | ✅ 已有实现 |

---

## 📚 参考资料

- **Gemini API 设计文档**：SESSION_ID `9ac63d38-1426-4a1e-b43c-8ef0163187c6`
- **现有实现**：`apps/server/src/settings/cache.service.ts`
- **治理文档**：`docs/CORE_SYSTEMS_ROADMAP.md` § 1.4
- **项目架构约束**：`CLAUDE.md` - Contract-First, Plugin Isolation

---

**批准人**: Claude (Orchestrator)
**审查状态**: 待 Gemini/Codex 审查（Phase 5）
**最后更新**: 2026-01-10
