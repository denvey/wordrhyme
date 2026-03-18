/**
 * i18n tRPC Router
 *
 * Provides public and admin APIs for internationalization.
 *
 * Public API:
 * - getMessages: Fetch translations for client (with version caching)
 *
 * Admin API:
 * - languages.*: Language management (CRUD + setDefault)
 * - messages.*: Translation management (CRUD + batchUpdate)
 *
 * 使用 @wordrhyme/auto-crud-server:
 * - ✅ 基础 CRUD 完全自动化
 * - ✅ ScopedDb 自动注入 organizationId
 * - ✅ 数据库约束处理重复数据（全局错误处理器转换友好错误）
 * - ✅ Middleware 只写业务逻辑（缓存失效、版本控制）
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import type { Context } from '../context';
import { createCrudRouter, afterMiddleware } from '@wordrhyme/auto-crud-server';
import {
  i18nLanguages,
  i18nMessages,
  type I18nLanguage,
  type I18nMessage,
  getI18nMessagesQuery,
  translationsObjectSchema,
} from '@wordrhyme/db';
import { eq } from 'drizzle-orm';
import { I18nCacheService } from '../../i18n/i18n-cache.service';
import { CacheManager } from '../../cache/cache-manager';

/**
 * Lazy-initialized cache service
 */
let cacheServiceInstance: I18nCacheService | null = null;

function getCacheService(): I18nCacheService {
  if (!cacheServiceInstance) {
    const cacheManager = new CacheManager();
    cacheServiceInstance = new I18nCacheService(cacheManager);
  }
  return cacheServiceInstance;
}

/**
 * Maps tRPC operations to permission actions
 */
const getPermissionAction = (op: string): string => {
  const map: Record<string, string> = {
    list: 'read',
    get: 'read',
    getById: 'read',
    create: 'create',
    read: 'read',
    update: 'update',
    delete: 'delete',
    deleteMany: 'delete',
    updateMany: 'update',
  };
  return map[op] ?? 'read';
};

/**
 * i18n Router
 */
export const i18nRouter = router({
  // =========================================
  // Public API
  // =========================================

  /**
   * Get translations for client
   *
   * Supports version-based caching:
   * - If client sends version that matches, returns notModified: true
   * - Otherwise returns full messages with new version
   *
   * @public
   */
  getMessages: publicProcedure
    .input(getI18nMessagesQuery)
    .query(async ({ input, ctx }) => {
      const { organizationId } = ctx;
      if (!organizationId) {
        // 登录页没有组织上下文，返回空翻译
        return {
          messages: {},
          version: '0',
          notModified: false,
        };
      }

      if (!ctx.db) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database not available',
        });
      }

      const { locale, namespaces = ['common'], version: clientVersion } = input;
      const cacheService = getCacheService();

      // Merge messages from all namespaces
      const allMessages: Record<string, string> = {};
      let latestVersion = '0';

      for (const namespace of namespaces) {
        // Check if client version is current
        if (clientVersion) {
          const isCurrent = await cacheService.isVersionCurrent(
            organizationId,
            locale,
            namespace,
            clientVersion
          );
          if (isCurrent) continue; // Client has latest, skip fetching
        }

        // Try cache first
        let cached = await cacheService.getTranslations(organizationId, locale, namespace);

        if (!cached) {
          // Fetch from database using ScopedDb Query API (v2, LBAC auto-injected)
          const messages = await (ctx.db as any).query.i18nMessages.findMany({
            where: {
              namespace,
              isEnabled: true,
            },
          });

          // Build messages map
          const namespaceMessages: Record<string, string> = {};
          for (const msg of messages) {
            const translation = (msg.translations as Record<string, string>)[locale];
            if (translation) {
              namespaceMessages[msg.key] = translation;
            }
          }

          // Cache the result
          const version = await cacheService.setTranslations(
            organizationId,
            locale,
            namespace,
            namespaceMessages
          );

          cached = { messages: namespaceMessages, version, cachedAt: Date.now() };
        }

        // Merge into result
        Object.assign(allMessages, cached.messages);

        // Track latest version
        if (cached.version > latestVersion) {
          latestVersion = cached.version;
        }
      }

      // If client version matches latest, return not modified
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
      // 🚀 零配置 + omitFields 排除额外字段
      omitFields: ['organizationId'],  // 默认已排除 id, createdAt, updatedAt
      procedure: (op: string) => {
        // list/get 操作公开访问（语言列表在登录页就需要）
        if (op === 'list' || op === 'get') {
          return publicProcedure;
        }
        // 其他操作（create/update/delete）需要权限检查
        return protectedProcedure.meta({
          permission: { action: getPermissionAction(op), subject: 'I18nLanguage' },
        });
      },
      middleware: {
        // ✅ create: 只做缓存失效（重复性检查由数据库约束处理）
        create: afterMiddleware(async (ctx: Context, _created) => {
          await getCacheService().invalidateOrganization(ctx.organizationId!);
        }) as any,

        // ✅ update: 缓存失效
        update: afterMiddleware(async (ctx: Context, updated: I18nLanguage) => {
          await getCacheService().invalidateLocale(ctx.organizationId!, updated.locale);
        }) as any,

        // ✅ delete: 检查默认语言 + 缓存失效（auto-crud-server 已自动查询 existing）
        delete: (async ({ ctx, existing, next }: any) => {
          // 业务规则：不能删除默认语言
          if ((existing as I18nLanguage).isDefault) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot delete default language. Set another language as default first.',
            });
          }

          const deleted = await next();

          await getCacheService().invalidateLocale((ctx as Context).organizationId!, (existing as I18nLanguage).locale);

          return deleted;
        }) as any,
      },
    } as const);

    return router({
      ...languagesCrud.procedures,

      /**
       * Custom: Set a language as default
       */
      setDefault: protectedProcedure
        .meta({ permission: { action: 'update', subject: 'I18nLanguage' } })
        .input(z.object({ locale: z.string() }))
        .mutation(async ({ input, ctx }) => {
          if (!ctx.db) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
          }

          // ✅ Use transaction for data consistency
          const [updated] = await ctx.db.transaction(async (tx) => {
            const txDb = tx as any;
            const language = await (tx.query as any).i18nLanguages.findFirst({
              where: {
                locale: input.locale,
                isEnabled: true,
              },
            });

            if (!language) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: `Language ${input.locale} not found or not enabled`,
              });
            }

            // 1. Clear all default flags (ScopedDb auto-injects organizationId filter)
            await txDb
              .update(i18nLanguages)
              .set({ isDefault: false });

            // 2. Set new default
            return await txDb
              .update(i18nLanguages)
              .set({ isDefault: true })
              .where(eq(i18nLanguages.id, language.id))
              .returning();
          });

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
      // 🚀 零配置 + omitFields 排除额外字段
      omitFields: ['organizationId', 'userModified', 'version'],  // 默认已排除 id, createdAt, updatedAt
      updateSchema: z.object({
        translations: translationsObjectSchema.optional() as any,
        description: z.string().optional(),
        isEnabled: z.boolean().optional(),
      }),
      procedure: (op: string) => {
        // list/get 操作公开访问（翻译内容在登录页就需要）
        if (op === 'list' || op === 'get') {
          return publicProcedure;
        }
        // 其他操作（create/update/delete）需要权限检查
        return protectedProcedure.meta({
          permission: { action: getPermissionAction(op), subject: 'I18nMessage' },
        });
      },
      middleware: {
        // ✅ create: 注入业务字段 + 缓存失效（重复性检查由数据库约束处理）
        create: (async ({ ctx, input, next }: any) => {
          const payload = (input ?? {}) as Record<string, unknown>;
          const created = await next({
            ...payload,
            userModified: false,
            version: 1,
          }) as I18nMessage;

          await getCacheService().invalidateNamespace((ctx as Context).organizationId!, created.namespace);

          return created;
        }) as any,

        // ✅ update: 递增 version + 标记 userModified + 缓存失效
        update: (async ({ ctx, data, existing, next }: any) => {
          const existingMessage = existing as I18nMessage;
          const patch = (data ?? {}) as Record<string, unknown>;
          const updated = await next({
            ...patch,
            userModified: true,
            version: existingMessage.version + 1,
          }) as I18nMessage;

          await getCacheService().invalidateNamespace((ctx as Context).organizationId!, existingMessage.namespace);

          return updated;
        }) as any,

        // ✅ delete: 缓存失效（auto-crud-server 已自动查询 existing）
        delete: afterMiddleware(async (ctx: Context, deleted: I18nMessage) => {
          await getCacheService().invalidateNamespace(ctx.organizationId!, deleted.namespace);
        }) as any,
      },
    } as const);

    return router({
      ...messagesCrud.procedures,

      /**
       * Custom: Batch update translations
       */
      batchUpdate: protectedProcedure
        .meta({ permission: { action: 'update', subject: 'I18nMessage' } })
        .input(
          z.object({
            updates: z
              .array(
                z.object({
                  id: z.string(),
                  translations: translationsObjectSchema as any,
                })
              )
              .min(1)
              .max(100),
          })
        )
        .mutation(async ({ input, ctx }) => {
          if (!ctx.db) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
          }

          const affectedNamespaces = new Set<string>();

          // ✅ Use transaction + batch query for performance
          await ctx.db.transaction(async (tx) => {
            // ✅ Batch query (1 query instead of N)
            const ids = input.updates.map(u => u.id);
            const messages = await (tx.query as any).i18nMessages.findMany({
              where: { id: { in: ids } },
            }) as I18nMessage[];

            // Build id -> message map for fast lookup
            const messageMap = new Map<string, I18nMessage>(messages.map((m: I18nMessage) => [m.id, m]));

            // Process updates
            for (const update of input.updates) {
              const message = messageMap.get(update.id);

              if (message) {
                await (tx as any)
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

          // Invalidate cache for affected namespaces
          const cacheService = getCacheService();
          for (const namespace of affectedNamespaces) {
            await cacheService.invalidateNamespace(ctx.organizationId!, namespace);
          }

          return { updated: input.updates.length };
        }),
    });
  })(),
});
