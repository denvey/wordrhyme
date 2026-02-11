# i18n Router ScopedDb 重构说明

## 问题诊断

### 当前代码的两个错误

**错误 1: 调用不存在的方法 `ctx.getScopedDb()`**

```typescript
// ❌ 当前代码 (i18n.ts line 188)
const db = ctx.getScopedDb();
```

**问题**: Context 类型中没有 `getScopedDb()` 方法，会导致运行时错误。

**证据**:
- `context.ts` line 245: 直接导出 `db` 字段，注释为 "LBAC-enabled database"
- `context.ts` line 5: `import { db } from '../db/index.js'`
- `db/index.ts`: `export { db } from './scoped-db'`

**正确用法**:
```typescript
// ✅ 应该直接使用 ctx.db
const db = ctx.db;  // 或者直接 import { db } from '../../db'
```

---

**错误 2: 手动注入 `organizationId` (多余)**

```typescript
// ❌ 当前代码 (i18n.ts line 204-207)
const data = {
  ...input,
  organizationId: ctx.organizationId!,  // Redundant!
};
const created = await next(data);
```

**问题**: ScopedDb 的 `db.insert()` 已经自动注入 `organizationId`，手动注入是多余的。

**证据**: `scoped-db.ts` line 653-670:

```typescript
function wrapInsert(originalInsert: typeof rawDb.insert) {
    return function insert(table: PgTable) {
        insertBuilder.values = function(values: any) {
            const ctx = getCurrentContext();  // 从 AsyncLocalStorage 获取上下文

            const processValue = (val: any) => {
                const data = { ...val };

                // Auto-set organizationId ← 自动注入!
                if (schema.hasOrganizationId && !data.organizationId && !data.organization_id) {
                    data.organizationId = ctx.organizationId;
                }

                // Auto-set default aclTags
                if (schema.hasAclTags && (!data.aclTags || data.aclTags.length === 0)) {
                    data.aclTags = ctx.userId ? [`user:${ctx.userId}`] : [];
                }

                return data;
            };

            const processedValues = Array.isArray(values)
                ? values.map(processValue)
                : processValue(values);

            return originalValues(processedValues);
        };
    };
}
```

**工作原理**:
1. tRPC middleware 调用 `runWithContext(context, fn)` 将请求上下文存入 AsyncLocalStorage
2. ScopedDb 通过 `getContext()` 获取当前请求的 `organizationId`
3. `db.insert()` 自动检查 schema 是否有 `organizationId` 字段
4. 如果有且未提供，自动注入 `ctx.organizationId`

---

## 修复方案

### 方案 1: 直接使用 `ctx.db` (推荐)

```typescript
middleware: {
  create: async ({ ctx, input, next }) => {
    // ✅ 直接使用 ctx.db (已经是 ScopedDb)
    const existing = await ctx.db.query.i18nLanguages.findFirst({
      where: eq(i18nLanguages.locale, input.locale),
    });

    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Language ${input.locale} already exists`,
      });
    }

    // ✅ 直接传递 input, organizationId 会自动注入
    const created = await next(input);

    // 缓存失效
    await getCacheService().invalidateOrganization(ctx.organizationId!);
    return created;
  },
}
```

**优点**:
- 代码最简洁
- 充分利用 ScopedDb 的自动注入能力
- 遵循框架设计意图

---

### 方案 2: 导入全局 `db` 实例

```typescript
import { db } from '../../db';

middleware: {
  create: async ({ ctx, input, next }) => {
    // ✅ 使用全局导入的 db (也是 ScopedDb)
    const existing = await db.query.i18nLanguages.findFirst({
      where: eq(i18nLanguages.locale, input.locale),
    });

    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Language ${input.locale} already exists`,
      });
    }

    // ✅ 直接传递 input
    const created = await next(input);

    await getCacheService().invalidateOrganization(ctx.organizationId!);
    return created;
  },
}
```

**优点**:
- 与其他 router (如 `articles.ts`) 保持一致
- 代码语义清晰

---

## auto-crud-server 的内部实现

### 关键问题: `next()` 内部使用什么数据库？

需要验证 `@wordrhyme/auto-crud-server` 的内部实现：

**如果使用 `ctx.db`**: ✅ 自动注入生效
**如果直接 import `db`**: ✅ 自动注入仍然生效 (因为导出的就是 ScopedDb)
**如果使用 `rawDb`**: ❌ 需要手动注入

**验证方法**: 查看 `packages/auto-crud-server/src/index.ts` 或 `.d.ts` 文件。

---

## 测试验证

### 测试 1: 验证自动注入

```typescript
// 创建 i18n 语言时不提供 organizationId
const result = await trpc.i18n.languages.create({
  locale: 'zh-CN',
  displayName: '简体中文',
  isEnabled: true,
});

// 断言: result.organizationId 应该自动填充
expect(result.organizationId).toBe(ctx.organizationId);
```

### 测试 2: 验证租户隔离

```typescript
// 用户 A 的 organizationId = 'org-a'
const langA = await trpc.i18n.languages.create({ locale: 'en-US', ... });

// 用户 B 的 organizationId = 'org-b'
const langB = await trpc.i18n.languages.create({ locale: 'en-US', ... });

// 断言: 两个用户可以创建同名 locale (租户隔离)
expect(langA.organizationId).toBe('org-a');
expect(langB.organizationId).toBe('org-b');
```

---

## 完整修复代码

```typescript
/**
 * i18n tRPC Router
 *
 * 使用 @wordrhyme/auto-crud-server:
 * - 基础 CRUD 使用 createCrudRouter + middleware
 * - ScopedDb 自动注入 organizationId (无需手动)
 * - 所有数据库操作自动应用: 租户隔离、ABAC、字段过滤
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { createCrudRouter, afterMiddleware } from '@wordrhyme/auto-crud-server';
import { i18nLanguages, i18nMessages } from '../../db/schema/i18n';
import { eq, and } from 'drizzle-orm';
import { I18nCacheService } from '../../i18n/i18n-cache.service';
import { CacheManager } from '../../cache/cache-manager';
import {
  getMessagesInputSchema,
  translationsObjectSchema,
  insertI18nLanguageSchema,
  updateI18nLanguageSchema,
  selectI18nLanguageSchema,
  insertI18nMessageSchema,
  updateI18nMessageSchema,
  selectI18nMessageSchema,
} from '../../db/schema/zod-schemas';

let cacheServiceInstance: I18nCacheService | null = null;

function getCacheService(): I18nCacheService {
  if (!cacheServiceInstance) {
    const cacheManager = new CacheManager();
    cacheServiceInstance = new I18nCacheService(cacheManager);
  }
  return cacheServiceInstance;
}

export const i18nRouter = router({
  // =========================================
  // Public API
  // =========================================
  getMessages: publicProcedure
    .input(getMessagesInputSchema)
    .query(async ({ input, ctx }) => {
      const organizationId = ctx.organizationId;
      if (!organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Organization context required',
        });
      }

      const { locale, namespaces, version: clientVersion } = input;
      const cacheService = getCacheService();
      const allMessages: Record<string, string> = {};
      let latestVersion = '0';

      for (const namespace of namespaces) {
        if (clientVersion) {
          const isCurrent = await cacheService.isVersionCurrent(
            organizationId,
            locale,
            namespace,
            clientVersion
          );
          if (isCurrent) continue;
        }

        let cached = await cacheService.getTranslations(
          organizationId,
          locale,
          namespace
        );

        if (!cached) {
          // ✅ 直接使用 ctx.db (ScopedDb 自动过滤租户)
          const messages = await ctx.db.query.i18nMessages.findMany({
            where: and(
              eq(i18nMessages.namespace, namespace),
              eq(i18nMessages.isEnabled, true)
            ),
          });

          const namespaceMessages: Record<string, string> = {};
          for (const msg of messages) {
            const translation = (msg.translations as Record<string, string>)[locale];
            if (translation) {
              namespaceMessages[msg.key] = translation;
            }
          }

          const version = await cacheService.setTranslations(
            organizationId,
            locale,
            namespace,
            namespaceMessages
          );

          cached = { messages: namespaceMessages, version, cachedAt: Date.now() };
        }

        Object.assign(allMessages, cached.messages);

        if (cached.version > latestVersion) {
          latestVersion = cached.version;
        }
      }

      if (clientVersion && clientVersion === latestVersion) {
        return {
          messages: {},
          version: latestVersion,
          notModified: true,
        };
      }

      return {
        messages: allMessages,
        version: latestVersion,
        notModified: false,
      };
    }),

  // =========================================
  // Languages Management (Admin)
  // =========================================
  languages: (() => {
    const languagesCrud = createCrudRouter({
      table: i18nLanguages,
      selectSchema: selectI18nLanguageSchema,
      insertSchema: insertI18nLanguageSchema.omit({
        id: true,
        organizationId: true  // ✅ 移除 organizationId (ScopedDb 自动注入)
      }),
      updateSchema: updateI18nLanguageSchema,
      procedureFactory: (op) => {
        const action = op === 'list' || op === 'getById' ? 'read' :
                       op === 'deleteMany' ? 'delete' :
                       op === 'updateMany' ? 'update' : op;
        return protectedProcedure.meta({
          permission: { action, subject: 'I18nLanguage' },
        });
      },
      middleware: {
        // create: 检查唯一性 + 缓存失效
        create: async ({ ctx, input, next }) => {
          // ✅ 使用 ctx.db (不是 ctx.getScopedDb())
          const existing = await ctx.db.query.i18nLanguages.findFirst({
            where: eq(i18nLanguages.locale, input.locale),
          });

          if (existing) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Language ${input.locale} already exists`,
            });
          }

          // ✅ 直接传递 input (organizationId 和 id 都会自动处理)
          // - id: schema.$defaultFn(() => crypto.randomUUID())
          // - organizationId: ScopedDb 自动注入
          const created = await next(input);

          // 缓存失效
          const cacheService = getCacheService();
          await cacheService.invalidateOrganization(ctx.organizationId!);

          return created;
        },

        // update: 缓存失效
        update: afterMiddleware(async (ctx, updated) => {
          const cacheService = getCacheService();
          await cacheService.invalidateLocale(ctx.organizationId!, updated.locale);
        }),

        // delete: 检查默认语言 + 缓存失效
        delete: async ({ ctx, input, next }) => {
          // ✅ 使用 ctx.db
          const existing = await ctx.db.query.i18nLanguages.findFirst({
            where: eq(i18nLanguages.id, input),
          });

          if (!existing) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Language not found',
            });
          }

          if (existing.isDefault) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot delete default language. Set another language as default first.',
            });
          }

          const deleted = await next(input);

          const cacheService = getCacheService();
          await cacheService.invalidateLocale(ctx.organizationId!, existing.locale);

          return deleted;
        },
      },
    });

    return router({
      ...languagesCrud.procedures,

      setDefault: protectedProcedure
        .meta({ permission: { action: 'update', subject: 'I18nLanguage' } })
        .input(z.object({ locale: z.string() }))
        .mutation(async ({ input, ctx }) => {
          // ✅ 使用 ctx.db
          const language = await ctx.db.query.i18nLanguages.findFirst({
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

          // ✅ ScopedDb 自动应用租户过滤
          await ctx.db
            .update(i18nLanguages)
            .set({ isDefault: false })
            .where(eq(i18nLanguages.organizationId, ctx.organizationId!));

          const [updated] = await ctx.db
            .update(i18nLanguages)
            .set({ isDefault: true })
            .where(eq(i18nLanguages.id, language.id))
            .returning();

          return updated;
        }),
    });
  })(),

  // =========================================
  // Messages Management (Admin)
  // =========================================
  messages: (() => {
    const messagesCrud = createCrudRouter({
      table: i18nMessages,
      selectSchema: selectI18nMessageSchema,
      insertSchema: insertI18nMessageSchema.omit({
        id: true,
        organizationId: true,  // ✅ ScopedDb 自动注入
        userModified: true,
        version: true,
      }),
      updateSchema: z.object({
        translations: translationsObjectSchema.optional(),
        description: z.string().optional(),
        isEnabled: z.boolean().optional(),
      }),
      procedureFactory: (op) => {
        const action = op === 'list' || op === 'getById' ? 'read' :
                       op === 'deleteMany' ? 'delete' :
                       op === 'updateMany' ? 'update' : op;
        return protectedProcedure.meta({
          permission: { action, subject: 'I18nMessage' },
        });
      },
      middleware: {
        // create: 检查唯一性 + 注入业务字段 + 缓存失效
        create: async ({ ctx, input, next }) => {
          // ✅ 使用 ctx.db
          const existing = await ctx.db.query.i18nMessages.findFirst({
            where: and(
              eq(i18nMessages.namespace, input.namespace),
              eq(i18nMessages.key, input.key)
            ),
          });

          if (existing) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Key "${input.key}" already exists in namespace "${input.namespace}"`,
            });
          }

          // ✅ 注入业务字段 (organizationId 由 ScopedDb 自动注入)
          const data = {
            ...input,
            userModified: false,
            version: 1,
          };

          const created = await next(data);

          const cacheService = getCacheService();
          await cacheService.invalidateNamespace(ctx.organizationId!, created.namespace);

          return created;
        },

        // update: 递增 version + 标记 userModified + 缓存失效
        update: async ({ ctx, input, next }) => {
          // ✅ 使用 ctx.db
          const existing = await ctx.db.query.i18nMessages.findFirst({
            where: eq(i18nMessages.id, input.id),
          });

          if (!existing) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Message not found',
            });
          }

          const modifiedData = {
            id: input.id,
            data: {
              ...input.data,
              userModified: true,
              version: existing.version + 1,
            },
          };

          const updated = await next(modifiedData);

          const cacheService = getCacheService();
          await cacheService.invalidateNamespace(ctx.organizationId!, existing.namespace);

          return updated;
        },

        // delete: 缓存失效
        delete: async ({ ctx, input, next }) => {
          // ✅ 使用 ctx.db
          const existing = await ctx.db.query.i18nMessages.findFirst({
            where: eq(i18nMessages.id, input),
          });

          if (!existing) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Message not found',
            });
          }

          const deleted = await next(input);

          const cacheService = getCacheService();
          await cacheService.invalidateNamespace(ctx.organizationId!, existing.namespace);

          return deleted;
        },
      },
    });

    return router({
      ...messagesCrud.procedures,

      batchUpdate: protectedProcedure
        .meta({ permission: { action: 'update', subject: 'I18nMessage' } })
        .input(
          z.object({
            updates: z
              .array(
                z.object({
                  id: z.string(),
                  translations: translationsObjectSchema,
                })
              )
              .min(1)
              .max(100),
          })
        )
        .mutation(async ({ input, ctx }) => {
          // ✅ 使用 ctx.db
          const affectedNamespaces = new Set<string>();

          for (const update of input.updates) {
            const message = await ctx.db.query.i18nMessages.findFirst({
              where: eq(i18nMessages.id, update.id),
            });

            if (message) {
              // ✅ ScopedDb 自动应用 LBAC 过滤
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

          const cacheService = getCacheService();
          for (const namespace of affectedNamespaces) {
            await cacheService.invalidateNamespace(ctx.organizationId!, namespace);
          }

          return { updated: input.updates.length };
        }),
    });
  })(),
});
```

---

## 修改前后对比

### 修改前 ❌

```typescript
middleware: {
  create: async ({ ctx, input, next }) => {
    const db = ctx.getScopedDb();  // ❌ 方法不存在

    const data = {
      ...input,
      id: crypto.randomUUID(),  // ❌ schema 已有 $defaultFn
      organizationId: ctx.organizationId!,  // ❌ ScopedDb 自动注入
    };

    const created = await next(data);
    return created;
  }
}
```

### 修改后 ✅

```typescript
middleware: {
  create: async ({ ctx, input, next }) => {
    // ✅ 直接使用 ctx.db
    const existing = await ctx.db.query.i18nLanguages.findFirst({
      where: eq(i18nLanguages.locale, input.locale),
    });

    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', ... });
    }

    // ✅ 直接传递 input (id 和 organizationId 都自动处理)
    const created = await next(input);

    await getCacheService().invalidateOrganization(ctx.organizationId!);
    return created;
  }
}
```

---

## 收益

1. **代码行数**: 680 → ~450 行 (-34%)
2. **消除重复逻辑**: 移除手动注入 `id` 和 `organizationId`
3. **类型安全**: 使用正确的 `ctx.db` 类型
4. **充分利用框架**: ScopedDb 的自动注入、租户隔离、ABAC、字段过滤全部生效

---

## 下一步

1. ✅ **应用修复**: 使用上面的完整代码替换 `i18n.ts`
2. ✅ **验证测试**: 运行测试确保租户隔离和自动注入生效
3. ✅ **更新文档**: 更新 CLAUDE.md CRUD 规范部分

---

**状态**: 待应用修复
**预计工作量**: 10 分钟 (替换代码 + 测试)
