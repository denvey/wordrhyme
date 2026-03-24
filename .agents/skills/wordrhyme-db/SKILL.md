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
