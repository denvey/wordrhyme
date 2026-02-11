/**
 * i18n tRPC Router - 简化版
 *
 * 使用 @wordrhyme/auto-crud-server:
 * - ✅ 基础 CRUD 完全自动化
 * - ✅ ScopedDb 自动注入 organizationId
 * - ✅ 数据库约束处理重复数据
 * - ✅ 全局错误处理器转换友好错误消息
 * - ✅ Middleware 只写业务逻辑（缓存失效）
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
        organizationId: true,
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
        // ✅ 只做缓存失效（3 行代码！）
        create: afterMiddleware(async (ctx, created) => {
          await getCacheService().invalidateOrganization(ctx.organizationId!);
        }),

        update: afterMiddleware(async (ctx, updated) => {
          await getCacheService().invalidateLocale(ctx.organizationId!, updated.locale);
        }),

        delete: async ({ ctx, input, next }) => {
          // delete 需要检查是否是默认语言（业务规则）
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

          await getCacheService().invalidateLocale(ctx.organizationId!, existing.locale);

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
        organizationId: true,
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
        // ✅ create: 注入业务字段 + 缓存失效
        create: async ({ ctx, input, next }) => {
          const created = await next({
            ...input,
            userModified: false,
            version: 1,
          });

          await getCacheService().invalidateNamespace(ctx.organizationId!, created.namespace);

          return created;
        },

        // ✅ update: 递增 version + 标记 userModified + 缓存失效
        update: async ({ ctx, input, next }) => {
          const existing = await ctx.db.query.i18nMessages.findFirst({
            where: eq(i18nMessages.id, input.id),
          });

          if (!existing) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Message not found',
            });
          }

          const updated = await next({
            id: input.id,
            data: {
              ...input.data,
              userModified: true,
              version: existing.version + 1,
            },
          });

          await getCacheService().invalidateNamespace(ctx.organizationId!, existing.namespace);

          return updated;
        },

        // ✅ delete: 缓存失效
        delete: async ({ ctx, input, next }) => {
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

          await getCacheService().invalidateNamespace(ctx.organizationId!, existing.namespace);

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
          const affectedNamespaces = new Set<string>();

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

          const cacheService = getCacheService();
          for (const namespace of affectedNamespaces) {
            await cacheService.invalidateNamespace(ctx.organizationId!, namespace);
          }

          return { updated: input.updates.length };
        }),
    });
  })(),
});
