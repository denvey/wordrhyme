<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 语言偏好

所有回复使用中文。

---

## Project Overview

**WordRhyme** is a Contract-First, Headless CMS with a plugin architecture. This is an **architecture documentation repository** (v0.1) - the actual implementation codebase is separate.

**Core Philosophy**:
- "Contract-First" - all contracts are frozen and must be followed
- "Modular Monolith" not microservices
- Plugins extend via defined boundaries, never modify Core
- Rolling reload deployment (no runtime hot-swapping)

---

## Architecture Status

**FROZEN (v0.1)** - All breaking changes require version upgrade. No implicit adjustments allowed.

The architecture is defined through governance documents that form a strict hierarchy. **Never suggest changes that violate these contracts.**

---

## Documentation Architecture (Critical)

### Navigation Hierarchy

All documents follow a strict precedence order:

**Level 0 - Constitutional Law:**
- `SYSTEM_INVARIANTS.md` - Non-negotiable system rules (highest authority)
- `CORE_DOMAIN_CONTRACT.md` - Core boundary definition

**Level 1 - Core Governance:**
- `PLUGIN_CONTRACT.md` - Plugin system boundaries
- `PERMISSION_GOVERNANCE.md` - Authorization model
- `RUNTIME_GOVERNANCE.md` - Plugin execution rules
- `EVENT_HOOK_GOVERNANCE.md` - Extension protocol

**Level 2 - Business Governance:**
- `BILLING_MONETIZATION_GOVERNANCE.md` - Monetization rules
- `CAPABILITY_BILLING_MODEL.md` - Capability-based billing
- `BILLING_ENGINE_INTERFACE.md` - Billing engine contract
- `ENTITLEMENT_SYSTEM.md` - Authorization & metering system
- `PLUGIN_MARKETPLACE_GOVERNANCE.md` - Marketplace rules

**Level 3 - Cross-Cutting Concerns:**
- `GLOBALIZATION_GOVERNANCE.md` - i18n/l10n/currency
- `DATA_MODEL_GOVERNANCE.md` - Data ownership rules
- `PLUGIN_DATA_GOVERNANCE.md` - Plugin data lifecycle
- `OBSERVABILITY_GOVERNANCE.md` - Monitoring & logging

**Reference Documents:**
- `GOVERNANCE_PLAYBOOK.md` - Operational decision making
- `REFERENCE_ARCHITECTURE.md` - Architecture overview
- `CORE_BOOTSTRAP_FLOW.md` - System startup flow

### Document Location

All architecture documents are in: `docs/architecture/`

---

## Key Architectural Decisions (Frozen)

### Tech Stack
- **Backend**: NestJS + Fastify
- **ORM**: Drizzle + PostgreSQL
- **Frontend**: React + Rspack + Module Federation 2.0
- **Process**: PM2 Cluster (zero-downtime reload)
- **Cache**: Redis (control signals only, not business data)

### Plugin Model
- Plugins loaded at **startup only** (via rolling reload)
- No runtime hot-swapping
- Plugins depend on `@wordrhyme/plugin-api` (never on Core directly)
- Core **never** reverse-depends on plugins
- `/plugins` directory must be shared storage (NFS/NAS)

### Permission Model
- Shopify-inspired capability-based model
- Centralized in Permission Kernel (not in plugins)
- Plugins declare permissions in manifest
- Authorization happens **before** execution
- Three actors: User / Plugin / System

### Multi-Tenancy
- All permissions bound to Tenant/Workspace
- No global permissions
- Cross-tenant access forbidden
- Plugin data isolated per tenant

---

## Critical Constraints

### What Plugins CANNOT Do (Hard Bans)

From `SYSTEM_INVARIANTS.md` and contracts:

- ❌ Modify Core state directly
- ❌ Access other plugins' data
- ❌ Bypass permissions
- ❌ Cache permission results
- ❌ Assume execution order
- ❌ Modify Core tables
- ❌ Create global mutable state
- ❌ Self-authorize
- ❌ Block Core execution
- ❌ Assume runtime environment (must work in Node/Edge/WASM)

### Plugin Lifecycle Rules

1. Install → Extract to `/plugins/{pluginId}`
2. Validate `plugin.json`
3. Update DB status
4. Redis broadcast `RELOAD_APP`
5. PM2 Rolling Reload all nodes
6. Scan and load plugins on startup

**变更生效时机（分级）**：
- **代码/Manifest 变更**（Install/Update/Uninstall）：仅在 PM2 Rolling Reload 后生效
- **配置/激活变更**（Settings 修改、Theme 切换、功能开关）：即时生效，无需重启
- 判断标准：是否涉及文件系统操作或内存中模块替换

---

## Permission System Rules

From `PERMISSION_GOVERNANCE.md`:

- **White-list model**: Undeclared capability = forbidden
- **Centralized**: Only Core decides allow/deny
- **Scope hierarchy**: instance → organization → space → project
- **Plugin permissions** must use namespace: `plugin:{pluginId}:{action}`
- **Capability format**: `resource:action:scope`
- Plugins are always "审查对象" (审计 subjects), never authorities

---

## Billing & Monetization Rules

From billing governance docs:

- **Capability ≠ Pricing**: Plugins declare capabilities, hosts set prices
- **Plan-based**: Plans grant capabilities with limits
- **Usage metering**: Atomic, auditable, immutable records
- **Plugin separation**: Plugins never see pricing/revenue
- **Runtime flow** (mandatory order):
  1. Resolve Context
  2. Load Entitlements
  3. Permission Check
  4. Usage Validation
  5. Consume Usage
  6. Execute Capability

---

## Data Model Rules

From `DATA_MODEL_GOVERNANCE.md` and `PLUGIN_DATA_GOVERNANCE.md`:

- Core tables: **Never modified by plugins**
- Plugin data: Use JSONB extensions OR plugin-private tables
- Plugin table naming: `plugin_{pluginId}_*`
- Data retention: Must declare in manifest (`onDisable`, `onUninstall`)
- No UPDATE/DELETE on `usage_records` (append-only)
- Multi-language: Use translations structure, not separate tables

---

## Globalization Rules

From `GLOBALIZATION_GOVERNANCE.md`:

- Language/Currency/Region: Configuration, not code branches
- Global Context: locale, currency, timezone, numberFormat, dateFormat, taxRegion
- Language standard: BCP 47 (`en-US`, `zh-CN`)
- Base Currency for settlement, Display Currency for presentation
- Plugins must not hardcode currencies or locales
- Translation structure:
  ```json
  {
    "title": {
      "en-US": "Product",
      "fr-FR": "Produit"
    }
  }
  ```

---

## Event & Hook Rules

From `EVENT_HOOK_GOVERNANCE.md`:

- **Events**: Broadcast facts (read-only, cannot block Core)
- **Hooks**: Controlled extension points
- Three hook types:
  1. **Side-Effect** (99% of plugins) - no return, no Core impact
  2. **Transform** (rare) - Core explicitly declared only
  3. **Decision** (forbidden for plugins) - Core internal only
- Default: Async execution
- Plugins cannot assume execution order
- Hook failures don't break Core
- **Core-Mediated Events** (§7.1): 插件可通过 Core 注册的公共事件通道通信，需满足：Core 注册 + schema 定义 + manifest 声明 + Side-Effect only + 可审计

---

## Runtime Governance

From `RUNTIME_GOVERNANCE.md`:

- **Actor Model**: Plugin actor ≠ User ≠ System
- **Resource limits**: CPU, Memory, Timeout, Task Count (all enforced)
- **Isolation levels**: Logic → Thread → Memory
- **Failure states**: transient_error → degraded → crashed
- **Quarantine**: Bad plugins isolated, not killed immediately
- Runtime must work across Node/Worker/Edge/WASM

---

## Working with This Repository

### Current State
- This is **documentation only** (architecture v0.1)
- No implementation code yet
- Focus on governance contracts and system design

### When Adding/Modifying Documents

1. **Check hierarchy**: Does change violate higher-level contracts?
2. **Version bumping**: Breaking changes require version upgrade
3. **Consistency**: Cross-reference related governance docs
4. **Frozen status**: Most docs marked "Frozen" - only clarifications allowed

### Document Consolidation

Recent cleanup (2024-12-22):
- Merged duplicate permission docs → `PERMISSION_GOVERNANCE.md`
- Merged runtime docs → `RUNTIME_GOVERNANCE.md`
- Merged marketplace docs → `PLUGIN_MARKETPLACE_GOVERNANCE.md`
- Merged entitlement docs → `ENTITLEMENT_SYSTEM.md`
- Removed: `PERMISSION_CONTRACT.md`, `Permission & Authorization Governance.md`, `Plugin Runtime & Execution Governance.md`, `MARKETPLACE_STRATEGY.md`, etc.

**Do not recreate deleted redundant documents.**

---

## Non-Goals (v0.x)

Explicitly NOT supported in v0.x:

- Runtime hot-swapping (no restarts)
- Plugin VM/sandbox isolation
- Plugins controlling Core startup
- Plugins modifying global middleware
- Plugin-to-plugin direct communication
- Dynamic permission graphs
- Cross-plugin permission dependencies

---

## Future Evolution (v1.x)

Planned but not yet:
- Plugin permission declaration enforcement
- Plugin marketplace
- Optional sandbox mechanisms
- Enhanced isolation

**Any architectural change requires**:
1. Major version bump
2. Contract updates
3. Ecosystem-wide communication

---

## Golden Rules for AI Assistance

1. **Contract Supremacy**: If implementation conflicts with contracts → contracts win
2. **No Speculation**: Don't invent features not in contracts
3. **Hierarchy Respect**: Lower docs cannot override higher docs
4. **Frozen Means Frozen**: Don't suggest "improvements" to frozen contracts
5. **Plugin Boundaries**: Always enforce plugin isolation rules
6. **Permission First**: Authorization before execution, always
7. **Multi-tenant Always**: No global state, everything tenant-scoped

---

## CRUD 开发规范 (Mandatory)

**所有新增 CRUD 功能必须使用以下模式，除非有明确理由不使用。**

### 后端：@wordrhyme/auto-crud-server

#### 零配置模式（推荐）

```typescript
// apps/server/src/trpc/routers/tasks.ts
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { tasks } from '@/db/schema';

// 🚀 零配置！Schema 自动从 table 派生
export const tasksRouter = createCrudRouter({
  table: tasks,
  // 默认排除：id, createdAt, updatedAt
});
```

#### 排除额外字段（omitFields）

```typescript
// apps/server/src/trpc/routers/i18n.ts
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { i18nLanguages } from '@/db/schema';

export const languagesRouter = createCrudRouter({
  table: i18nLanguages,
  // 排除额外字段（默认已排除 id, createdAt, updatedAt）
  omitFields: ['organizationId'],
});

// 排除更多字段示例
export const messagesRouter = createCrudRouter({
  table: i18nMessages,
  omitFields: ['organizationId', 'userModified', 'version'],
});
```

#### 集成权限系统（完整模式）

```typescript
// apps/server/src/trpc/routers/employees.ts
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { protectedProcedure } from '../trpc';
import { employees } from '@/db/schema';

export const employeesRouter = createCrudRouter({
  table: employees,
  omitFields: ['organizationId'],  // Schema 自动派生

  // 关键：使用 wordrhyme 的 protectedProcedure + meta 触发权限检查
  mode: 'factory',
  procedureFactory: (op) => {
    const action = op === 'list' || op === 'get' ? 'read' : op;
    return protectedProcedure.meta({
      permission: { action, subject: 'Employee' },
    });
  },
});
```

#### 自定义 updateSchema（高级场景）

仅当需要限制可更新字段时使用：

```typescript
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { tasks } from '@/db/schema';
import { z } from 'zod';

export const tasksRouter = createCrudRouter({
  table: tasks,
  omitFields: ['organizationId'],
  // 自定义 updateSchema（只允许更新特定字段）
  updateSchema: z.object({
    title: z.string().optional(),
    status: z.enum(['pending', 'done']).optional(),
  }),
});
```

**权限自动生效链路**：
1. `protectedProcedure.meta({ permission })` → 触发 `globalPermissionMiddleware`
2. `PermissionKernel.require(action, subject)` → 执行 RBAC 检查
3. `permissionMeta` 写入 `AsyncLocalStorage`
4. `ScopedDb` 自动应用：ABAC 条件、字段过滤、LBAC、租户隔离

### 前端：@wordrhyme/auto-crud + useCrudPermissions

```tsx
import { z } from 'zod';
import { AutoCrudTable, useAutoCrudResource } from '@wordrhyme/auto-crud';
import { useCrudPermissions } from '@/hooks/use-crud-permissions';
import { trpc } from '@/lib/trpc';

// 1. 定义 Schema
const employeeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  salary: z.number(),
});

export function EmployeesPage() {
  // 2. 获取 CRUD 资源
  const resource = useAutoCrudResource({
    router: trpc.employees,
    schema: employeeSchema,
  });

  // 3. 计算权限（从全局 AbilityProvider 获取）
  const permissions = useCrudPermissions('Employee', employeeSchema);

  // 4. 渲染 AutoCrudTable
  return (
    <AutoCrudTable
      title="员工管理"
      schema={employeeSchema}
      resource={resource}
      permissions={permissions}
    />
  );
}
```

### 权限结果结构

```typescript
interface CrudPermissions {
  can?: {
    create?: boolean;  // 新建按钮
    update?: boolean;  // 编辑按钮
    delete?: boolean;  // 删除按钮
    export?: boolean;  // 导出按钮
  };
  deny?: string[];     // 隐藏的字段列表
}
```

### 不使用此模式的合理理由

仅以下情况可以不使用：

1. **非 CRUD 页面**：纯展示页面、仪表盘等
2. **无权限系统**：公开访问的页面
3. **已有手写实现**：历史代码维护，但新功能应迁移
4. **复杂查询需求**：需要自定义 JOIN、聚合等 `createCrudRouter` 不支持的场景

**如果不使用，必须在代码注释中说明原因。**

### 行级权限控制

对于依赖行数据状态的权限（如 `row.status === 'draft'` 才能编辑），使用 `actions` 配置：

```tsx
<AutoCrudTable
  schema={employeeSchema}
  resource={resource}
  permissions={permissions}  // 全局权限：can.update = true
  actions={{
    edit: {
      // 行级权限：只有 draft 状态可编辑
      visible: (row) => row.status === 'draft',
    },
    delete: {
      visible: (row) => row.status !== 'published',
    },
  }}
/>
```

**权限叠加逻辑**：
- `permissions.can.update = false` → 所有行的编辑按钮都隐藏
- `permissions.can.update = true` + `actions.edit.visible` → 按行数据决定

### 安全边界

| 层级 | 职责 | 可信任度 |
|------|------|----------|
| **前端 useCrudPermissions** | UI 优化（按钮/列显隐） | ❌ 不可信任 |
| **后端 ScopedDb** | 强制执行字段过滤、ABAC、LBAC | ✅ 安全边界 |
| **PermissionKernel** | 权限裁决唯一中心 | ✅ Core 权威 |

> **重要**：前端隐藏可被绕过，真正的安全由后端 ScopedDb 和 PermissionKernel 保证。

### 相关文件

**前端**：
- Hook: `apps/admin/src/hooks/use-crud-permissions.ts`
- 测试: `apps/admin/src/__tests__/components/use-crud-permissions.test.tsx`
- 验证页面: `/test/permissions`

**后端**：
- protectedProcedure: `apps/server/src/trpc/trpc.ts`
- PermissionKernel: `apps/server/src/permission/permission-kernel.ts`
- ScopedDb: `apps/server/src/db/scoped-db.ts`

---

## auto-crud-server 最佳实践 (Critical)

**⚠️ 涉及 CRUD 相关代码时，必须先读取 `/docs/auto-crud-server-best-practices.md`**

### 核心原则（精简版）

1. **零配置优先**：Schema 自动从 table 派生，无需手动定义
2. **信任框架能力**：auto-crud-server 已处理查询和检查
3. **依赖数据库约束**：用唯一索引代替应用层检查
4. **全局错误处理**：统一转换数据库错误为友好消息
5. **只写业务逻辑**：middleware 只处理缓存失效、业务规则检查
6. **使用工具函数**：只有 3 个 - `afterMiddleware`、`beforeMiddleware`、`composeMiddleware`

### 快速示例

```typescript
import { createCrudRouter, afterMiddleware, beforeMiddleware } from '@wordrhyme/auto-crud-server';
import { tasks } from '@/db/schema';

// 🚀 零配置基础用法
export const tasksRouter = createCrudRouter({
  table: tasks,
});

// ✅ 排除额外字段 + middleware
export const tasksRouter = createCrudRouter({
  table: tasks,
  omitFields: ['organizationId'],  // 默认已排除 id, createdAt, updatedAt
  middleware: {
    create: afterMiddleware(async (ctx, created) => {
      await invalidateCache(created);
    }),
    update: beforeMiddleware(async (ctx, data) => {
      return { ...data, updatedBy: ctx.user.id };
    }),
  },
});
```

### 常见错误

| ❌ 错误 | ✅ 正确 |
|--------|--------|
| 手动定义 selectSchema/insertSchema/updateSchema | 零配置自动派生 |
| 手动查询检查重复 | 依赖数据库唯一索引 |
| 手动注入 `organizationId` | ScopedDb 自动注入 |
| delete 手动查询 existing | 使用 `existing` 参数 |
| `await next(input)` | `await next()` |
| 使用 `afterDelete` 等 | 只用 `afterMiddleware` |

**详细文档**：`/docs/auto-crud-server-best-practices.md`（使用时必读）
**参考实现**：`apps/server/src/trpc/routers/i18n.ts`（494 行 → 391 行，-20.9%）

---

## Zod Schema 规范 (Critical)

**⚠️ 涉及 Zod schema 定义时，必须先读取 `/docs/zod-schema-conventions.md`**

### 核心原则（精简版）

1. **单一数据源**：所有 schema 定义在 `@wordrhyme/db`，前后端共享
2. **统一导入**：从 `@wordrhyme/db` 导入，不从本地路径导入
3. **派生优先**：使用 `.pick()/.merge()/.extend()` 从 base schema 派生
4. **复用通用 schema**：分页、排序等使用 `paginationSchema` 等

### 命名规范

| 类型 | 命名模式 | 示例 |
|------|----------|------|
| Base Schema | `xxxSchema` | `settingSchema` |
| Query (单个) | `getXxxQuery` | `getSettingQuery` |
| Query (列表) | `listXxxQuery` | `listSettingsQuery` |
| Mutation | `xxxMutation` | `deleteSettingMutation` |

### Zod v4 Breaking Changes

```typescript
// ❌ 错误（Zod v3 语法）
z.record(z.string())

// ✅ 正确（Zod v4 必须两个参数）
z.record(z.string(), z.string())
```

### 常见错误

| ❌ 错误 | ✅ 正确 |
|--------|--------|
| 从本地路径导入 `@wordrhyme/db` 的类型 | 统一从 `@wordrhyme/db` 导入 |
| `z.record(z.string())` 单参数 | `z.record(z.string(), z.string())` |
| 每个 router 重复定义分页参数 | 复用 `paginationSchema` |

**详细文档**：`/docs/zod-schema-conventions.md`（使用时必读）

---

## Drizzle Query API 规范 (Critical)

**⚠️ 涉及数据库查询时，必须使用 v2 对象式语法。详见 `/docs/drizzle-query-api-v2.md`**

### 核心原则（精简版）

1. **使用 v2 API**：新代码必须使用 `ctx.db.query`（对象式），禁止 `ctx.db._query`（函数式）
2. **对象式 where**：使用 `{ field: value }` 而非 `eq(table.field, value)`
3. **CASL 自动映射**：ABAC 条件自动转换为原生 v2 对象语法

### API 映射

| API | 版本 | Where 语法 | 状态 |
|-----|------|-----------|------|
| `ctx.db.query` | **v2** | 对象式 | ✅ 推荐 |
| `ctx.db._query` | v1 | 函数式 | ⚠️ 仅旧代码 |

### 快速示例

```typescript
// ✅ v2 对象式（推荐）
const articles = await ctx.db.query.articles.findMany({
  where: {
    status: 'published',
    authorId: { in: ['user-1', 'user-2'] },
    deletedAt: { isNull: true },
    OR: [
      { visibility: 'public' },
      { teamId: ctx.teamId },
    ],
  },
  with: { author: true },
});

// ❌ v1 函数式（禁止新代码）
const articles = await ctx.db._query.articles.findMany({
  where: and(eq(articles.status, 'published'), isNull(articles.deletedAt)),
});
```

### 常用操作符

| 操作 | v2 语法 |
|------|---------|
| 等于 | `{ field: value }` 或 `{ field: { eq: value } }` |
| 不等 | `{ field: { ne: value } }` |
| 比较 | `{ field: { gt/gte/lt/lte: value } }` |
| IN | `{ field: { in: [...] } }` |
| NOT IN | `{ field: { notIn: [...] } }` |
| IS NULL | `{ field: { isNull: true } }` |
| IS NOT NULL | `{ field: { isNotNull: true } }` |
| LIKE | `{ field: { like: '%pattern%' } }` |
| AND | 多字段自动 AND，或 `{ AND: [...] }` |
| OR | `{ OR: [...] }` |
| NOT | `{ NOT: {...} }` |

**详细文档**：`/docs/drizzle-query-api-v2.md`（使用时必读）

---

## Service / Repository 分层规范 (Critical)

**简单 CRUD 直接写在 Service 层，不需要 Repository。**

### 何时使用 Repository

仅当查询逻辑涉及以下复杂场景时，才抽取独立 Repository：

- **行级锁** (`FOR UPDATE`)
- **乐观锁** (version/CAS 检查)
- **跨表事务去重** (expire old + insert new 的原子操作)
- **瀑布式扣减** (多行 ordered update)
- **复杂聚合** (多表 JOIN、窗口函数、DISTINCT ON 等)

### 何时直接在 Service 中内联

所有简单 CRUD（select/insert/update/delete）直接用 `this.db` 操作：

```typescript
// ✅ 正确：简单查询直接在 Service 内联
@Injectable()
export class CurrencyService {
  constructor(
    @Inject('DATABASE') private readonly db: Database,
    private readonly exchangeRateRepo: ExchangeRateRepository // 复杂查询保留 Repo
  ) {}

  async getByCode(orgId: string, code: string) {
    const [currency] = await this.db
      .select().from(currencies)
      .where(and(eq(currencies.organizationId, orgId), eq(currencies.code, code)))
      .limit(1);
    return currency ?? null;
  }
}

// ❌ 错误：简单 CRUD 还包一层 Repository
class CurrencyRepository {
  async getByCode(orgId: string, code: string) { ... }
}
class CurrencyService {
  constructor(private readonly repo: CurrencyRepository) {}
  async getByCode(orgId: string, code: string) {
    return this.repo.getByCode(orgId, code); // 纯透传，无业务逻辑
  }
}
```

### 当前保留 Repository 的模块

| Repository | 保留理由 |
|-----------|---------|
| `exchange-rate.repo` | expire + insert 原子事务、批量导入 |
| `quota.repo` | 行级锁 FOR UPDATE、瀑布式扣减 |
| `subscription.repo` | 乐观锁版本检查 |
| `tenant-quota.repo` | 聚合查询 + 行级锁 |

### 判断标准

> **如果 Service 方法只是 `return this.repo.xxx(args)` 的纯透传，说明 Repo 层是多余的。**

---

## 基础设施策略读写分离原则 (Critical)

适用于所有使用 Infra Policy 模式的模块（currency、storage 等）。

### READ 查询：用 `resolveEffectiveOrgId`

决定"看谁的数据"。`unified` 或 `allow_override` 无自定义时，非 platform 用户需要读 platform 的数据。

### WRITE 操作：直接用 `ctx.organizationId`

- **不需要 `resolveEffectiveOrgId`**
- `requireMutationAllowed` 已是完备守卫：拦掉所有"不该写"的场景
- 所有放行的场景中，`ctx.organizationId` 就是正确的写入目标

### 为什么 mutation 禁止用 `resolveEffectiveOrgId`

如果 mutation 用了 `resolveEffectiveOrgId`，在 `allow_override` 无自定义的场景中会返回 `'platform'`，导致**租户写入篡改了平台数据**。

| 场景 | `requireMutationAllowed` | `ctx.organizationId` | 结论 |
|------|-------------------------|---------------------|------|
| `unified` + 非 platform | 阻断 | — | 不会执行到 |
| `require_tenant` | 放行 | 租户 orgId | 直写正确 |
| `allow_override` + 有自定义 | 放行 | 租户 orgId | 直写正确 |
| `allow_override` + 无自定义 | 阻断 | — | 不会执行到 |

---

## Quick Reference

**When asked about permissions**: Check `PERMISSION_GOVERNANCE.md` (architecture) or `docs/PERMISSION_SYSTEM.md` (implementation)
**When asked about plugins**: Check `PLUGIN_CONTRACT.md`
**When asked about billing**: Check `BILLING_MONETIZATION_GOVERNANCE.md` + `CAPABILITY_BILLING_MODEL.md`
**When asked about runtime**: Check `RUNTIME_GOVERNANCE.md`
**When asked about data**: Check `DATA_MODEL_GOVERNANCE.md` + `PLUGIN_DATA_GOVERNANCE.md`
**When asked about CRUD / auto-crud-server**: Check `docs/auto-crud-server-best-practices.md` (must read before writing CRUD code)
**When asked about Zod schemas**: Check `docs/zod-schema-conventions.md` (must read before defining schemas)
**When asked about Drizzle queries**: Check `docs/drizzle-query-api-v2.md` (must use v2 object-based syntax for new code)
**When unsure**: Check `SYSTEM_INVARIANTS.md` first

**If contradiction found**: Higher-level doc wins (see hierarchy above)

---

## 菜单系统规则 (Critical)

### 平台菜单 vs 全局菜单

- **平台菜单**（`systemReserved: true`）：`organizationId = 'platform'`，仅平台组织可见
- **全局菜单**（`systemReserved: false`）：`organizationId = null`，所有组织可见
- **绝对禁止**：将平台菜单设为 `organizationId: null`，这会导致所有租户都能看到平台管理功能

### 菜单可见性机制

菜单过滤依赖 `MenuService.getTree()` 的查询范围，不依赖特殊权限：
1. 查 `organizationId IS NULL`（全局模板）
2. 查 `organizationId = currentOrgId`（当前组织菜单）
3. 合并后按 `requiredPermission` 做权限过滤

平台菜单因为绑定了 `organizationId = 'platform'`，只有用户切换到 platform 组织时才会被 Step 2 查到。

### 相关文件

- 菜单数据源：`apps/server/src/permission/resource-definitions.ts`（`RESOURCE_DEFINITIONS`）
- 菜单 seed：`apps/server/src/db/seeds/menus.seed.ts`（`generateCoreMenus()`）
- 菜单查询：`apps/server/src/services/menu.service.ts`（`getTree()`）
- 权限过滤：`apps/server/src/trpc/routers/menu.ts`（`filterMenusByPermission()`）
- 平台组织 ID：`'platform'`（定义在 `seed-accounts.ts` 的 `PLATFORM_ORG_ID`）

### 命名规范

- 平台级页面放在 `pages/platform/` 目录，文件名不加 `Platform` 前缀
  - 正确：`pages/platform/StorageSettings.tsx`
  - 错误：`pages/PlatformStorageSettings.tsx`

---

**Architecture Status**: Frozen v0.1
**Last Updated**: 2024-12-22
**Change Policy**: Version-controlled, breaking changes forbidden without major version bump


# shadcn/ui

> shadcn/ui is a collection of beautifully-designed, accessible components and a code distribution platform. It is built with TypeScript, Tailwind CSS, and Radix UI primitives. It supports multiple frameworks including Next.js, Vite, Remix, Astro, and more. Open Source. Open Code. AI-Ready. It also comes with a command-line tool to install and manage components and a registry system to publish and distribute code.

## Overview

- [Introduction](https://ui.shadcn.com/docs): Core principles—Open Code, Composition, Distribution, Beautiful Defaults, and AI-Ready design.
- [CLI](https://ui.shadcn.com/docs/cli): Command-line tool for installing and managing components.
- [components.json](https://ui.shadcn.com/docs/components-json): Configuration file for customizing the CLI and component installation.
- [Theming](https://ui.shadcn.com/docs/theming): Guide to customizing colors, typography, and design tokens.
- [Changelog](https://ui.shadcn.com/docs/changelog): Release notes and version history.
- [About](https://ui.shadcn.com/docs/about): Credits and project information.

## Installation

- [Next.js](https://ui.shadcn.com/docs/installation/next): Install shadcn/ui in a Next.js project.
- [Vite](https://ui.shadcn.com/docs/installation/vite): Install shadcn/ui in a Vite project.
- [Remix](https://ui.shadcn.com/docs/installation/remix): Install shadcn/ui in a Remix project.
- [Astro](https://ui.shadcn.com/docs/installation/astro): Install shadcn/ui in an Astro project.
- [Laravel](https://ui.shadcn.com/docs/installation/laravel): Install shadcn/ui in a Laravel project.
- [Gatsby](https://ui.shadcn.com/docs/installation/gatsby): Install shadcn/ui in a Gatsby project.
- [React Router](https://ui.shadcn.com/docs/installation/react-router): Install shadcn/ui in a React Router project.
- [TanStack Router](https://ui.shadcn.com/docs/installation/tanstack-router): Install shadcn/ui in a TanStack Router project.
- [TanStack Start](https://ui.shadcn.com/docs/installation/tanstack): Install shadcn/ui in a TanStack Start project.
- [Manual Installation](https://ui.shadcn.com/docs/installation/manual): Manually install shadcn/ui without the CLI.

## Components

### Form & Input

- [Form](https://ui.shadcn.com/docs/components/form): Building forms with React Hook Form and Zod validation.
- [Field](https://ui.shadcn.com/docs/components/field): Field component for form inputs with labels and error messages.
- [Button](https://ui.shadcn.com/docs/components/button): Button component with multiple variants.
- [Button Group](https://ui.shadcn.com/docs/components/button-group): Group multiple buttons together.
- [Input](https://ui.shadcn.com/docs/components/input): Text input component.
- [Input Group](https://ui.shadcn.com/docs/components/input-group): Input component with prefix and suffix addons.
- [Input OTP](https://ui.shadcn.com/docs/components/input-otp): One-time password input component.
- [Textarea](https://ui.shadcn.com/docs/components/textarea): Multi-line text input component.
- [Checkbox](https://ui.shadcn.com/docs/components/checkbox): Checkbox input component.
- [Radio Group](https://ui.shadcn.com/docs/components/radio-group): Radio button group component.
- [Select](https://ui.shadcn.com/docs/components/select): Select dropdown component.
- [Switch](https://ui.shadcn.com/docs/components/switch): Toggle switch component.
- [Slider](https://ui.shadcn.com/docs/components/slider): Slider input component.
- [Calendar](https://ui.shadcn.com/docs/components/calendar): Calendar component for date selection.
- [Date Picker](https://ui.shadcn.com/docs/components/date-picker): Date picker component combining input and calendar.
- [Combobox](https://ui.shadcn.com/docs/components/combobox): Searchable select component with autocomplete.
- [Label](https://ui.shadcn.com/docs/components/label): Form label component.

### Layout & Navigation

- [Accordion](https://ui.shadcn.com/docs/components/accordion): Collapsible accordion component.
- [Breadcrumb](https://ui.shadcn.com/docs/components/breadcrumb): Breadcrumb navigation component.
- [Navigation Menu](https://ui.shadcn.com/docs/components/navigation-menu): Accessible navigation menu with dropdowns.
- [Sidebar](https://ui.shadcn.com/docs/components/sidebar): Collapsible sidebar component for app layouts.
- [Tabs](https://ui.shadcn.com/docs/components/tabs): Tabbed interface component.
- [Separator](https://ui.shadcn.com/docs/components/separator): Visual divider between content sections.
- [Scroll Area](https://ui.shadcn.com/docs/components/scroll-area): Custom scrollable area with styled scrollbars.
- [Resizable](https://ui.shadcn.com/docs/components/resizable): Resizable panel layout component.

### Overlays & Dialogs

- [Dialog](https://ui.shadcn.com/docs/components/dialog): Modal dialog component.
- [Alert Dialog](https://ui.shadcn.com/docs/components/alert-dialog): Alert dialog for confirmation prompts.
- [Sheet](https://ui.shadcn.com/docs/components/sheet): Slide-out panel component (drawer).
- [Drawer](https://ui.shadcn.com/docs/components/drawer): Mobile-friendly drawer component using Vaul.
- [Popover](https://ui.shadcn.com/docs/components/popover): Floating popover component.
- [Tooltip](https://ui.shadcn.com/docs/components/tooltip): Tooltip component for additional context.
- [Hover Card](https://ui.shadcn.com/docs/components/hover-card): Card that appears on hover.
- [Context Menu](https://ui.shadcn.com/docs/components/context-menu): Right-click context menu.
- [Dropdown Menu](https://ui.shadcn.com/docs/components/dropdown-menu): Dropdown menu component.
- [Menubar](https://ui.shadcn.com/docs/components/menubar): Horizontal menubar component.
- [Command](https://ui.shadcn.com/docs/components/command): Command palette component (cmdk).

### Feedback & Status

- [Alert](https://ui.shadcn.com/docs/components/alert): Alert component for messages and notifications.
- [Toast](https://ui.shadcn.com/docs/components/toast): Toast notification component using Sonner.
- [Progress](https://ui.shadcn.com/docs/components/progress): Progress bar component.
- [Spinner](https://ui.shadcn.com/docs/components/spinner): Loading spinner component.
- [Skeleton](https://ui.shadcn.com/docs/components/skeleton): Skeleton loading placeholder.
- [Badge](https://ui.shadcn.com/docs/components/badge): Badge component for labels and status indicators.
- [Empty](https://ui.shadcn.com/docs/components/empty): Empty state component for no data scenarios.

### Display & Media

- [Avatar](https://ui.shadcn.com/docs/components/avatar): Avatar component for user profiles.
- [Card](https://ui.shadcn.com/docs/components/card): Card container component.
- [Table](https://ui.shadcn.com/docs/components/table): Table component for displaying data.
- [Data Table](https://ui.shadcn.com/docs/components/data-table): Advanced data table with sorting, filtering, and pagination.
- [Chart](https://ui.shadcn.com/docs/components/chart): Chart components using Recharts.
- [Carousel](https://ui.shadcn.com/docs/components/carousel): Carousel component using Embla Carousel.
- [Aspect Ratio](https://ui.shadcn.com/docs/components/aspect-ratio): Container that maintains aspect ratio.
- [Typography](https://ui.shadcn.com/docs/components/typography): Typography styles and components.
- [Item](https://ui.shadcn.com/docs/components/item): Generic item component for lists and menus.
- [Kbd](https://ui.shadcn.com/docs/components/kbd): Keyboard shortcut display component.

### Misc

- [Collapsible](https://ui.shadcn.com/docs/components/collapsible): Collapsible container component.
- [Toggle](https://ui.shadcn.com/docs/components/toggle): Toggle button component.
- [Toggle Group](https://ui.shadcn.com/docs/components/toggle-group): Group of toggle buttons.
- [Pagination](https://ui.shadcn.com/docs/components/pagination): Pagination component for lists and tables.

## Dark Mode

- [Dark Mode](https://ui.shadcn.com/docs/dark-mode): Overview of dark mode implementation.
- [Dark Mode - Next.js](https://ui.shadcn.com/docs/dark-mode/next): Dark mode setup for Next.js.
- [Dark Mode - Vite](https://ui.shadcn.com/docs/dark-mode/vite): Dark mode setup for Vite.
- [Dark Mode - Astro](https://ui.shadcn.com/docs/dark-mode/astro): Dark mode setup for Astro.
- [Dark Mode - Remix](https://ui.shadcn.com/docs/dark-mode/remix): Dark mode setup for Remix.

## Forms

- [Forms Overview](https://ui.shadcn.com/docs/forms): Guide to building forms with shadcn/ui.
- [React Hook Form](https://ui.shadcn.com/docs/forms/react-hook-form): Using shadcn/ui with React Hook Form.
- [TanStack Form](https://ui.shadcn.com/docs/forms/tanstack-form): Using shadcn/ui with TanStack Form.
- [Forms - Next.js](https://ui.shadcn.com/docs/forms/next): Building forms in Next.js with Server Actions.

## Advanced

- [Monorepo](https://ui.shadcn.com/docs/monorepo): Using shadcn/ui in a monorepo setup.
- [React 19](https://ui.shadcn.com/docs/react-19): React 19 support and migration guide.
- [Tailwind CSS v4](https://ui.shadcn.com/docs/tailwind-v4): Tailwind CSS v4 support and setup.
- [JavaScript](https://ui.shadcn.com/docs/javascript): Using shadcn/ui with JavaScript (no TypeScript).
- [Figma](https://ui.shadcn.com/docs/figma): Figma design resources.
- [v0](https://ui.shadcn.com/docs/v0): Generating UI with v0 by Vercel.

## MCP Server

- [MCP Server](https://ui.shadcn.com/docs/mcp): Model Context Protocol server for AI integrations. Allows AI assistants to browse, search, and install components from registries using natural language. Works with Claude Code, Cursor, VS Code (GitHub Copilot), Codex and more.

## Registry

- [Registry Overview](https://ui.shadcn.com/docs/registry): Creating and publishing your own component registry.
- [Getting Started](https://ui.shadcn.com/docs/registry/getting-started): Set up your own registry.
- [Examples](https://ui.shadcn.com/docs/registry/examples): Example registries.
- [FAQ](https://ui.shadcn.com/docs/registry/faq): Common questions about registries.
- [Authentication](https://ui.shadcn.com/docs/registry/authentication): Adding authentication to your registry.
- [Registry MCP](https://ui.shadcn.com/docs/registry/mcp): MCP integration for registries.

### Registry Schemas

- [Registry Schema](https://ui.shadcn.com/schema/registry.json): JSON Schema for registry index files. Defines the structure for a collection of components, hooks, pages, etc. Requires name, homepage, and items array.
- [Registry Item Schema](https://ui.shadcn.com/schema/registry-item.json): JSON Schema for individual registry items. Defines components, hooks, themes, and other distributable code with properties for dependencies, files, Tailwind config, CSS variables, and more.



