# Zod Schema 规范

> **状态**: Frozen v0.1
> **最后更新**: 2026-02-05
> **适用范围**: 全项目 Zod schema 定义

---

## 1. 架构原则

### 1.1 单一数据源 (Single Source of Truth)

**所有 Zod schema 定义在 `@wordrhyme/db` 包中**，前后端共享。

```
packages/db/src/schema/
├── common.ts          # 通用 schema（分页、排序、搜索）
├── settings.ts        # Settings 表 + 相关 query/mutation schemas
├── auth.ts            # Auth 相关表 + schemas
├── menu.ts            # Menu 相关表 + schemas
└── index.ts           # 统一导出
```

### 1.2 导入规范

```typescript
// ✅ 正确：统一从 @wordrhyme/db 导入
import { settingSchema, getSettingQuery, TagPrefix } from '@wordrhyme/db';

// ❌ 错误：从本地路径导入（可能不存在或不同步）
import { TagPrefix } from './schema/permission-fields';
import { settingSchema } from '../../../packages/db/src/schema/settings';
```

---

## 2. 命名规范

| 类型 | 命名模式 | 示例 |
|------|----------|------|
| **Base Schema** | `xxxSchema` | `settingSchema`, `menuSchema` |
| **Query (单个)** | `getXxxQuery` | `getSettingQuery`, `getMenuQuery` |
| **Query (列表)** | `listXxxQuery` | `listSettingsQuery`, `listMenusQuery` |
| **Mutation (复杂)** | `xxxMutation` | `setSettingMutation`, `deleteSettingMutation` |
| **Types** | `Xxx` | `Setting`, `Menu` |

### 2.1 命名规则

1. **Base Schema**: 使用 `createInsertSchema(table)` 生成，命名为 `xxxSchema`（无 `insert` 前缀）
2. **Query/Mutation**: 从 Base Schema 派生，使用 `.pick()/.extend()/.merge()`
3. **一致性**: 同一实体的所有 schema 使用相同的名词（如 `setting` 不是 `config`）

---

## 3. Schema 派生规则

### 3.1 何时需要派生

| 场景 | 是否派生 | 说明 |
|------|----------|------|
| **字段子集** | ✅ 需要 | Query 只需要部分字段 |
| **额外参数** | ✅ 需要 | 需要 API 专用参数（如 `defaultValue`） |
| **分页查询** | ✅ 需要 | 需要合并 `paginationSchema` |
| **Create** | ❌ 不需要 | 直接使用 `xxxSchema` |
| **Update** | ❌ 不需要 | 表单会填充原数据，直接使用 `xxxSchema` |

### 3.2 派生模式

```typescript
// packages/db/src/schema/settings.ts

import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { paginationSchema } from './common';
import { settings } from './tables';

// 1. Base Schema（直接用于 Create/Update）
export const settingSchema = createInsertSchema(settings);

// 2. Get Query（字段子集 + 额外参数）
export const getSettingQuery = settingSchema.pick({
  scope: true,
  key: true,
  organizationId: true,
  scopeId: true,
}).extend({
  defaultValue: z.unknown().optional(),  // API 专用参数
});

// 3. List Query（字段子集 + 分页 + 额外参数）
export const listSettingsQuery = settingSchema
  .pick({
    scope: true,
    organizationId: true,
    scopeId: true,
  })
  .merge(paginationSchema)
  .extend({
    keyPrefix: z.string().optional(),
  });

// 4. Delete Mutation（字段子集，无额外参数）
export const deleteSettingMutation = settingSchema.pick({
  scope: true,
  key: true,
  organizationId: true,
  scopeId: true,
});

// 5. Set Mutation（字段子集，包含所有可设置字段）
export const setSettingMutation = settingSchema.pick({
  scope: true,
  key: true,
  value: true,
  organizationId: true,
  scopeId: true,
  encrypted: true,
  description: true,
  valueType: true,
});
```

### 3.3 通用 Schema 复用

```typescript
// packages/db/src/schema/common.ts

import { z } from 'zod';

// 分页 - 所有列表查询复用
export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// 排序 - 可选复用
export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// 搜索 - 可选复用
export const searchSchema = z.object({
  q: z.string().min(1).optional(),
});

// 组合：分页 + 排序
export const listQueryBase = paginationSchema.merge(sortSchema);

// ID 参数
export const idSchema = z.object({
  id: z.string(),
});
```

---

## 4. Zod v4 Breaking Changes

### 4.1 z.record() 必须两个参数

```typescript
// ❌ Zod v3 语法（v4 会报错）
z.record(z.string())
z.record(z.unknown())

// ✅ Zod v4 语法
z.record(z.string(), z.string())      // Record<string, string>
z.record(z.string(), z.unknown())     // Record<string, unknown>
z.record(z.string(), z.number())      // Record<string, number>
```

### 4.2 reduce 类型推断

```typescript
// ❌ 可能导致类型错误
return fields.reduce(
  (merged, field) => ({ ...merged, ...field }),
  {} as Record<string, T>  // 类型断言可能不够
);

// ✅ 使用泛型参数
return fields.reduce<Record<string, T>>(
  (merged, field) => ({ ...merged, ...field }),
  {}
);
```

---

## 5. Router 中使用 Schema

### 5.1 标准模式

```typescript
// apps/server/src/trpc/routers/settings.ts

import {
  settingSchema,
  getSettingQuery,
  listSettingsQuery,
  setSettingMutation,
  deleteSettingMutation,
} from '@wordrhyme/db';

export const settingsRouter = router({
  // Query - 单个
  get: protectedProcedure
    .input(getSettingQuery)
    .query(async ({ input }) => { ... }),

  // Query - 列表
  list: protectedProcedure
    .input(listSettingsQuery)
    .query(async ({ input }) => { ... }),

  // Mutation - Create（直接用 base schema）
  create: protectedProcedure
    .input(settingSchema)
    .mutation(async ({ input }) => { ... }),

  // Mutation - Update（直接用 base schema）
  update: protectedProcedure
    .input(settingSchema)
    .mutation(async ({ input }) => { ... }),

  // Mutation - Delete（用专门的 mutation schema）
  delete: protectedProcedure
    .input(deleteSettingMutation)
    .mutation(async ({ input }) => { ... }),

  // Mutation - 复杂操作
  set: protectedProcedure
    .input(setSettingMutation)
    .mutation(async ({ input }) => { ... }),
});
```

### 5.2 何时在 Router 内联

**仅当 schema 只在单个 endpoint 使用时**，可以内联：

```typescript
// ✅ 可接受：极简单的一次性 schema
.input(z.object({ id: z.string() }))

// ❌ 避免：复杂的内联 schema（应提取到 schema 文件）
.input(settingSchema.pick({ scope: true, key: true }).extend({ ... }))
```

---

## 6. 文件组织

### 6.1 Schema 文件结构

```typescript
// packages/db/src/schema/xxx.ts

// ============================================================
// Imports
// ============================================================
import { pgTable, text, ... } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { paginationSchema } from './common';

// ============================================================
// Types (if needed)
// ============================================================
export type XxxScope = 'global' | 'tenant';

// ============================================================
// Table Definition
// ============================================================
export const xxx = pgTable('xxx', { ... });

// ============================================================
// Zod Schemas
// ============================================================
export const xxxSchema = createInsertSchema(xxx);

// ============================================================
// Query Schemas
// ============================================================
export const getXxxQuery = xxxSchema.pick({ ... });
export const listXxxQuery = xxxSchema.pick({ ... }).merge(paginationSchema);

// ============================================================
// Mutation Schemas (复杂操作才需要)
// ============================================================
export const deleteXxxMutation = xxxSchema.pick({ ... });

// ============================================================
// Inferred Types
// ============================================================
export type Xxx = typeof xxx.$inferSelect;
```

### 6.2 导出规范

```typescript
// packages/db/src/schema/index.ts

// 统一导出所有 schema
export * from './common';
export * from './settings';
export * from './menu';
export * from './auth';
// ...
```

---

## 7. 常见错误

| 错误 | 正确做法 |
|------|----------|
| 从本地路径导入已在 `@wordrhyme/db` 的类型 | 统一从 `@wordrhyme/db` 导入 |
| `z.record(z.string())` 单参数 | `z.record(z.string(), z.string())` |
| 手动定义与 table 重复的字段类型 | 使用 `.pick()` 从 base schema 派生 |
| 每个 router 重复定义分页参数 | 复用 `paginationSchema` |
| Update 使用 `.partial()` 派生 | 直接用 base schema（表单填充原数据） |
| 命名不一致（`configSchema` vs `settingSchema`） | 统一命名 |

---

## 8. Checklist

新增 CRUD 功能时：

- [ ] Table 定义在 `packages/db/src/schema/xxx.ts`
- [ ] Base schema 使用 `createInsertSchema(table)` 生成
- [ ] Query schemas 使用 `.pick()/.merge()/.extend()` 派生
- [ ] 复杂 Mutation schemas 在 schema 文件中定义（方案B）
- [ ] 所有 schema 从 `packages/db/src/schema/index.ts` 导出
- [ ] Router 从 `@wordrhyme/db` 导入 schema
- [ ] `z.record()` 使用两个参数
- [ ] 命名符合规范

---

## 相关文档

- [auto-crud-server-best-practices.md](./auto-crud-server-best-practices.md) - CRUD 开发规范
- [CLAUDE.md](../CLAUDE.md) - 项目级指导
