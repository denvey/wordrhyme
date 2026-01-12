## Context

WordRhyme 是一个多租户 SaaS 平台，需要支持三层配置：
1. **Global** - 平台管理员控制的全局配置
2. **Tenant** - 每个组织的独立配置
3. **Plugin** - 插件的私有配置（同时支持 Global 和 Tenant 级别）

系统需要处理敏感数据（API 密钥、密码），支持配置变更审计，并与现有的权限系统集成。

### Stakeholders
- 平台管理员 - 管理全局配置
- 租户管理员 - 管理组织配置
- 插件开发者 - 存取插件配置
- 终端用户 - 通过 Feature Flags 控制功能可见性

### Constraints
- 遵循 DATA_MODEL_GOVERNANCE.md 的数据分区模型
- 配置变更需要审计
- 敏感数据必须加密存储
- 支持多租户隔离

---

## Goals / Non-Goals

### Goals
- 提供类型安全的配置 API
- 支持三层配置层级和继承
- 敏感数据加密存储
- Feature Flags 支持灰度发布
- 配置变更审计
- 完整的权限控制

### Non-Goals
- 实时配置推送（WebSocket）- 后续版本
- 配置版本控制 / 回滚 - 后续版本
- 配置导入导出 - 后续版本
- 复杂的 Feature Flag 规则引擎 - 使用简单条件规则

---

## Decisions

### D1: 配置存储模型与字段矩阵

**Decision**: 使用单表设计，通过 `scope` + `scope_id` + `tenant_id` 组合实现多级配置

```sql
settings (
  id UUID PRIMARY KEY,
  scope ENUM('global', 'tenant', 'plugin_global', 'plugin_tenant'),
  scope_id TEXT,           -- pluginId (仅 plugin_* scope)
  tenant_id TEXT,          -- tenantId (仅 tenant 和 plugin_tenant scope)
  key TEXT,                -- 配置键
  value JSONB,             -- 配置值（加密时存储 EncryptedValue）
  value_type ENUM('string', 'number', 'boolean', 'json'),
  encrypted BOOLEAN DEFAULT false,
  schema_version INT DEFAULT 1,
  description TEXT,
  created_by TEXT,         -- userId
  updated_by TEXT,         -- userId
  created_at TIMESTAMP,
  updated_at TIMESTAMP,

  CONSTRAINT unique_setting UNIQUE(scope, scope_id, tenant_id, key)
)

-- Indexes
CREATE INDEX idx_settings_scope_key ON settings(scope, key);
CREATE INDEX idx_settings_tenant ON settings(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_settings_plugin ON settings(scope_id) WHERE scope_id IS NOT NULL;
```

#### 字段矩阵 (Field Matrix)

| Scope | scope_id | tenant_id | 说明 | 示例 |
|-------|----------|-----------|------|------|
| `global` | NULL | NULL | 平台全局配置 | email.smtp.host |
| `tenant` | NULL | 'tenant-123' | 租户级配置 | email.smtp.host override |
| `plugin_global` | 'my-plugin' | NULL | 插件全局配置 | plugin:my-plugin:api_key |
| `plugin_tenant` | 'my-plugin' | 'tenant-123' | 插件租户配置 | plugin:my-plugin:enabled |

#### 唯一性约束

- `(scope, scope_id, tenant_id, key)` 确保同一级别下 key 唯一
- NULL 值参与唯一性比较（PostgreSQL 默认行为需要处理）

```sql
-- 使用 COALESCE 处理 NULL
CREATE UNIQUE INDEX idx_settings_unique ON settings(
  scope,
  COALESCE(scope_id, ''),
  COALESCE(tenant_id, ''),
  key
);
```

---

### D2: 配置继承策略 (Cascade Resolution)

**Decision**: 分离 Core 配置和 Plugin 配置的继承链

#### Core 配置继承链
```
Tenant → Global → Default
```

#### Plugin 配置继承链
```
plugin_tenant → plugin_global → (不继承 Core 配置)
```

**Rationale**:
- Plugin 配置应该完全隔离，不应该 fallback 到 Core 配置
- 避免插件意外读取到 Core 的敏感配置

**Resolution Logic**:

```typescript
async function resolveCoreSetting(key: string, tenantId?: string): Promise<unknown> {
  // 1. Tenant override
  if (tenantId) {
    const tenant = await getSetting('tenant', null, tenantId, key);
    if (tenant !== null) return tenant;
  }

  // 2. Global
  const global = await getSetting('global', null, null, key);
  if (global !== null) return global;

  // 3. Schema default
  return getSchemaDefault(key);
}

async function resolvePluginSetting(
  pluginId: string,
  key: string,
  tenantId?: string
): Promise<unknown> {
  // 1. Plugin tenant override
  if (tenantId) {
    const pluginTenant = await getSetting('plugin_tenant', pluginId, tenantId, key);
    if (pluginTenant !== null) return pluginTenant;
  }

  // 2. Plugin global
  const pluginGlobal = await getSetting('plugin_global', pluginId, null, key);
  if (pluginGlobal !== null) return pluginGlobal;

  // 3. Return null (不 fallback 到 Core)
  return null;
}
```

---

### D3: 敏感数据加密与密钥轮换

**Decision**: 使用 AES-256-GCM + 多密钥版本支持

#### 加密值结构
```typescript
interface EncryptedValue {
  ciphertext: string;   // Base64 encoded
  iv: string;           // 12 bytes, Base64
  authTag: string;      // 16 bytes, Base64
  keyVersion: number;   // 密钥版本号
}
```

#### 密钥管理

```typescript
// 环境变量配置
SETTINGS_ENCRYPTION_KEYS={
  "1": "base64-key-v1...",
  "2": "base64-key-v2...",
  "current": 2
}
```

**密钥轮换流程**:
1. 添加新密钥版本到环境变量
2. 更新 `current` 指向新版本
3. 新写入使用新密钥
4. 后台任务批量重新加密旧数据（可选）
5. 所有数据迁移后移除旧密钥

#### 加密策略

| 数据类型 | 加密策略 |
|----------|----------|
| String (encrypted=true) | 整个值加密 |
| JSON (encrypted=true) | 整个 JSON 序列化后加密 |
| 部分字段加密 | 不支持，使用多个 key 分离敏感和非敏感部分 |

#### 防泄露措施

```typescript
// 1. 日志过滤
logger.info('Setting updated', {
  key,
  value: encrypted ? '[ENCRYPTED]' : value
});

// 2. 缓存存储加密值，解密在内存中进行
cache.set(cacheKey, encryptedValue); // 不缓存解密后的值

// 3. 审计日志不记录敏感值
auditLog.record({
  key,
  oldValue: encrypted ? '[REDACTED]' : oldValue,
  newValue: encrypted ? '[REDACTED]' : newValue,
});
```

---

### D4: Feature Flags 设计

**Decision**: 全局定义 + 租户覆盖模式

Feature Flags 是**平台级定义**，但支持**租户级覆盖**。

```sql
feature_flags (
  id UUID PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT false,
  rollout_percentage INT DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  conditions JSONB DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

feature_flag_overrides (
  id UUID PRIMARY KEY,
  flag_id UUID REFERENCES feature_flags(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  rollout_percentage INT CHECK (rollout_percentage BETWEEN 0 AND 100),
  conditions JSONB,  -- 可选覆盖条件
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(flag_id, tenant_id)
)

-- Index for tenant lookups
CREATE INDEX idx_ff_overrides_tenant ON feature_flag_overrides(tenant_id);
```

#### 评估逻辑

```typescript
async function checkFeatureFlag(
  key: string,
  context: { tenantId: string; userId: string; userRole: string; }
): Promise<boolean> {
  const flag = await getFlag(key);
  if (!flag) return false;

  // 1. 检查租户覆盖
  const override = await getFlagOverride(flag.id, context.tenantId);
  if (override) {
    // 使用覆盖的配置
    return evaluateFlag({
      enabled: override.enabled,
      rolloutPercentage: override.rollout_percentage ?? flag.rollout_percentage,
      conditions: override.conditions ?? flag.conditions,
    }, context);
  }

  // 2. 使用全局配置
  return evaluateFlag(flag, context);
}

function evaluateFlag(config: FlagConfig, context: EvalContext): boolean {
  if (!config.enabled) return false;

  // 检查条件规则
  for (const condition of config.conditions) {
    if (!evaluateCondition(condition, context)) return false;
  }

  // 检查 rollout percentage (基于 userId 的一致性 hash)
  const hash = murmurhash3(context.userId + config.key) % 100;
  return hash < config.rolloutPercentage;
}
```

---

### D5: 通用审计系统

**Decision**: 使用平台级通用审计表 `audit_events`，供 Settings、Permissions、Users 等模块复用

```sql
audit_events (
  id UUID PRIMARY KEY,

  -- Entity identification
  entity_type TEXT NOT NULL,       -- 'setting', 'user', 'role', 'feature_flag', etc.
  entity_id TEXT,                  -- 实体 ID (可为 NULL，如批量删除)

  -- Multi-tenancy
  tenant_id TEXT,                  -- NULL for global operations

  -- Action
  action TEXT NOT NULL,            -- 'create', 'update', 'delete', 'login', 'logout', etc.

  -- Changes (flexible structure)
  changes JSONB,                   -- { old: {...}, new: {...} } or custom structure
  metadata JSONB,                  -- 额外上下文 (如 setting key, encrypted flag)

  -- Actor
  actor_id TEXT NOT NULL,
  actor_type TEXT DEFAULT 'user', -- 'user', 'system', 'plugin', 'api_token'
  actor_ip TEXT,

  -- Correlation
  request_id TEXT,                 -- 请求追踪 ID
  session_id TEXT,

  -- Timestamp
  created_at TIMESTAMP DEFAULT NOW()
)

-- Indexes for common queries
CREATE INDEX idx_audit_entity ON audit_events(entity_type, entity_id);
CREATE INDEX idx_audit_tenant ON audit_events(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_audit_actor ON audit_events(actor_id);
CREATE INDEX idx_audit_time ON audit_events(created_at);
CREATE INDEX idx_audit_action ON audit_events(entity_type, action);
```

#### AuditService 接口

```typescript
interface AuditEvent {
  entityType: string;
  entityId?: string;
  tenantId?: string;
  action: string;
  changes?: { old?: unknown; new?: unknown };
  metadata?: Record<string, unknown>;
}

@Injectable()
class AuditService {
  async log(event: AuditEvent): Promise<void> {
    const ctx = this.als.getStore();
    await this.db.insert(auditEvents).values({
      ...event,
      actorId: ctx?.userId ?? 'system',
      actorType: ctx?.actorType ?? 'system',
      actorIp: ctx?.ip,
      requestId: ctx?.requestId,
      sessionId: ctx?.sessionId,
      createdAt: new Date(),
    });
  }

  async query(filters: AuditQueryFilters): Promise<AuditEvent[]> {
    // 支持按 entityType, tenantId, actorId, timeRange 查询
  }
}
```

#### Settings 使用示例

```typescript
// SettingsService 中使用 AuditService
async setSetting(scope: Scope, key: string, value: unknown, options: SetOptions) {
  const existing = await this.get(scope, key, options);

  // ... 存储逻辑 ...

  // 记录审计
  await this.auditService.log({
    entityType: 'setting',
    entityId: setting.id,
    tenantId: options.tenantId,
    action: existing ? 'update' : 'create',
    changes: {
      old: existing ? (existing.encrypted ? '[REDACTED]' : existing.value) : null,
      new: options.encrypted ? '[REDACTED]' : value,
    },
    metadata: {
      scope,
      key,
      encrypted: options.encrypted ?? false,
    },
  });
}
```

#### 审计保留策略
- 默认保留 90 天
- 可通过 `settings.audit.retention_days` 配置
- 定期清理任务按 `entity_type` 分别处理
- 合规性要求可延长特定类型的保留期

---

### D6: 权限模型

**Decision**: 基于现有 CASL 权限系统，定义新的 capability

#### Capabilities

| Capability | 描述 | 典型角色 |
|------------|------|----------|
| `settings:read:global` | 读取全局配置 | Super Admin |
| `settings:write:global` | 写入全局配置 | Super Admin |
| `settings:read:tenant` | 读取租户配置 | Tenant Admin, Owner |
| `settings:write:tenant` | 写入租户配置 | Tenant Admin, Owner |
| `feature-flags:read` | 查看功能开关 | All authenticated |
| `feature-flags:manage` | 管理功能开关 | Super Admin |
| `feature-flags:override:tenant` | 设置租户覆盖 | Super Admin, Tenant Admin |

#### API 权限映射

```typescript
// tRPC Router 权限检查
const settingsRouter = router({
  // 需要 settings:read:global 或 settings:read:tenant
  get: protectedProcedure
    .input(z.object({ scope: z.enum([...]), key: z.string() }))
    .use(requirePermission(ctx => {
      if (ctx.input.scope === 'global') return 'settings:read:global';
      if (ctx.input.scope === 'tenant') return 'settings:read:tenant';
      // plugin scopes 由 PluginSettingsAPI 处理
    }))
    .query(...),

  set: protectedProcedure
    .use(requirePermission(ctx => {
      if (ctx.input.scope === 'global') return 'settings:write:global';
      if (ctx.input.scope === 'tenant') return 'settings:write:tenant';
    }))
    .mutation(...),
});
```

#### Plugin Settings 权限
- 插件只能访问自己的 namespace (`plugin:{pluginId}:*`)
- 通过 `PluginContext.settings` API 自动限制
- 不需要额外的 capability 声明

---

### D7: Schema 版本与类型验证

**Decision**: Key-level schema 注册 + 版本控制

```sql
setting_schemas (
  id UUID PRIMARY KEY,
  key_pattern TEXT NOT NULL,  -- 支持通配符，如 "email.*" 或 "plugin:*:api_key"
  schema JSONB NOT NULL,      -- JSON Schema
  version INT NOT NULL DEFAULT 1,
  default_value JSONB,
  description TEXT,
  deprecated BOOLEAN DEFAULT false,
  created_at TIMESTAMP,

  UNIQUE(key_pattern, version)
)
```

#### Schema 匹配逻辑

```typescript
function findSchema(key: string): SettingSchema | null {
  // 1. 精确匹配
  const exact = schemas.find(s => s.key_pattern === key && !s.deprecated);
  if (exact) return exact;

  // 2. 通配符匹配 (最具体的优先)
  const wildcards = schemas
    .filter(s => !s.deprecated && matchWildcard(s.key_pattern, key))
    .sort((a, b) => specificity(b.key_pattern) - specificity(a.key_pattern));

  return wildcards[0] ?? null;
}
```

#### 验证流程

```typescript
async function setSetting(key: string, value: unknown, options: SetOptions) {
  const schema = findSchema(key);

  if (schema) {
    // 验证类型
    const valid = ajv.validate(schema.schema, value);
    if (!valid) {
      throw new ValidationError(`Invalid value for ${key}: ${ajv.errorsText()}`);
    }
  }

  // 存储时记录 schema_version
  await db.insert(settings).values({
    ...data,
    schema_version: schema?.version ?? 1,
  });
}
```

#### Schema 迁移

```typescript
// 当 schema 版本变更时，可选择性迁移现有数据
async function migrateSettings(keyPattern: string, fromVersion: number, toVersion: number) {
  const affected = await db.select()
    .from(settings)
    .where(and(
      sql`key LIKE ${keyPattern.replace('*', '%')}`,
      eq(settings.schema_version, fromVersion)
    ));

  for (const setting of affected) {
    const migrated = await migrateValue(setting.value, fromVersion, toVersion);
    await db.update(settings)
      .set({ value: migrated, schema_version: toVersion })
      .where(eq(settings.id, setting.id));
  }
}
```

---

### D8: 缓存策略

**Decision**: 两级缓存 (内存 + Redis) + Write-through 失效

```typescript
interface CacheConfig {
  memory: {
    maxSize: 1000,        // 最多缓存 1000 个 key
    ttl: 60_000,          // 1 分钟内存 TTL
  },
  redis: {
    ttl: 300_000,         // 5 分钟 Redis TTL
    prefix: 'settings:',
  }
}
```

#### 读取流程

```typescript
async function getSetting(scope, scopeId, tenantId, key): Promise<unknown> {
  const cacheKey = buildCacheKey(scope, scopeId, tenantId, key);

  // 1. 内存缓存
  const memCached = memoryCache.get(cacheKey);
  if (memCached !== undefined) return memCached;

  // 2. Redis 缓存 (存储加密值)
  const redisCached = await redis.get(cacheKey);
  if (redisCached) {
    const value = JSON.parse(redisCached);
    memoryCache.set(cacheKey, value);
    return value;
  }

  // 3. 数据库
  const dbValue = await db.query.settings.findFirst({ where: ... });
  if (dbValue) {
    const decrypted = dbValue.encrypted ? decrypt(dbValue.value) : dbValue.value;

    // 缓存解密后的值到内存，加密值到 Redis
    memoryCache.set(cacheKey, decrypted);
    await redis.set(cacheKey, JSON.stringify(dbValue.value), 'EX', 300);

    return decrypted;
  }

  return null;
}
```

#### 写入失效

```typescript
async function setSetting(...) {
  // 1. 写入数据库
  await db.upsert(settings).values(data);

  // 2. 失效缓存
  const cacheKey = buildCacheKey(...);
  memoryCache.delete(cacheKey);
  await redis.del(cacheKey);

  // 3. 集群广播失效 (PM2 场景)
  await redis.publish('settings:invalidate', JSON.stringify({ key: cacheKey }));
}

// 订阅失效事件
redis.subscribe('settings:invalidate', (message) => {
  const { key } = JSON.parse(message);
  memoryCache.delete(key);
});
```

#### Feature Flags 缓存
- 使用更短的 TTL (30 秒)
- 或完全不缓存（每次查询数据库）
- 取决于性能需求

---

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 加密密钥泄露 | 环境变量 + 密钥轮换 + 监控异常访问 |
| 配置膨胀 | 添加 TTL / 清理策略（后续版本） |
| 缓存不一致 | Write-through + Redis Pub/Sub 广播 |
| Schema 变更困难 | 版本控制 + 迁移工具 |
| 审计表膨胀 | 90 天保留 + 按 entity_type 清理 |

---

## Migration Plan

### Phase 1: 基础设施
1. 创建 `audit_events` 表 (通用审计)
2. 实现 `AuditService`
3. 创建 `settings`, `setting_schemas` 表

### Phase 2: Settings Core
1. 实现 `EncryptionService`
2. 实现 `SettingsService` (无缓存版本)
3. 集成 AuditService

### Phase 3: Feature Flags
1. 创建 `feature_flags`, `feature_flag_overrides` 表
2. 实现 `FeatureFlagService`
3. 添加 tRPC API

### Phase 4: 插件集成
1. 扩展 `PluginContext`
2. 实现 `PluginSettingsAPI`

### Phase 5: 性能优化
1. 添加缓存层
2. 添加 Redis Pub/Sub 失效

### Rollback
- 删除新表（无数据依赖）
- 回退代码变更
- 恢复环境变量配置
- 注意：`audit_events` 表可能被其他模块使用，需确认依赖

---

## Open Questions

1. ~~是否需要配置变更通知机制？~~ → 暂不需要，后续版本考虑
2. ~~Feature Flag 是否需要更复杂的规则引擎？~~ → 先用简单条件规则
3. ~~Scope/tenant 模型是否清晰？~~ → 已明确四种 scope 和字段矩阵
4. ~~Plugin 配置是否继承 Core 配置？~~ → 不继承，完全隔离
