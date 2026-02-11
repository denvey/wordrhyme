# auto-crud-server Middleware 最佳实践

**基于 i18n.ts 的优化经验（494 行 → 391 行，-20.9%）**

本文档详细说明使用 `@wordrhyme/auto-crud-server` 的最佳实践，所有涉及 CRUD 的代码必须遵循。

---

## 快速开始（零配置）

```typescript
import { createCrudRouter } from "@wordrhyme/auto-crud-server";
import { tasks } from "@/db/schema";

// 🚀 零配置！一行代码生成完整 CRUD 路由
export const tasksRouter = createCrudRouter({
  table: tasks,
  // Schema 自动从 table 派生：
  // - selectSchema: 完整字段
  // - insertSchema: 排除 id, createdAt, updatedAt（默认）
  // - updateSchema: insertSchema.partial()
});
```

**排除额外字段（使用 omitFields）：**

```typescript
import { createCrudRouter } from "@wordrhyme/auto-crud-server";
import { i18nLanguages } from "@/db/schema";

export const languagesRouter = createCrudRouter({
  table: i18nLanguages,
  // 排除额外字段（默认已排除 id, createdAt, updatedAt）
  omitFields: ['organizationId'],
});

// 更多字段示例
export const messagesRouter = createCrudRouter({
  table: i18nMessages,
  omitFields: ['organizationId', 'userModified', 'version'],
});
```

**自定义 updateSchema（高级场景）：**

```typescript
import { createCrudRouter } from "@wordrhyme/auto-crud-server";
import { tasks } from "@/db/schema";
import { z } from "zod";

export const tasksRouter = createCrudRouter({
  table: tasks,
  omitFields: ['organizationId'],
  // 自定义 updateSchema（只允许更新特定字段）
  updateSchema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['pending', 'done']).optional(),
  }),
});
```

---

## 核心原则

1. **信任框架能力**：auto-crud-server 已经处理了大部分常见逻辑
2. **依赖数据库约束**：用唯一索引代替应用层检查
3. **全局错误处理**：统一转换数据库错误为友好消息
4. **只写业务逻辑**：middleware 只处理缓存失效、业务规则检查等
5. **使用工具函数**：优先使用 `afterMiddleware`、`afterDelete` 等简化代码

---

## 1. Create 操作 - 依赖数据库约束

### ❌ 错误做法：手动查询检查重复

```typescript
middleware: {
  create: async ({ ctx, input, next }) => {
    // ❌ 多余的查询
    const existing = await ctx.db.query.i18nLanguages.findFirst({
      where: eq(i18nLanguages.locale, input.locale),
    });

    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Language already exists',
      });
    }

    // ❌ 手动注入 organizationId
    const created = await next({
      ...input,
      organizationId: ctx.organizationId!,
    });

    await invalidateCache(ctx.organizationId!);

    return created;
  },
}
```

### ✅ 正确做法：依赖数据库约束 + 全局错误处理器

**步骤 1：在 schema 中定义唯一约束**

```typescript
// db/schema/i18n.ts
uniqueIndex('i18n_languages_org_locale_uidx').on(
  table.organizationId,
  table.locale
)
```

**步骤 2：创建全局错误处理器**

```typescript
// utils/db-error-handler.ts
import { TRPCError } from '@trpc/server';

const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
} as const;

function isDatabaseError(error: unknown): error is {
  code: string;
  constraint?: string;
  detail?: string;
  table?: string;
  column?: string;
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as any).code === 'string'
  );
}

export function handleDatabaseError(error: unknown): never {
  if (!isDatabaseError(error)) {
    throw error;
  }

  switch (error.code) {
    case PG_ERROR_CODES.UNIQUE_VIOLATION: {
      const constraintName = error.constraint || '';

      let message = 'Resource already exists';

      if (constraintName.includes('i18n_languages')) {
        message = 'Language already exists';
      } else if (constraintName.includes('i18n_messages')) {
        message = 'Translation key already exists';
      }

      throw new TRPCError({
        code: 'CONFLICT',
        message,
        cause: error,
      });
    }

    case PG_ERROR_CODES.FOREIGN_KEY_VIOLATION: {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Referenced resource does not exist',
        cause: error,
      });
    }

    case PG_ERROR_CODES.NOT_NULL_VIOLATION: {
      const column = error.column || 'field';
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `${column} is required`,
        cause: error,
      });
    }

    default:
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Database operation failed',
        cause: error,
      });
  }
}
```

**步骤 3：集成到 tRPC**

```typescript
// trpc/trpc.ts
import { handleDatabaseError } from '../utils/db-error-handler';

const t = initTRPC
  .context<Context>()
  .meta<Meta>()
  .create({
    errorFormatter({ error, shape }) {
      // 自动转换数据库错误
      if (error.cause) {
        try {
          handleDatabaseError(error.cause);
        } catch (dbError) {
          if (dbError instanceof TRPCError) {
            return {
              ...shape,
              data: {
                ...shape.data,
                code: dbError.code,
              },
              message: dbError.message,
            };
          }
        }
      }
      return shape;
    },
  });
```

**步骤 4：Middleware 只做业务逻辑**

```typescript
import { afterMiddleware } from '@wordrhyme/auto-crud-server';

middleware: {
  create: afterMiddleware(async (ctx, created) => {
    await getCacheService().invalidateOrganization(ctx.organizationId!);
  }),
}
```

### 收益

- ✅ 代码减少 87.5%（24 行 → 3 行）
- ✅ 查询减少 50%（2 次 → 1 次）
- ✅ 并发安全（数据库级别保证）
- ✅ organizationId 自动注入（ScopedDb）

---

## 2. Update 操作 - 使用 existing 参数

### auto-crud-server 的 update middleware 签名

```typescript
update?: (params: {
  ctx: TContext;
  id: string;
  data: unknown;
  existing: unknown;  // ✅ 更新前的记录（已查询）
  next: (data?: unknown) => Promise<unknown>;
}) => Promise<unknown>;
```

### ✅ 正确做法

```typescript
middleware: {
  update: async ({ ctx, existing, data, next }) => {
    // ✅ 直接使用 existing，无需手动查询

    // 注入业务字段
    const updated = await next({
      ...data,
      userModified: true,
      version: existing.version + 1,
    });

    await getCacheService().invalidateNamespace(ctx.organizationId!, existing.namespace);

    return updated;
  },
}
```

### 关键点

- ✅ `existing` 已由 auto-crud-server 查询
- ✅ 如果记录不存在，auto-crud-server 已抛出 NOT_FOUND
- ✅ 无需手动查询和检查

---

## 3. Delete 操作 - 使用 afterMiddleware 或完整 middleware

### auto-crud-server 的 delete middleware 签名

```typescript
delete?: (params: {
  ctx: TContext;
  id: string;
  existing: unknown;  // ✅ 删除前的完整记录（已查询）
  next: () => Promise<unknown>;
}) => Promise<unknown>;
```

### 场景 1：只做缓存失效（最常见）

**✅ 使用 afterMiddleware**：

```typescript
import { afterMiddleware } from '@wordrhyme/auto-crud-server';

middleware: {
  delete: afterMiddleware(async (ctx, deleted) => {
    // deleted 就是被删除的记录
    await getCacheService().invalidateNamespace(ctx.organizationId!, deleted.namespace);
  }),
}
```

**收益**：
- ✅ 代码减少 83.3%（18 行 → 3 行）
- ✅ 查询减少 50%（2 次 → 1 次）
- ✅ 无需手动 NOT_FOUND 检查

### 场景 2：需要检查业务规则

**✅ 使用完整 middleware（访问 existing 参数）**：

```typescript
middleware: {
  delete: async ({ ctx, existing, next }) => {
    // 业务规则检查
    if (existing.isDefault) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot delete default language. Set another language as default first.',
      });
    }

    const deleted = await next();

    await getCacheService().invalidateLocale(ctx.organizationId!, existing.locale);

    return deleted;
  },
}
```

**收益**：
- ✅ 代码减少 50%（26 行 → 13 行）
- ✅ 无需手动查询和 NOT_FOUND 检查
- ✅ 保留业务规则检查

### ❌ 错误做法：手动查询

```typescript
middleware: {
  delete: async ({ ctx, input, next }) => {
    // ❌ 多余的查询
    const existing = await ctx.db.query.i18nMessages.findFirst({
      where: eq(i18nMessages.id, input),
    });

    // ❌ 多余的检查
    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Message not found',
      });
    }

    const deleted = await next(input);  // ❌ next() 不需要参数

    await invalidateCache(existing.namespace);

    return deleted;
  },
}
```

---

## 4. 批量操作 - 使用事务 + 批量查询

### 场景：batchUpdate 批量更新翻译

### ❌ 错误做法：N+1 查询问题

```typescript
batchUpdate: protectedProcedure
  .mutation(async ({ input, ctx }) => {
    const affectedNamespaces = new Set<string>();

    // ❌ N+1 查询：100 条更新 = 200 次查询
    for (const update of input.updates) {
      const message = await ctx.db.query.i18nMessages.findFirst({
        where: eq(i18nMessages.id, update.id),
      });

      if (message) {
        await ctx.db
          .update(i18nMessages)
          .set({
            translations: update.translations,
            userModified: true,
            version: message.version + 1,
          })
          .where(eq(i18nMessages.id, update.id));

        affectedNamespaces.add(message.namespace);
      }
    }

    // 缓存失效
    for (const namespace of affectedNamespaces) {
      await cacheService.invalidateNamespace(ctx.organizationId!, namespace);
    }

    return { updated: input.updates.length };
  }),
```

### ✅ 正确做法：事务 + 批量查询

```typescript
import { inArray } from 'drizzle-orm';

batchUpdate: protectedProcedure
  .mutation(async ({ input, ctx }) => {
    const affectedNamespaces = new Set<string>();

    // ✅ 使用事务保证原子性
    await ctx.db.transaction(async (tx) => {
      // ✅ 批量查询（1 次查询代替 N 次）
      const ids = input.updates.map(u => u.id);
      const messages = await tx.query.i18nMessages.findMany({
        where: inArray(i18nMessages.id, ids),
      });

      // ✅ 构建映射，O(1) 查找
      const messageMap = new Map(messages.map(m => [m.id, m]));

      // 批量更新
      for (const update of input.updates) {
        const message = messageMap.get(update.id);

        if (message) {
          await tx
            .update(i18nMessages)
            .set({
              translations: update.translations,
              userModified: true,
              version: message.version + 1,
            })
            .where(eq(i18nMessages.id, update.id));

          affectedNamespaces.add(message.namespace);
        }
      }
    });

    // 缓存失效
    const cacheService = getCacheService();
    for (const namespace of affectedNamespaces) {
      await cacheService.invalidateNamespace(ctx.organizationId!, namespace);
    }

    return { updated: input.updates.length };
  }),
```

### 收益

- ✅ 查询减少 49.5%（200 次 → 101 次）
- ✅ 事务安全（全部成功或全部回滚）
- ✅ 性能提升 50%（网络延迟减半）

---

## 5. 需要事务的操作 - 使用 ctx.db.transaction()

### 场景：setDefault 设置默认语言

### 问题：两次 UPDATE 操作，可能出现并发问题

```
T1: Request A: 清除所有默认
T2: Request B: 清除所有默认
T3: Request A: 设置 en-US 为默认
T4: Request B: 设置 zh-CN 为默认
结果: en-US 和 zh-CN 都是默认! ❌
```

### ✅ 正确做法：使用事务

```typescript
setDefault: protectedProcedure
  .mutation(async ({ input, ctx }) => {
    // ✅ 使用事务保证原子性
    const [updated] = await ctx.db.transaction(async (tx) => {
      const language = await tx.query.i18nLanguages.findFirst({
        where: and(
          eq(i18nLanguages.locale, input.locale),
          eq(i18nLanguages.isEnabled, true)
        ),
      });

      if (!language) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Language ${input.locale} not found or not enabled`,
        });
      }

      // 1. 清除所有默认标记
      await tx
        .update(i18nLanguages)
        .set({ isDefault: false })
        .where(eq(i18nLanguages.organizationId, ctx.organizationId!));

      // 2. 设置新默认
      return await tx
        .update(i18nLanguages)
        .set({ isDefault: true })
        .where(eq(i18nLanguages.id, language.id))
        .returning();
    });

    return updated;
  }),
```

### 收益

- ✅ 并发安全（事务隔离）
- ✅ 数据一致性（全部成功或全部回滚）
- ✅ ACID 保证

---

## 6. Middleware 工具函数速查

**⚠️ auto-crud-server 最新版本只保留 3 个中间件函数：**

```typescript
import {
  afterMiddleware,      // 操作后执行副作用（日志、通知、审计）
  beforeMiddleware,     // 操作前修改输入（注入用户ID、生成slug）
  composeMiddleware,    // 组合多个中间件（复杂场景）
} from '@wordrhyme/auto-crud-server';
```

### 使用示例

```typescript
// 🚀 零配置！Schema 自动从 table 派生
const tasksRouter = createCrudRouter({
  table: tasks,
  // 默认排除 id, createdAt, updatedAt
  // 使用 omitFields 排除额外字段
  omitFields: ['organizationId'],

  middleware: {
    // 场景 1：操作后执行副作用（create/update/delete 都适用）
    create: afterMiddleware(async (ctx, result) => {
      await sendEmail(result);
      await logAudit(ctx.user, 'create', result);
    }),

    // 场景 2：操作前修改输入（create/update 都适用）
    update: beforeMiddleware(async (ctx, data) => {
      return { ...data, updatedBy: ctx.user.id };
    }),

    // 场景 3：组合多个中间件
    delete: composeMiddleware(
      beforeMiddleware((ctx, input) => {
        console.log('before delete');
        return input;
      }),
      afterMiddleware((ctx, result) => {
        console.log('after delete');
      }),
    ),

    // 场景 4：需要业务逻辑判断时，使用完整 middleware
    delete: async ({ ctx, existing, next }) => {
      // 业务规则检查
      if (existing.isProtected) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete protected resource',
        });
      }

      const deleted = await next();

      // 副作用
      await invalidateCache(existing);

      return deleted;
    },
  },
});
```

### 重要变化

**之前的版本（已废弃）**：
```typescript
// ❌ 这些函数已被移除
afterDelete(...)
afterCreate(...)
afterUpdate(...)
afterList(...)
beforeList(...)
beforeCreate(...)
```

**现在的版本**：
```typescript
// ✅ 只保留 3 个通用函数
afterMiddleware(...)   // 适用于所有操作
beforeMiddleware(...)  // 适用于所有操作
composeMiddleware(...) // 组合多个中间件
```

---

## 7. 常见错误清单

| ❌ 错误 | ✅ 正确 | 原因 |
|--------|--------|------|
| 手动查询检查重复 | 依赖数据库唯一索引 | 性能更好，并发安全 |
| 手动注入 `organizationId` | ScopedDb 自动注入 | 避免遗漏，减少代码 |
| delete 手动查询 existing | 使用 `existing` 参数 | auto-crud-server 已查询 |
| delete 手动检查 NOT_FOUND | 信任 auto-crud-server | 已自动检查 |
| `await next(input)` | `await next()` | delete/update 的 next 不需要参数 |
| N+1 查询 | 批量查询 + Map | 性能提升 50% |
| 无事务保护 | `ctx.db.transaction()` | 数据一致性 |
| 数据库原生错误 | 全局错误处理器 | 友好错误消息 |

---

## 8. 完整示例

**参考实现**：`apps/server/src/trpc/routers/i18n.ts`

**优化文档**：
- `/docs/i18n-final-optimization-report.md` - v1 + v2 优化（数据库约束 + 事务）
- `/docs/i18n-v3-ultimate-optimization.md` - v3 delete 优化
- `/docs/i18n-ultra-simplified-refactor.md` - 极简重构方案

**优化成果**：
- 总代码：494 行 → 391 行（-20.9%）
- languages.create: 24 行 → 3 行（-87.5%）
- messages.delete: 18 行 → 3 行（-83.3%）
- batchUpdate 查询：200 次 → 101 次（-49.5%）

---

## 9. 关键原则总结

1. **信任 auto-crud-server 的能力**
   - existing 参数已自动查询
   - NOT_FOUND 已自动检查
   - 只需写业务逻辑

2. **依赖数据库约束而非应用层检查**
   - 唯一索引 → UNIQUE_VIOLATION
   - 外键约束 → FOREIGN_KEY_VIOLATION
   - 全局错误处理器 → 友好错误消息

3. **使用工具函数简化代码**
   - afterMiddleware - 最常用
   - afterDelete - delete 副作用
   - beforeMiddleware - 修改输入

4. **只写业务逻辑**
   - 缓存失效
   - 业务规则检查
   - 字段注入

5. **性能优化**
   - 批量查询（inArray）
   - 事务保证（transaction）
   - Map 优化查找（O(1)）

---

**状态**：✅ 已应用到 i18n.ts
**最后更新**：2025-01-XX
**维护者**：Claude Code
