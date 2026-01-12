import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { TemplateService } from '../../notifications/index.js';
import type {
  TemplateCategory,
  NotificationPriority,
} from '../../db/schema/definitions.js';

/**
 * Notification Templates Router
 *
 * Provides endpoints for managing notification templates.
 */
export const notificationTemplatesRouter = router({
  /**
   * List notification templates
   */
  list: protectedProcedure
    .input(
      z
        .object({
          category: z.enum(['system', 'plugin', 'custom']).optional(),
          pluginId: z.string().optional(),
          includeDeprecated: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const templateService = new TemplateService();
      const options: {
        category?: TemplateCategory;
        pluginId?: string;
        includeDeprecated?: boolean;
      } = {};
      if (input?.category) options.category = input.category as TemplateCategory;
      if (input?.pluginId) options.pluginId = input.pluginId;
      if (input?.includeDeprecated !== undefined)
        options.includeDeprecated = input.includeDeprecated;
      return templateService.listTemplates(
        Object.keys(options).length > 0 ? options : undefined
      );
    }),

  /**
   * Get template by key
   */
  get: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const templateService = new TemplateService();
      const template = await templateService.getTemplateIncludingDeprecated(
        input.key
      );

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      return template;
    }),

  /**
   * Create or update template
   */
  upsert: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1).max(100),
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        category: z.enum(['system', 'plugin', 'custom']),
        title: z.record(z.string()), // i18n: { "en-US": "...", "zh-CN": "..." }
        message: z.record(z.string()), // i18n
        variables: z.array(z.string()).optional(),
        defaultChannels: z.array(z.string()).optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        pluginId: z.string().optional(),
        version: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const templateService = new TemplateService();

      return templateService.registerTemplate({
        key: input.key,
        name: input.name,
        description: input.description,
        category: input.category as TemplateCategory,
        title: input.title,
        message: input.message,
        variables: input.variables,
        defaultChannels: input.defaultChannels || ['in-app'],
        priority: (input.priority || 'normal') as NotificationPriority,
        pluginId: input.pluginId,
        version: input.version || 1,
        deprecated: false,
      });
    }),

  /**
   * Deprecate template
   */
  deprecate: protectedProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ input }) => {
      const templateService = new TemplateService();
      await templateService.deprecateTemplate(input.key);
      return { success: true };
    }),

  /**
   * Preview template with variables
   */
  preview: protectedProcedure
    .input(
      z.object({
        key: z.string(),
        variables: z.record(z.unknown()),
        locale: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const templateService = new TemplateService();
      const result = await templateService.renderTemplate(
        input.key,
        input.variables,
        input.locale
      );

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found or could not be rendered',
        });
      }

      return result;
    }),
});
