# WordRhyme Core Systems Roadmap

## 概述

本文档规划 WordRhyme 平台核心基础设施的实现路线图。基于架构治理文档（frozen v0.1）和 dsneo 的实际需求，确定系统优先级和实现顺序。

## 当前状态总结

### ✅ 已完整实现

| 系统 | 核心组件 | 文档位置 |
|------|---------|----------|
| 用户 & 组织 | User, Organization, Team, Member, Invitation | `auth-schema.ts` |
| 插件系统 | PluginManager, Manifest, Lifecycle, Isolation | `plugins/` |
| 权限系统 | PermissionKernel, CASL, Roles | `permission/` |
| 通知系统 | NotificationService, Templates, Preferences, Channels | `notifications/` |
| 队列系统 | QueueService, BullMQ | `queue/` |
| 事件总线 | EventBus, Domain Events | `events/` |
| Context | AsyncLocalStorage, Multi-tenancy | `context/` |
| Auth | Better-Auth, Guards, Session | `auth/` |
| tRPC API | Type-safe RPC, Plugin Routes | `trpc/` |

### ⚠️ 部分实现

| 系统 | 已有 | 缺失 |
|------|------|------|
| 异步系统 | Job Queue, Worker | Scheduler (Cron) |
| Event/Hook | Event emitter | Transform/Decision/Side-Effect Hooks |
| API 基础设施 | tRPC | Webhook 分发, API Token |

### ❌ 未实现

| 系统 | 必要性 | dsneo 依赖度 |
|------|--------|-------------|
| 配置系统 | 极高 - 避免配置地狱 | 高 |
| 文件系统 | 极高 - 商品图片核心 | 极高 |
| Webhook 系统 | 高 - 第三方集成 | 高 |
| Scheduler | 中 - 定时任务 | 中 |
| 可观测性 | 极高 - 生产环境运维 | 高 |
| 通用缓存 | 极高 - 高并发刚需 | 极高 |
| 搜索引擎 | 高 - 商品搜索 | 极高 |

---

## 实现路线图

### Phase 1: 核心基础设施补全（优先级：极高）

#### 1.1 配置系统 (Settings System)

**OpenSpec ID**: `core-settings-system`

**范围**:
- Global Settings - 平台级配置
- Tenant Settings - 组织级配置
- Plugin Settings - 插件私有配置
- Feature Flags - 功能开关

**关键设计**:
```typescript
// Settings 层级
type SettingScope = 'global' | 'tenant' | 'plugin';

// Settings 表结构
interface Setting {
  id: string;
  scope: SettingScope;
  scopeId: string;       // tenantId 或 pluginId
  key: string;           // 点分隔，如 "email.smtp.host"
  value: JsonValue;
  schema?: JsonSchema;   // 可选的值验证
  encrypted: boolean;    // 敏感值加密
  updatedAt: Date;
}

// Feature Flag
interface FeatureFlag {
  id: string;
  key: string;           // 如 "dark_mode", "ai_features"
  enabled: boolean;
  rolloutPercentage: number;  // 灰度发布
  conditions: Condition[];     // 条件规则
}
```

**API 端点**:
- `settings.get(scope, key)`
- `settings.set(scope, key, value)`
- `settings.list(scope)`
- `featureFlags.check(key, context)`
- `featureFlags.list()`


**配置解析规则 (Resolution Rule)**:
- **Priority**: Plugin Scope > Tenant Scope > Global Scope
- **Constraints**:
  - Plugin Settings 只能覆盖自己声明的 key
  - Tenant 不能覆盖 Plugin 私有 key
  - Global 不能感知 Plugin key

**依赖**: None (基础模块)

**工作量估计**: 2-3 天

---

#### 1.2 文件/资源系统 (File/Asset System)

**OpenSpec ID**: `core-file-asset-system`

**范围**:
- File Upload (multipart)
- Asset 管理 (图片、视频、文档)
- Storage 抽象 (Local, S3, OSS, R2)
- CDN 集成
- 图片处理 (resize, optimize, watermark)

**关键设计**:
```typescript
// 存储提供者抽象
interface StorageProvider {
  upload(file: Buffer, options: UploadOptions): Promise<FileRecord>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresIn: number): Promise<string>;
}

// 文件记录
interface FileRecord {
  id: string;
  tenantId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  size: number;
  storageProvider: 'local' | 's3' | 'oss' | 'r2';
  storageKey: string;
  publicUrl?: string;
  metadata: JsonObject;
  createdAt: Date;
}

// Asset (带处理的文件)
interface Asset {
  id: string;
  fileId: string;
  type: 'image' | 'video' | 'document' | 'other';
  variants: {
    thumbnail: string;
    medium: string;
    large: string;
    original: string;
  };
  alt?: string;
  tags: string[];
}
```

**API 端点**:
- `file.upload(file, options)`
- `file.get(id)`
- `file.delete(id)`
- `file.getSignedUrl(id)`
- `asset.create(fileId, options)`
- `asset.list(query)`
- `asset.getVariant(id, variant)`

**依赖**: Settings System (存储配置)

**工作量估计**: 3-4 天

---

#### 1.3 核心可观测性 (Core Observability)

**OpenSpec ID**: `core-observability-system`

**范围**:
- Structured Logging (JSON, Level-based)
- Request Tracing (TraceId, SpanId)
- Performance Metrics (Prometheus compatible)
- Error Tracking integration

**关键设计**:
```typescript
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context: string;       // Component/Service name
  pluginId?: string;     // 插件归因
  tenantId?: string;     // 租户归因
  traceId?: string;      // 请求链路追踪
  spanId?: string;
  timestamp: Date;
  metadata?: JsonObject; // 结构化数据
}

// 统一追踪上下文
interface TraceContext {
  traceId: string;
  parentSpanId?: string;
  baggage: Record<string, string>;
}
```

**插件隔离 (Plugin Isolation)**:
- Plugin 只能访问自己的 Logs & Metrics
- Core 拥有全局视图
- TraceId 自动跨越 Plugin/Core 边界传播
```

**依赖**: None

**工作量估计**: 2 天

---

#### 1.4 通用缓存系统 (Universal Cache)

**OpenSpec ID**: `core-cache-system`

**范围**:
- 抽象 SettingsCacheService 为通用 Kernel Cache
- L1 (Memory) + L2 (Redis) 架构
- Cache Invalidation (Pub/Sub)
- Namespaced Keys (Tenant/Plugin isolation)

**关键设计**:
```typescript
interface CacheManager {
  // 核心操作
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  
  // 命名空间支持
  forPlugin(pluginId: string): CacheNamespace;
  forTenant(tenantId: string): CacheNamespace;
  
  // 模式失效
  invalidatePattern(pattern: string): Promise<void>;
}
```

**治理规则 (Governance)**:
- **No Source of Truth**: Cache 永远是派生数据，禁止作为主存储。所有 cache miss 必须可回源。
- **No Direct Access**: 禁止插件直接访问底层 Redis Client，必须走 Kernel Cache API。
- **Namespacing**: 强制 enforcing `plugin:{id}:*` 命名空间。

**依赖**: Redis Infrastructure

**工作量估计**: 1-2 天

---

### Phase 1.5: Production Safety Layer (优先级：生产强制)

此阶段介于基础设施和扩展能力之间，是**生产环境部署的阻断性条件**。不包含在 MVP 中，但必须在正式上线前完成。

#### 1.5.1 核心审计系统 (Core Audit System)

**OpenSpec ID**: `core-audit-system`

**定位**:
- **业务级不可变事实记录** (Not Logging/Observability)
- 运营/风控/合规的基础设施
- "Who did what when" 的唯一事实来源

**范围**:
- 不可变事件记录 (Immutable / Append-only)
- 强结构化 (Strict Schema)
- 插件写入 API (Core-mediated)
- Admin 审计日志面板

**关键设计**:
```typescript
interface AuditLog {
  id: string;

  // 多租户隔离
  tenantId: string;
  organizationId?: string;

  // 行为主体
  actorType: 'user' | 'system' | 'plugin' | 'api-token';
  actorId?: string;
  actorDisplayName?: string;

  // 行为与资源
  action: string;              // e.g. "product.update"
  resourceType: string;        // e.g. "product"
  resourceId?: string;

  // 结果与上下文
  status: 'success' | 'failed';
  before?: JsonObject;         // 变更前快照
  after?: JsonObject;          // 变更后快照
  
  // 追踪
  traceId?: string;
  ip?: string;
  createdAt: Date;
}
```

**三条铁律**:
1. **只能追加，不可变** (Archive allowed, Update/Delete prohibited)
2. **不允许失败** (Audit failure = System degraded)
3. **Core 托管写入** (插件只能通过 API 提交业务语义，不能直接写库)

**依赖**: Permission System, Context

**工作量估计**: 3 天

---

#### 1.5.2 其他安全设施 (Optional for v1.0)
- **Rate Limiting**: API 速率限制
- **Basic Quota**: 资源配额限制

---

### Phase 2: 扩展能力增强

#### 2.1 Webhook 系统

**OpenSpec ID**: `core-webhook-system`

**范围**:
- Webhook 注册 (用户配置回调 URL)
- Event 推送 (Domain Events → Webhook)
- 重试机制 (指数退避)
- 签名验证 (HMAC)
- 交付日志

**关键设计**:
```typescript
interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  secret: string;          // 用于签名
  events: string[];        // 订阅的事件类型
  enabled: boolean;
  retryPolicy: RetryPolicy;
  createdAt: Date;
}

interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventType: string;
  payload: JsonObject;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  lastAttemptAt: Date;
  responseCode?: number;
  error?: string;
}
```

**API 端点**:
- `webhook.create(url, events, options)`
- `webhook.list()`
- `webhook.update(id, options)`
- `webhook.delete(id)`
- `webhook.test(id)`
- `webhook.deliveries(id, query)`

**依赖**: Queue System (异步分发), Event Bus

**工作量估计**: 2-3 天

---

#### 2.2 Scheduler 系统

**OpenSpec ID**: `core-scheduler-system`

**范围**:
- Cron 表达式支持
- 定时任务管理
- 任务历史追踪
- 分布式锁 (避免重复执行)

**关键设计**:
```typescript
interface ScheduledTask {
  id: string;
  tenantId?: string;       // null = global task
  name: string;
  cronExpression: string;
  handler: string;         // 处理函数标识
  payload?: JsonObject;
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt: Date;
  timezone: string;
}

interface TaskExecution {
  id: string;
  taskId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'success' | 'failed';
  result?: JsonObject;
  error?: string;
}
```

**API 端点**:
- `scheduler.create(name, cron, handler, options)`
- `scheduler.list()`
- `scheduler.enable(id)` / `scheduler.disable(id)`
- `scheduler.runNow(id)`
- `scheduler.history(id)`

**依赖**: Queue System (任务执行)

**工作量估计**: 2 天

---

#### 2.3 Hook 系统扩展

**OpenSpec ID**: `enhance-hook-system`

**范围**:
- Transform Hooks (插件可修改数据)
- Decision Hooks (Core 内部决策点)
- Side-Effect Hooks (插件副作用)
- Hook 优先级和顺序
- 执行超时保护

**关键设计**:
```typescript
type HookType = 'transform' | 'decision' | 'side-effect';

interface HookDefinition {
  id: string;
  name: string;           // e.g., "content.beforeCreate"
  type: HookType;
  description: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
}

interface HookHandler {
  hookId: string;
  pluginId: string;
  priority: number;       // 执行顺序
  handler: string;        // 函数标识
  timeout: number;        // 超时时间 ms
  enabled: boolean;
}
```

**Hook 类型规则**:
- `transform`: 可修改输入/输出，必须同步返回
- `decision`: 仅 Core 内部使用，返回 boolean
- `side-effect`: 异步执行，不阻塞主流程，无返回值

**依赖**: Plugin System, Event Bus

**工作量估计**: 2-3 天

---

#### 2.4 搜索引擎集成 (Search Engine Integration) [Optional/Deferred]

**OpenSpec ID**: `core-search-engine`

**范围**:
- 搜索引擎抽象层 (Abstract Search Provider)
- 适配器 (Postgres Full-text, Elasticsearch, Meilisearch)
- 索引管理
- 统一查询语法

**关键设计**:
```typescript
interface SearchProvider {
  indexDocument(index: string, id: string, doc: JsonObject): Promise<void>;
  search(index: string, query: SearchQuery): Promise<SearchResult>;
  deleteDocument(index: string, id: string): Promise<void>;
}
```

**依赖**: Connection/Config System

**实施策略**:
- **Phase 1**: 默认实现 Postgres Full-text Search (足以支撑 MVP)
- **Phase 2**: Meilisearch / Elasticsearch 作为可插拔 Provider

**工作量估计**: 3 天 (Full implementation)

---

### Phase 3: 插件生态能力

#### 3.1 插件通知 API (Task 13-17)

**OpenSpec ID**: `plugin-notification-api`

**范围**:
- PluginNotificationAPI.send()
- Manifest 通知配置验证
- 插件级限流
- 用户级限流
- Webhook 回调 (onClicked, onArchived)

**依赖**: Webhook System, Settings System, Queue System

**工作量估计**: 3-4 天

---

#### 3.2 API Token 系统

**OpenSpec ID**: `core-api-token-system`

**范围**:
- API Token 生成/管理
- Scope 权限控制
- Token 过期和轮换
- 使用统计

**关键设计**:
```typescript
interface ApiToken {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  tokenHash: string;      // bcrypt hash
  scopes: string[];       // ["read:content", "write:content"]
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
}
```

**依赖**: Permission System

**工作量估计**: 2 天

---

## 依赖关系图

```
Phase 1 (基础设施)
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Settings System │    │ File/Asset Sys  │    │ Observability   │
│ (核心配置)       │◄───│ (存储配置依赖)   │    │ (日志/监控)      │
└────────┬────────┘    └────────┬────────┘    └─────────────────┘
         │                      │
         │                      │             ┌─────────────────┐
         │                      │             │ Universal Cache │
         │                      │             │ (通用缓存)       │
         │                      │             └────────┬────────┘
         └──────────┬───────────┴──────────────────────┘
                    │
Phase 2 (扩展能力)  │
         ┌──────────┴───────────┐
         │                      │
┌────────▼────────┐    ┌────────▼────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Webhook System  │    │ Scheduler Sys   │    │ Hook System Ext │    │ Search Engine   │
│ (事件推送)       │    │ (定时任务)       │    │ (插件扩展点)     │    │ (高级搜索)       │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘    └─────────────────┘
         │                      │                      │
         └──────────────────────┴──────────────────────┘
                                │
Phase 3 (插件生态)              │
         ┌──────────────────────┴──────────────────────┘
         │                                             │
┌────────▼────────┐                           ┌────────▼────────┐
│ Plugin Notif API│                           │ API Token Sys   │
│ (Task 13-17)    │                           │ (第三方集成)     │
└─────────────────┘                           └─────────────────┘
```

---

## 里程碑规划

### Milestone 1: Core Infrastructure (Phase 1)
- [ ] Settings System
- [ ] File/Asset System
- [ ] Core Observability
- [ ] Universal Cache

### Milestone 1.5: Production Safety (Phase 1.5)
- [ ] **Core Audit System** (MUST)
- [ ] Rate Limiting (Optional)

### Milestone 2: Extension Capabilities (Phase 2)
- [ ] Webhook System
- [ ] Scheduler System
- [ ] Hook System Enhancement
- [ ] Search Engine Integration

### Milestone 3: Plugin Ecosystem (Phase 3)
- [ ] Plugin Notification API (Task 13-17)
- [ ] API Token System

---

## 下一步

1. 确认路线图优先级
2. 为 Phase 1 的两个系统创建 OpenSpec
3. 逐一实现

---

## 附录：dsneo 功能映射

| dsneo 功能 | 依赖的核心系统 |
|-----------|---------------|
| 商品图片上传 | File/Asset System |
| SKU 图片管理 | File/Asset System |
| 供应商数据同步 | Scheduler, Queue, Webhook |
| 价格监控定时任务 | Scheduler |
| 订单变更通知 | Notification, Webhook |
| 插件配置存储 | Settings System |
| API 对接 | API Token, Webhook |
