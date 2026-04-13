---
description: WordRhyme后端数据库模型规范，包括Zod Schema规范和Drizzle对象式语法糖用法
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

## drizzle-zod Schema 推导规范 (Critical)

**核心思想：让每层只做自己的事。Drizzle schema 是 SSOT，refine 只补 DB 层无法表达的验证。**

### Refine 决策流程

判断一个 refine **该不该写**，按以下优先级：

1. **DB 层能表达？** → 不写。`varchar({ length, enum })` 自动推导 `.max()` 和 `z.enum()`
2. **JSONB 类型验证？** → 看场景：
   - 表单使用的字段（如 `name`）→ **写** `z.record(z.string(), z.string())`。`$type<T>()` 是运行时 passthrough，zodResolver 需要运行时校验
   - 非表单字段（如 `tags`/`priceRange`，由独立组件或后台处理）→ 不写，`$type<T>()` 编译时保护够了
3. **格式验证（.url/.email/.regex）？** → **写**。DB 是 `text` 列无法表达，前端表单需要错误提示
4. **类型转换（coerce/transform）？** → 先看框架是否已处理（tRPC + superjson 自动处理 Date）

### 策略一：用 `varchar({ enum })` 替代 `pgEnum`

```typescript
// ❌ pgEnum — 需要迁移管理，改值要 ALTER TYPE
export const statusEnum = pgEnum('status', ['draft', 'published']);

// ✅ varchar + const array — 零迁移成本，TS union + Zod enum 自动生成
export const STATUSES = ['draft', 'pending', 'published', 'archived'] as const;
export type Status = (typeof STATUSES)[number];
// drizzle-zod 自动推导为 z.enum(STATUSES)
status: varchar('status', { length: 20, enum: STATUSES }).notNull().default('draft'),
```

### 策略二：信任 `$type<T>()` 编译时保护

```typescript
// ❌ 手写 JSONB refine（冗余）
export const createSchema = createInsertSchema(table, {
    name: () => z.record(z.string(), z.string()),           // $type<I18nField>() 够了
    tags: () => z.array(tagSchema).default([]),              // $type<Tag[]>() + .default([]) 够了
});

// ✅ 零 refine — $type 编译时保护 + DB default 自动推导
export const createSchema = createInsertSchema(table).omit({...});
```

**前提**：所有调用方都是自己的 TypeScript 代码（内部管理后台 + tRPC）。  
**例外**：公共 API / 外部 webhook 需要运行时验证。

### 策略三：格式验证保留在 shared 层

```typescript
// ✅ 保留 — 前后端共享，表单需要错误提示
export const createSchema = createInsertSchema(table, {
    url: () => z.string().url().optional(),
    email: () => z.string().email().optional(),
}).omit({...});
```

### 策略四：跨 schema 字段复用用 `shape['key']`

```typescript
const _ps = createProductSchema.shape;
const _vs = createVariationSchema.shape;

export const inlineCreateSchema = z.object({
    // 从已有 schema 自动继承（含 nullable/optional/max 约束）
    spuCode: _ps['spuCode'], source: _ps['source'],
    skuCode: _vs['skuCode'], length: _vs['length'],
    // 只手写需要覆盖的字段
    weight: z.number().int().positive(),  // required override
});
```

> ⚠️ **Zod v4 限制**：`z.object({ ...schema.shape })` spread 会丢失类型推导。  
> `pick().merge().extend()` 链式调用也有同样问题。必须用 `shape['key']` 逐个引用。

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
