# Drizzle Query API v2 使用规范

> **状态**: 推荐使用 (2024-12)
> **适用范围**: 所有新代码必须使用 v2，旧代码逐步迁移

## 概述

Drizzle ORM v1.0.0-beta 引入了新的 Query API，提供更直观的对象式 where 语法。WordRhyme 的 `ScopedDb` 已完整支持 v2，并针对 CASL ABAC 进行了优化。

## API 映射

| API | 版本 | Where 语法 | 状态 |
|-----|------|-----------|------|
| `ctx.db.query` | **v2** | 对象式 | ✅ 推荐 |
| `ctx.db._query` | v1 | 函数式 | ⚠️ 仅旧代码 |

## v2 语法速查

### 基础比较

```typescript
// v2 对象式（推荐）
where: {
  id: 1,                          // 等于（简写）
  id: { eq: 1 },                  // 等于（显式）
  status: { ne: 'deleted' },      // 不等于
  age: { gt: 18 },                // 大于
  score: { gte: 60 },             // 大于等于
  price: { lt: 100 },             // 小于
  rating: { lte: 5 },             // 小于等于
}

// v1 函数式（旧代码）
where: and(
  eq(table.id, 1),
  ne(table.status, 'deleted'),
  gt(table.age, 18)
)
```

### 集合操作

```typescript
where: {
  status: { in: ['draft', 'published'] },     // IN
  category: { notIn: ['deleted', 'spam'] },   // NOT IN
}
```

### 字符串匹配

```typescript
where: {
  name: { like: '%john%' },           // LIKE（区分大小写）
  email: { ilike: '%@gmail.com' },    // ILIKE（不区分大小写）
  title: { notLike: 'Draft:%' },      // NOT LIKE
}
```

### NULL 检查

```typescript
where: {
  deletedAt: { isNull: true },        // IS NULL
  verifiedAt: { isNotNull: true },    // IS NOT NULL
}
```

### 逻辑操作符

```typescript
where: {
  // 隐式 AND（同级字段自动 AND）
  status: 'active',
  ownerId: 'user-123',

  // 显式 AND
  AND: [
    { status: 'active' },
    { createdAt: { gte: '2024-01-01' } },
  ],

  // OR
  OR: [
    { visibility: 'public' },
    { ownerId: 'user-123' },
  ],

  // NOT
  NOT: {
    status: 'deleted',
  },
}
```

### 数组操作（PostgreSQL）

```typescript
where: {
  tags: { arrayOverlaps: ['tech', 'news'] },   // 数组交集
  permissions: { arrayContains: ['admin'] },   // 数组包含
  categories: { arrayContained: [1, 2, 3] },   // 被数组包含
}
```

### 关联过滤

```typescript
// 过滤有特定关联的记录
where: {
  posts: {                            // 过滤有匹配 posts 的用户
    status: 'published',
  },
}

// 检查关联是否存在
where: {
  posts: true,                        // 有任意 posts 的用户
}
```

### RAW SQL（高级）

```typescript
where: {
  RAW: (table) => sql`${table.id} = 1`,

  // 结合其他条件
  status: 'active',
  RAW: (table) => sql`${table.metadata}->>'type' = 'premium'`,
}
```

## CASL 条件映射

ScopedDb 使用 `casl-to-drizzle-v2` 将 CASL MongoDB 风格条件自动转换为 Drizzle v2 语法：

| CASL (MongoDB) | Drizzle v2 | 示例 |
|----------------|------------|------|
| `$eq` | `eq` | `{ status: { $eq: 'active' } }` → `{ status: { eq: 'active' } }` |
| `$ne` | `ne` | `{ status: { $ne: 'deleted' } }` → `{ status: { ne: 'deleted' } }` |
| `$gt` / `$gte` | `gt` / `gte` | `{ age: { $gt: 18 } }` → `{ age: { gt: 18 } }` |
| `$lt` / `$lte` | `lt` / `lte` | `{ price: { $lt: 100 } }` → `{ price: { lt: 100 } }` |
| `$in` | `in` | `{ status: { $in: ['a', 'b'] } }` → `{ status: { in: ['a', 'b'] } }` |
| `$nin` | `notIn` | `{ status: { $nin: ['x'] } }` → `{ status: { notIn: ['x'] } }` |
| `$exists: true` | `isNotNull` | `{ email: { $exists: true } }` → `{ email: { isNotNull: true } }` |
| `$exists: false` | `isNull` | `{ deletedAt: { $exists: false } }` → `{ deletedAt: { isNull: true } }` |
| `$and` | `AND` | `{ $and: [...] }` → `{ AND: [...] }` |
| `$or` | `OR` | `{ $or: [...] }` → `{ OR: [...] }` |
| `$not` / `$nor` | `NOT` | `{ $not: {...} }` → `{ NOT: {...} }` |

### 模板变量

CASL 条件中的模板变量会自动解析：

```typescript
// CASL 规则定义
{
  action: 'update',
  subject: 'Article',
  conditions: {
    authorId: '${user.id}',           // → 当前用户 ID
    organizationId: '${user.organizationId}',  // → 当前租户 ID
    teamId: '${user.currentTeamId}',  // → 当前团队 ID
  }
}

// 运行时转换为
{
  authorId: 'actual-user-id',
  organizationId: 'actual-org-id',
  teamId: 'actual-team-id',
}
```

## ScopedDb 自动注入

使用 `ctx.db.query` 时，ScopedDb 自动注入以下过滤：

```
┌─────────────────────────────────────────────────────┐
│                    你的代码                          │
│  ctx.db.query.articles.findMany({                   │
│    where: { status: 'published' }                   │
│  })                                                 │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│                 ScopedDb 自动注入                    │
│  where: {                                           │
│    AND: [                                           │
│      { RAW: () => lbacFilter },    // 1️⃣ LBAC      │
│      { status: 'published' },       // 2️⃣ 用户条件 │
│      { authorId: 'user-123' },      // 3️⃣ ABAC     │
│    ]                                                │
│  }                                                  │
└─────────────────────────────────────────────────────┘
```

### 注入层级

| 层级 | 类型 | 注入方式 | 说明 |
|------|------|----------|------|
| 1️⃣ | **LBAC** (标签访问控制) | `RAW` SQL | `aclTags && userKeys` PostgreSQL 数组操作 |
| 2️⃣ | **租户隔离** | 对象条件 | `organizationId = ctx.organizationId` |
| 3️⃣ | **ABAC** (属性访问控制) | 对象条件 | 从 CASL 规则转换的条件 |
| 4️⃣ | **字段过滤** | 结果处理 | 查询后过滤敏感字段 |

## 使用示例

### Router 中使用（推荐）

```typescript
// apps/server/src/trpc/routers/articles.ts
import { router, protectedProcedure } from '../trpc';
import { Actions, Subjects } from '../../permission/constants';

export const articlesRouter = router({
  list: protectedProcedure
    .meta({ permission: { action: Actions.read, subject: Subjects.Content } })
    .query(async ({ ctx }) => {
      // ✅ 使用 v2 语法
      const articles = await ctx.db.query.articles.findMany({
        where: {
          status: { in: ['draft', 'published'] },
          deletedAt: { isNull: true },
        },
        with: { author: true },
        orderBy: (articles, { desc }) => [desc(articles.createdAt)],
      });

      return articles;
      // LBAC + ABAC + 字段过滤已自动应用
    }),

  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .meta({ permission: { action: Actions.read, subject: Subjects.Content } })
    .query(async ({ ctx, input }) => {
      // ✅ v2 语法
      const article = await ctx.db.query.articles.findFirst({
        where: { slug: input.slug },
        with: { author: true, tags: true },
      });

      if (!article) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return article;
    }),
});
```

### 复杂查询

```typescript
// 搜索文章：公开的 OR 自己的草稿
const articles = await ctx.db.query.articles.findMany({
  where: {
    OR: [
      // 公开已发布
      {
        visibility: 'public',
        status: 'published',
      },
      // 自己的草稿
      {
        authorId: ctx.userId,
        status: 'draft',
      },
    ],
    // 共同条件
    deletedAt: { isNull: true },
    createdAt: { gte: '2024-01-01' },
  },
  orderBy: (a, { desc }) => [desc(a.createdAt)],
  limit: 20,
});
```

### 关联查询

```typescript
// 获取用户及其最近的文章
const users = await ctx.db.query.users.findMany({
  where: {
    status: 'active',
    // 只返回有已发布文章的用户
    articles: {
      status: 'published',
    },
  },
  with: {
    articles: {
      where: { status: 'published' },
      orderBy: (a, { desc }) => [desc(a.createdAt)],
      limit: 5,
    },
    profile: true,
  },
});
```

## 迁移指南

### 从 v1 迁移到 v2

```typescript
// ❌ v1 旧代码
import { eq, and, or, isNull } from 'drizzle-orm';

const articles = await ctx.db._query.articles.findMany({
  where: and(
    eq(articles.status, 'published'),
    or(
      eq(articles.visibility, 'public'),
      eq(articles.authorId, ctx.userId)
    ),
    isNull(articles.deletedAt)
  ),
});

// ✅ v2 新代码
const articles = await ctx.db.query.articles.findMany({
  where: {
    status: 'published',
    OR: [
      { visibility: 'public' },
      { authorId: ctx.userId },
    ],
    deletedAt: { isNull: true },
  },
});
```

### 迁移清单

- [ ] 将 `db._query` 改为 `db.query`
- [ ] 将 `eq(table.field, value)` 改为 `{ field: value }`
- [ ] 将 `and(...)` 改为 `{ AND: [...] }` 或直接多字段
- [ ] 将 `or(...)` 改为 `{ OR: [...] }`
- [ ] 将 `isNull(table.field)` 改为 `{ field: { isNull: true } }`
- [ ] 将 `inArray(table.field, [...])` 改为 `{ field: { in: [...] } }`

## 最佳实践

### ✅ 推荐

```typescript
// 1. 使用 ctx.db.query（v2）
const data = await ctx.db.query.users.findMany({ ... });

// 2. 使用对象式 where
where: { status: 'active', role: { in: ['admin', 'user'] } }

// 3. 利用隐式 AND
where: { a: 1, b: 2 }  // 自动 AND

// 4. 结合关联过滤
where: { posts: { status: 'published' } }
```

### ❌ 避免

```typescript
// 1. 不要在新代码中使用 _query
const data = await ctx.db._query.users.findMany({ ... }); // ❌

// 2. 不要混用 v1 和 v2 语法
where: and({ status: 'active' }, eq(table.id, 1))  // ❌ 混用

// 3. 避免不必要的 RAW
where: { RAW: () => sql`status = 'active'` }  // ❌ 用对象式代替
```

## 相关文件

- `apps/server/src/db/scoped-db.ts` - ScopedDb 实现
- `apps/server/src/permission/casl-to-drizzle-v2.ts` - CASL 转换器
- `apps/server/src/permission/casl-to-sql.ts` - SQL 转换器（v1 兼容）

## 参考链接

- [Drizzle ORM v2 文档](https://orm.drizzle.team/docs/rqb-v2)
- [Drizzle v1/v2 迁移指南](https://orm.drizzle.team/docs/relations-v1-v2)
