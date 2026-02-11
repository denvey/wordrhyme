# Upgrade Drizzle to v1 & Migrate to Shared packages/db

## Summary

升级 Drizzle ORM 到 v1 版本，并将后端 Drizzle schema 迁移至 `packages/db` 以实现前后端共享。

## Context

### User Need
- 升级 Drizzle ORM 到 v1 以获取新特性（defineRelations、改进的查询语法）
- 将数据库 schema 从 `apps/server/src/db/schema` 迁移到 `packages/db/src/schema`
- 实现前后端共享数据库类型和 schema（当前 `packages/db` 只有 i18n 相关的部分 schema）

### Current State Analysis

#### 版本状态
| Package | Current Version | Target Version |
|---------|----------------|----------------|
| drizzle-orm | 0.45.1 (server) | 1.x |
| drizzle-orm | ^0.45.0 (packages/db peer) | 1.x |
| drizzle-zod | 0.5.1 (server) | 新版本 |
| drizzle-zod | 0.8.3 (admin) | 统一版本 |
| drizzle-kit | 0.31.8 (server) | 1.x |

#### Schema 文件分布
**apps/server/src/db/schema/** (30 files):
- auth-schema.ts (user, session, account, organization 等 + relations)
- roles.ts (roles + rolesRelations)
- role-permissions.ts (rolePermissions + rolePermissionsRelations)
- i18n.ts (i18nLanguages, i18nMessages + relations)
- plugins.ts (plugins, pluginConfigs - 无 relations)
- assets.ts (含 relations)
- role-menu-visibility.ts (含 relations)
- ...其他 20+ schema 文件

**packages/db/src/schema/** (1 file):
- i18n.ts (i18nLanguages, i18nMessages - 无 relations，无 FK references)

#### Relations 使用情况
当前使用 **v1 语法**（分散定义）：
```typescript
// 每个表单独定义 relations
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));
```

涉及 relations 的文件：
1. auth-schema.ts - userRelations, sessionRelations, accountRelations, organizationRelations, memberRelations, invitationRelations
2. roles.ts - rolesRelations
3. role-permissions.ts - rolePermissionsRelations
4. i18n.ts - i18nLanguagesRelations, i18nMessagesRelations
5. assets.ts - assetRelations
6. role-menu-visibility.ts - 相关 relations

#### 前端使用情况
`apps/admin` 直接依赖：
- `@wordrhyme/db` (workspace:*)
- `drizzle-zod` (0.8.3) - 用于 `createSelectSchema()`

使用方式：
```typescript
import { i18nLanguages } from '@wordrhyme/db/schema';
import { createSelectSchema } from 'drizzle-zod';
const languageSchema = createSelectSchema(i18nLanguages);
```

#### 特殊约束
1. **循环依赖风险**：server schema 中 FK references 使用 `organization.id`，organization 来自 auth-schema
2. **LBAC 集成**：scoped-db.ts 对 schema 有特殊处理（detectTableSchema）
3. **drizzle-kit**：配置指向 `apps/server/src/db/schema/definitions.ts`

---

## Discovered Constraints

### Hard Constraints (技术限制)

| ID | Constraint | Source | Impact |
|----|-----------|--------|--------|
| HC-1 | Relations 必须从 v1 语法迁移到 v2 defineRelations | Drizzle v1 upgrade guide | 所有 relations 文件需重写 |
| HC-2 | drizzle() 初始化参数从 { schema } 变为 { relations } | Drizzle v1 upgrade guide | client.ts 需修改 |
| HC-3 | 前端不能包含 FK references（会引入 postgres 等后端依赖） | packages/db 设计原则 | 需分离纯 schema 和带 FK 的 schema |
| HC-4 | packages/db 必须是 ESM 格式 | 现有 tsup.config.ts | 与 monorepo 一致 |
| HC-5 | drizzle-kit 只能在 server 运行（需要 DATABASE_URL） | drizzle.config.ts | packages/db 不含迁移逻辑 |
| HC-6 | ScopedDb 依赖 schema 结构检测（aclTags, denyTags, organizationId） | scoped-db.ts | 迁移后需保持兼容 |

### Soft Constraints (约定/偏好)

| ID | Constraint | Source | Recommendation |
|----|-----------|--------|----------------|
| SC-1 | 使用 workspace:* 引用内部包 | 现有 package.json | 保持一致 |
| SC-2 | drizzle-zod 版本需前后端统一 | 避免类型不一致 | 统一到 1.x 最新版 |
| SC-3 | 现有 import 路径尽量保持向后兼容 | 减少破坏性改动 | 使用 re-export |
| SC-4 | Zod schemas 放在 packages/db 供前端使用 | CLAUDE.md CRUD 规范 | 扩展现有结构 |

### Dependencies (跨模块关系)

| From | To | Type | Notes |
|------|-----|------|-------|
| apps/server | packages/db | 运行时 | schema + types |
| apps/admin | packages/db | 运行时 | schema + types (for drizzle-zod) |
| apps/server/drizzle.config.ts | apps/server/src/db/schema | 构建时 | 迁移生成 |
| packages/db | drizzle-orm | peer dependency | v1.x |

### Risks (潜在阻塞)

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|-----------|
| R-1 | v2 relations 语法与 ScopedDb 不兼容 | Medium | High | 需验证 defineRelations 返回值结构 |
| R-2 | 循环依赖：schema 之间相互引用 | Medium | Medium | 按依赖顺序组织导出 |
| R-3 | drizzle-kit generate 路径变化导致迁移失败 | Low | High | 保持 drizzle.config.ts 在 server |
| R-4 | 前端 drizzle-zod 版本不兼容 | Medium | Medium | 统一升级 |

---

## Requirements

### REQ-1: Upgrade Drizzle ORM to v1

**Rationale**: 获取 defineRelations、改进的查询语法、原生 many-to-many 支持

**Scenarios**:
- GIVEN drizzle-orm 1.x installed
- WHEN running `pnpm install`
- THEN no dependency conflicts
- AND TypeScript compilation succeeds

### REQ-2: Migrate Relations to v2 Syntax

**Rationale**: v1 upgrade 要求

**Scenarios**:
- GIVEN all relations using defineRelations()
- WHEN db.query.users.findMany({ with: { sessions: true } })
- THEN related data is correctly loaded
- AND type inference works

**v1 → v2 Migration**:
```typescript
// Before (v1 - scattered)
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
}));

// After (v2 - centralized)
import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

export const relations = defineRelations(schema, (r) => ({
  user: {
    sessions: r.many.session(),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
}));
```

### REQ-3: Restructure packages/db for Sharing

**Rationale**: 前后端共享 schema 和类型

**Target Structure**:
```
packages/db/
├── src/
│   ├── index.ts          # Main entry: types + re-exports
│   ├── types/            # Inferred types (public)
│   ├── schema/           # Pure schema definitions (no FK refs)
│   │   ├── index.ts
│   │   ├── auth.ts       # user, organization, session, etc
│   │   ├── i18n.ts
│   │   ├── plugins.ts
│   │   ├── roles.ts
│   │   ├── permissions.ts
│   │   ├── menus.ts
│   │   ├── settings.ts
│   │   ├── files.ts
│   │   ├── billing.ts
│   │   └── ...
│   └── zod/              # Zod schemas for frontend & backend
│       ├── index.ts      # All select/insert schemas
│       └── base.ts       # createSelectSchema(table) 生成
├── package.json
└── tsup.config.ts
```

**Scenarios**:
- GIVEN packages/db built
- WHEN importing from '@wordrhyme/db/schema'
- THEN all table definitions available
- AND no postgres/pg-core runtime dependencies leak to frontend

- GIVEN packages/db built
- WHEN importing from '@wordrhyme/db/zod'
- THEN all select/insert Zod schemas available
- AND frontend can use for form validation

### REQ-4: Maintain Server DB Layer

**Rationale**: FK constraints、relations、LBAC 需要保留在 server

**Target Structure**:
```
apps/server/src/db/
├── client.ts             # drizzle() with relations
├── relations.ts          # defineRelations() - NEW
├── scoped-db.ts          # LBAC wrapper (unchanged)
├── schema/
│   ├── index.ts          # Re-export from packages/db + FK augments
│   └── definitions.ts    # Import + add FK references
└── drizzle.config.ts     # Points to definitions.ts
```

**Scenarios**:
- GIVEN server running
- WHEN executing db.query.users.findMany({ with: { sessions: true } })
- THEN relations work correctly
- AND LBAC filtering applied

### REQ-5: Update Import Paths

**Rationale**: 统一导入路径，保持向后兼容

**Mapping**:
| Old Path | New Path | Notes |
|----------|----------|-------|
| `@wordrhyme/db/schema` | `@wordrhyme/db/schema` | 保持不变 |
| `./schema/definitions` (server) | `./schema` | 简化 |
| `drizzle-zod` (admin) | `@wordrhyme/db/zod` | 统一使用 |

### REQ-6: Migrate Zod Schemas to packages/db

**Rationale**: 前后端共享校验规则，保证一致性（开源项目的可维护性要求）

**Migration**:
| Location | Content | 示例 |
|----------|---------|------|
| `packages/db/zod` | 基础 schemas（含校验规则） | `insertI18nLanguageSchema`, `selectI18nLanguageSchema`, `updateI18nLanguageSchema` |
| `apps/server/src/db/schema/zod-api.ts` | 纯 API 契约 schemas | `getMessagesInputSchema`, `batchUpdateMessagesInputSchema` |

**Scenarios**:
- GIVEN packages/db built
- WHEN importing `insertI18nLanguageSchema` from '@wordrhyme/db/zod'
- THEN schema 包含完整校验规则（regex, min, max 等）
- AND 前端表单验证与后端一致

- GIVEN 贡献者添加新 CRUD 页面
- WHEN 使用 `@wordrhyme/db/zod` 的 schema
- THEN 自动获得正确的校验规则
- AND 无需了解每个字段的校验细节

---

## Success Criteria

| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| S-1 | `pnpm install` 无依赖冲突 | CI |
| S-2 | `pnpm build` 全包成功 | CI |
| S-3 | `pnpm type-check` 无 TypeScript 错误 | CI |
| S-4 | `pnpm db:generate` 生成正确迁移 | Manual |
| S-5 | 现有 db.query 使用正常 | Unit tests |
| S-6 | apps/admin 可正常导入 `@wordrhyme/db/schema` | Unit tests |
| S-7 | apps/admin 可正常导入 `@wordrhyme/db/zod` | Unit tests |
| S-8 | LBAC 功能不受影响 | Existing tests |
| S-9 | 所有现有测试通过 | CI |
| S-10 | defineRelations 正确加载所有 relations | Manual verification |

---

## Open Questions

### Q1: Relations Migration Strategy ✅ RESOLVED

**Decision**: **完整迁移** - 一次性将所有 relations 迁移到 v2 defineRelations

**Rationale**: 避免技术债务，保持代码一致性

### Q2: packages/db 是否包含 FK References ✅ RESOLVED

**Decision**: **不包含** - packages/db 只有纯 schema 定义（无 FK references），FK 在 server 层添加

**Rationale**: 更安全，避免前端意外依赖后端模块（postgres 等）

### Q3: drizzle-zod 放置位置 ✅ RESOLVED

**Decision**: 将 **基础 Zod schemas（含校验规则）** 放在 `packages/db/zod`，前后端共用

**Rationale**:
- 开源项目需要一致性：贡献者添加新页面时自动获得正确校验
- 单一数据源：改一处，前后端同步更新
- 前后端校验逻辑应该一致，避免「前端OK、后端拒绝」的用户体验问题

**packages/db/zod 内容**:
```typescript
// 带完整校验规则的 schemas
export const insertI18nLanguageSchema = createInsertSchema(i18nLanguages, {
  locale: z.string().min(2).max(16).regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  name: z.string().min(1).max(50),
  // ...
});
export const selectI18nLanguageSchema = createSelectSchema(i18nLanguages);
export const updateI18nLanguageSchema = insertI18nLanguageSchema.partial().omit({...});
```

**apps/server 保留内容** (`zod-api.ts`):
```typescript
// 纯 API 契约 schemas（前端不需要）
export const getMessagesInputSchema = z.object({...});
export const batchUpdateMessagesInputSchema = z.object({...});
```

**使用方式**:
```typescript
// 前端 - 表单验证
import { insertI18nLanguageSchema } from '@wordrhyme/db/zod';

// 后端 - tRPC input
import { insertI18nLanguageSchema } from '@wordrhyme/db/zod';
import { getMessagesInputSchema } from './schema/zod-api';
```

---

## Implementation Sequence (High-Level)

1. **Phase 1: Upgrade Dependencies**
   - 升级 drizzle-orm, drizzle-kit, drizzle-zod 到 1.x
   - 统一前后端 drizzle-zod 版本
   - 验证构建和类型检查

2. **Phase 2: Restructure packages/db**
   - 迁移纯 schema 定义到 packages/db/src/schema/
   - 创建 packages/db/src/zod/ 基础 Zod schemas
   - 更新 packages/db exports 和 tsup.config.ts
   - 验证前端可正常导入

3. **Phase 3: Migrate Relations to v2**
   - 创建 apps/server/src/db/relations.ts
   - 使用 defineRelations 重写所有 relations
   - 更新 client.ts 使用新 relations 参数
   - 验证 db.query 正常工作

4. **Phase 4: Update Server Schema Layer**
   - 创建 server schema layer（re-export + FK references）
   - 更新 drizzle.config.ts 指向新路径
   - 拆分 zod-schemas.ts (基础 → packages/db, API → zod-api.ts)

5. **Phase 5: Update All Imports**
   - 更新 server 中所有 schema 导入
   - 更新 admin 使用 @wordrhyme/db/zod
   - 运行全量测试验证

---

## References

- [Drizzle v1 Upgrade Guide](https://orm.drizzle.team/docs/upgrade-v1)
- [Drizzle Relations v1-v2 Migration](https://orm.drizzle.team/docs/relations-v1-v2)
- CLAUDE.md CRUD 规范
- packages/db/README.md
