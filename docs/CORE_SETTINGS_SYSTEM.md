# Core Settings System

> **[User Guide](./CORE_SETTINGS_GUIDE.md)**: For usage instructions and Admin UI documentation.

> 核心配置系统 - 支持多租户、加密存储、Feature Flags 的企业级配置管理

## 概述

Core Settings System 是 WordRhyme 平台的配置管理基础设施，提供：

- **四层配置模型**: Global → Tenant → Plugin Global → Plugin Tenant
- **敏感数据加密**: AES-256-GCM + 密钥轮换支持
- **Feature Flags**: 全局定义 + 租户覆盖
- **Schema 验证**: JSON Schema + 通配符模式匹配
- **两级缓存**: 内存 (L1) + Redis (L2) + Pub/Sub 失效
- **审计日志**: 所有配置变更自动记录

---

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         tRPC API Layer                          │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │   settings.router   │  │     featureFlags.router          │  │
│  └──────────┬──────────┘  └───────────────┬──────────────────┘  │
└─────────────┼─────────────────────────────┼─────────────────────┘
              │                             │
              ▼                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Service Layer                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────────┐  │
│  │ SettingsService │ │FeatureFlagServ. │ │SchemaRegistrySvc. │  │
│  └────────┬────────┘ └────────┬────────┘ └─────────┬─────────┘  │
│           │                   │                    │            │
│  ┌────────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐   │
│  │EncryptionService│ │SettingsCacheSvc.│ │  AuditService   │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Database Layer                             │
│  ┌─────────────┐ ┌─────────────────┐ ┌─────────────────────┐   │
│  │  settings   │ │ setting_schemas │ │   feature_flags     │   │
│  └─────────────┘ └─────────────────┘ └─────────────────────┘   │
│  ┌─────────────────────┐ ┌───────────────────────────────┐     │
│  │feature_flag_overrides│ │       audit_events           │     │
│  └─────────────────────┘ └───────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 配置层级模型

### 四种 Scope

| Scope | scope_id | tenant_id | 说明 | 示例 |
|-------|----------|-----------|------|------|
| `global` | NULL | NULL | 平台全局配置 | `email.smtp.host` |
| `tenant` | NULL | 'tenant-123' | 租户级配置 | `email.smtp.host` override |
| `plugin_global` | 'my-plugin' | NULL | 插件全局配置 | `plugin:my-plugin:api_key` |
| `plugin_tenant` | 'my-plugin' | 'tenant-123' | 插件租户配置 | `plugin:my-plugin:enabled` |

### 级联解析

**Core 配置继承链:**
```
Tenant → Global → Schema Default → Provided Default
```

**Plugin 配置继承链:**
```
plugin_tenant → plugin_global → null (不继承 Core)
```

---

## 使用指南

### 1. 服务端 API (NestJS)

#### 注入服务

```typescript
import { SettingsService, FeatureFlagService } from '../settings/index.js';

@Injectable()
export class MyService {
  constructor(
    private readonly settings: SettingsService,
    private readonly featureFlags: FeatureFlagService,
  ) {}
}
```

#### 读取配置

```typescript
// 读取全局配置
const smtpHost = await this.settings.get('global', 'email.smtp.host');

// 读取租户配置 (自动级联)
const smtpHost = await this.settings.get('tenant', 'email.smtp.host', {
  tenantId: 'tenant-123',
});

// 带默认值
const timeout = await this.settings.get('global', 'api.timeout', {
  defaultValue: 30000,
});
```

#### 写入配置

```typescript
// 普通配置
await this.settings.set('global', 'email.smtp.host', 'smtp.example.com');

// 加密配置 (敏感数据)
await this.settings.set('global', 'email.smtp.password', 'secret123', {
  encrypted: true,
  description: 'SMTP password',
});

// 租户配置
await this.settings.set('tenant', 'theme.primaryColor', '#3B82F6', {
  tenantId: 'tenant-123',
});
```

#### 列出配置

```typescript
// 列出所有全局配置
const allGlobal = await this.settings.list('global');

// 按前缀过滤
const emailSettings = await this.settings.list('global', {
  keyPrefix: 'email.',
});
```

### 2. Feature Flags

#### 检查开关状态

```typescript
// 简单检查
const enabled = await this.featureFlags.check('new-dashboard', {
  tenantId: 'tenant-123',
  userId: 'user-456',
});

// 详细信息
const result = await this.featureFlags.checkWithDetails('new-dashboard', {
  tenantId: 'tenant-123',
  userId: 'user-456',
});
// result: { enabled: true, source: 'override', rolloutPercentage: 50 }
```

#### 管理开关

```typescript
// 创建
await this.featureFlags.create({
  key: 'new-dashboard',
  name: 'New Dashboard',
  enabled: false,
  rolloutPercentage: 10,
  conditions: [
    { field: 'userRole', operator: 'in', value: ['admin', 'beta'] }
  ],
});

// 设置租户覆盖
await this.featureFlags.setOverride('new-dashboard', 'tenant-123', {
  enabled: true,
  rolloutPercentage: 100,
});
```

### 3. tRPC API (前端调用)

#### Settings API

```typescript
// 读取
const { value } = await trpc.settings.get.query({
  scope: 'global',
  key: 'email.smtp.host',
});

// 写入
await trpc.settings.set.mutate({
  scope: 'tenant',
  key: 'theme.primaryColor',
  value: '#3B82F6',
  tenantId: 'tenant-123',
});

// 列出
const { settings } = await trpc.settings.list.query({
  scope: 'global',
  keyPrefix: 'email.',
});
```

#### Feature Flags API

```typescript
// 检查
const { enabled } = await trpc.featureFlags.check.query({
  key: 'new-dashboard',
});

// 列出所有
const { flags } = await trpc.featureFlags.list.query();

// 管理 (需要权限)
await trpc.featureFlags.create.mutate({
  key: 'experimental-feature',
  name: 'Experimental Feature',
  enabled: false,
});
```

### 4. 插件 API

插件通过 `PluginContext.settings` 访问配置：

```typescript
// plugin/src/index.ts
import { definePlugin } from '@wordrhyme/plugin';

export default definePlugin({
  id: 'my-plugin',

  async onEnable(ctx) {
    // 读取插件配置
    const apiKey = await ctx.settings.get<string>('api_key');

    // 写入配置
    await ctx.settings.set('last_sync', new Date().toISOString());

    // 加密存储
    await ctx.settings.set('secret_token', 'xxx', { encrypted: true });

    // 检查 Feature Flag
    const betaEnabled = await ctx.settings.isFeatureEnabled('beta-features');
  },
});
```

---

## Schema 验证

### 注册 Schema

```typescript
import { SchemaRegistryService } from '../settings/index.js';

@Injectable()
export class SettingsInitService implements OnModuleInit {
  constructor(private readonly schemaRegistry: SchemaRegistryService) {}

  async onModuleInit() {
    // 精确匹配
    await this.schemaRegistry.register({
      keyPattern: 'email.smtp.port',
      schema: {
        type: 'number',
        minimum: 1,
        maximum: 65535,
      },
      defaultValue: 587,
      description: 'SMTP server port',
    });

    // 通配符匹配
    await this.schemaRegistry.register({
      keyPattern: 'email.*',
      schema: { type: 'string' },
      description: 'Email settings (string)',
    });

    // 插件配置模式
    await this.schemaRegistry.register({
      keyPattern: 'plugin:*:api_key',
      schema: { type: 'string', minLength: 10 },
      description: 'Plugin API keys',
    });
  }
}
```

### 通配符语法

| Pattern | 匹配示例 | 说明 |
|---------|----------|------|
| `email.smtp.host` | `email.smtp.host` | 精确匹配 |
| `email.*` | `email.smtp`, `email.from` | 匹配单个段 |
| `email.**` | `email.smtp.host.value` | 匹配多个段 |
| `plugin:*:api_key` | `plugin:my-plugin:api_key` | 冒号分隔符 |

---

## 权限模型

| Capability | 描述 | 典型角色 |
|------------|------|----------|
| `settings:read:global` | 读取全局配置 | Super Admin |
| `settings:write:global` | 写入全局配置 | Super Admin |
| `settings:read:tenant` | 读取租户配置 | Tenant Admin, Owner |
| `settings:write:tenant` | 写入租户配置 | Tenant Admin, Owner |
| `feature-flags:read` | 查看功能开关 | All authenticated |
| `feature-flags:manage` | 管理功能开关 | Super Admin |
| `feature-flags:override:tenant` | 设置租户覆盖 | Super Admin, Tenant Admin |

---

## 加密配置

### 环境变量

```bash
# 加密密钥配置 (JSON 格式)
SETTINGS_ENCRYPTION_KEYS='{"1":"base64-encoded-key-v1","2":"base64-encoded-key-v2","current":2}'
```

### 密钥轮换流程

1. 生成新密钥并添加到环境变量
2. 更新 `current` 指向新版本
3. 新写入使用新密钥
4. (可选) 批量重新加密旧数据
5. 移除旧密钥

---

## 缓存策略

### 配置

```typescript
// 内存缓存
memory: {
  maxSize: 1000,     // 最多 1000 个 key
  ttl: 60_000,       // 1 分钟 TTL
}

// Redis 缓存
redis: {
  ttl: 300_000,      // 5 分钟 TTL
  prefix: 'settings:',
}
```

### 失效机制

- **Write-through**: 写入时立即失效缓存
- **Pub/Sub**: Redis 广播失效事件到所有实例
- **Pattern Invalidation**: 支持通配符批量失效

---

## 数据库 Schema

### settings 表

```sql
CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,           -- 'global'|'tenant'|'plugin_global'|'plugin_tenant'
  scope_id TEXT,                 -- pluginId (plugin scopes only)
  tenant_id TEXT,                -- tenantId (tenant scopes only)
  key TEXT NOT NULL,
  value JSONB,
  value_type TEXT DEFAULT 'string',
  encrypted BOOLEAN DEFAULT false,
  schema_version INT DEFAULT 1,
  description TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_settings_unique ON settings(
  scope,
  COALESCE(scope_id, ''),
  COALESCE(tenant_id, ''),
  key
);
```

### feature_flags 表

```sql
CREATE TABLE feature_flags (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT false,
  rollout_percentage INT DEFAULT 100,
  conditions JSONB DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE feature_flag_overrides (
  id TEXT PRIMARY KEY,
  flag_id TEXT REFERENCES feature_flags(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  rollout_percentage INT,
  conditions JSONB,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(flag_id, tenant_id)
);
```

---

## 文件结构

```
apps/server/src/
├── settings/
│   ├── index.ts                    # 模块导出
│   ├── settings.module.ts          # NestJS 模块
│   ├── settings.service.ts         # 核心设置服务
│   ├── feature-flag.service.ts     # Feature Flags 服务
│   ├── encryption.service.ts       # 加密服务
│   ├── cache.service.ts            # 两级缓存服务
│   └── schema-registry.service.ts  # Schema 验证服务
├── trpc/routers/
│   ├── settings.ts                 # Settings tRPC 路由
│   └── feature-flags.ts            # Feature Flags tRPC 路由
├── plugins/capabilities/
│   └── settings.capability.ts      # 插件设置能力
└── db/schema/
    ├── settings.ts                 # 设置表定义
    └── feature-flags.ts            # Feature Flags 表定义
```

---

## 测试

```bash
# 运行设置系统测试
pnpm --filter @wordrhyme/server test -- --run src/__tests__/settings/

# 输出
# ✓ src/__tests__/settings/schema-registry.test.ts (12 tests)
# ✓ src/__tests__/settings/encryption.service.test.ts (21 tests)
# Test Files: 2 passed (2)
# Tests: 33 passed (33)
```

---

## 后续规划

- [x] Admin UI 集成 (设置管理页面)
- [ ] 配置版本控制 / 回滚
- [ ] 配置导入导出
- [ ] 实时配置推送 (WebSocket)
- [ ] 更复杂的 Feature Flag 规则引擎
