import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { NotificationService, PreferenceService } from '../../notifications';
import { db } from '../../db/index.js';
import { notifications, member } from '@wordrhyme/db';
import { eq } from 'drizzle-orm';
import type {
  NotificationType,
  NotificationPriority,
  NotificationCategory,
  NotificationSource,
  VisualPriority,
  AggregationStrategy,
} from '@wordrhyme/db';

/**
 * Notification Router
 *
 * Provides endpoints for notification management.
 * Supports unified notification contract for SaaS + Social scenarios.
 */
export const notificationRouter = router({
  /**
   * List notifications for current user
   * Supports strategy-based filtering and category filter
   */
  list: protectedProcedure
    .input(
      z.object({
        strategy: z.enum(['inbox', 'social-feed']).optional(),
        category: z.enum(['system', 'collaboration', 'social']).optional(),
        unreadOnly: z.boolean().optional(),
        includeArchived: z.boolean().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tenant context required',
        });
      }

      const notificationService = new NotificationService(
        new (await import('../../notifications')).TemplateService(),
        new (await import('../../notifications')).PreferenceService(),
        new (await import('../../notifications')).ChannelService(),
        new (await import('../../events')).EventBus()
      );

      // Build options object, omitting undefined values
      const options: {
        strategy?: 'inbox' | 'social-feed';
        category?: NotificationCategory;
        unreadOnly?: boolean;
        includeArchived?: boolean;
        limit?: number;
        cursor?: string;
      } = {};

      if (input?.strategy) options.strategy = input.strategy;
      if (input?.category) options.category = input.category as NotificationCategory;
      if (input?.unreadOnly !== undefined) options.unreadOnly = input.unreadOnly;
      if (input?.includeArchived !== undefined) options.includeArchived = input.includeArchived;
      if (input?.limit) options.limit = input.limit;
      if (input?.cursor) options.cursor = input.cursor;

      return notificationService.listNotificationsWithStrategy(
        ctx.userId!,
        ctx.organizationId,
        Object.keys(options).length > 0 ? options : undefined
      );
    }),

  /**
   * List grouped/aggregated notifications
   * Returns notifications grouped by groupKey for social-style display
   */
  listGrouped: protectedProcedure
    .input(
      z.object({
        strategy: z.enum(['inbox', 'social-feed']).optional(),
        category: z.enum(['system', 'collaboration', 'social']).optional(),
        unreadOnly: z.boolean().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tenant context required',
        });
      }

      const notificationService = new NotificationService(
        new (await import('../../notifications')).TemplateService(),
        new (await import('../../notifications')).PreferenceService(),
        new (await import('../../notifications')).ChannelService(),
        new (await import('../../events')).EventBus()
      );

      // Build options object, omitting undefined values
      const options: {
        strategy?: 'inbox' | 'social-feed';
        category?: NotificationCategory;
        unreadOnly?: boolean;
        limit?: number;
        cursor?: string;
      } = {};

      if (input?.strategy) options.strategy = input.strategy;
      if (input?.category) options.category = input.category as NotificationCategory;
      if (input?.unreadOnly !== undefined) options.unreadOnly = input.unreadOnly;
      if (input?.limit) options.limit = input.limit;
      if (input?.cursor) options.cursor = input.cursor;

      return notificationService.listGroupedNotifications(
        ctx.userId!,
        ctx.organizationId,
        Object.keys(options).length > 0 ? options : undefined
      );
    }),

  /**
   * Get single notification
   */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tenant context required',
        });
      }

      const notificationService = new NotificationService(
        new (await import('../../notifications')).TemplateService(),
        new (await import('../../notifications')).PreferenceService(),
        new (await import('../../notifications')).ChannelService(),
        new (await import('../../events')).EventBus()
      );

      const notification = await notificationService.getNotification(
        input.id,
        ctx.userId!,
        ctx.organizationId
      );

      if (!notification) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification not found',
        });
      }

      return notification;
    }),

  /**
   * Mark notification as read
   */
  markAsRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tenant context required',
        });
      }

      const notificationService = new NotificationService(
        new (await import('../../notifications')).TemplateService(),
        new (await import('../../notifications')).PreferenceService(),
        new (await import('../../notifications')).ChannelService(),
        new (await import('../../events')).EventBus()
      );

      const notification = await notificationService.markAsRead(
        input.id,
        ctx.userId!,
        ctx.organizationId
      );

      if (!notification) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification not found',
        });
      }

      return notification;
    }),

  /**
   * Mark all notifications as read
   * Supports optional category filter
   */
  markAllAsRead: protectedProcedure
    .input(
      z.object({
        category: z.enum(['system', 'collaboration', 'social']).optional(),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tenant context required',
        });
      }

      const notificationService = new NotificationService(
        new (await import('../../notifications')).TemplateService(),
        new (await import('../../notifications')).PreferenceService(),
        new (await import('../../notifications')).ChannelService(),
        new (await import('../../events')).EventBus()
      );

      const count = await notificationService.markAllAsReadWithFilter(
        ctx.userId!,
        ctx.organizationId,
        input?.category as NotificationCategory | undefined
      );

      return { count };
    }),

  /**
   * Mark all notifications in a group as read
   */
  markGroupAsRead: protectedProcedure
    .input(z.object({ groupKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tenant context required',
        });
      }

      const notificationService = new NotificationService(
        new (await import('../../notifications')).TemplateService(),
        new (await import('../../notifications')).PreferenceService(),
        new (await import('../../notifications')).ChannelService(),
        new (await import('../../events')).EventBus()
      );

      const count = await notificationService.markGroupAsRead(
        input.groupKey,
        ctx.userId!,
        ctx.organizationId
      );

      return { count };
    }),

  /**
   * Archive notification
   */
  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tenant context required',
        });
      }

      const notificationService = new NotificationService(
        new (await import('../../notifications')).TemplateService(),
        new (await import('../../notifications')).PreferenceService(),
        new (await import('../../notifications')).ChannelService(),
        new (await import('../../events')).EventBus()
      );

      const notification = await notificationService.archive(
        input.id,
        ctx.userId!,
        ctx.organizationId
      );

      if (!notification) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification not found',
        });
      }

      return notification;
    }),

  /**
   * Get unread count
   * Returns both raw count and grouped count
   */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Tenant context required',
      });
    }

    const notificationService = new NotificationService(
      new (await import('../../notifications')).TemplateService(),
      new (await import('../../notifications')).PreferenceService(),
      new (await import('../../notifications')).ChannelService(),
      new (await import('../../events')).EventBus()
    );

    const [count, groupedCount] = await Promise.all([
      notificationService.getUnreadCount(ctx.userId!, ctx.organizationId),
      notificationService.getGroupedUnreadCount(ctx.userId!, ctx.organizationId),
    ]);

    return { count, groupedCount };
  }),

  /**
   * Pin a notification (system category only)
   */
  pin: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tenant context required',
        });
      }

      const notificationService = new NotificationService(
        new (await import('../../notifications')).TemplateService(),
        new (await import('../../notifications')).PreferenceService(),
        new (await import('../../notifications')).ChannelService(),
        new (await import('../../events')).EventBus()
      );

      try {
        const notification = await notificationService.pin(
          input.id,
          ctx.userId!,
          ctx.organizationId
        );

        if (!notification) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Notification not found',
          });
        }

        return notification;
      } catch (error) {
        if (error instanceof Error && error.message.includes('Only system')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Unpin a notification
   */
  unpin: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tenant context required',
        });
      }

      const notificationService = new NotificationService(
        new (await import('../../notifications')).TemplateService(),
        new (await import('../../notifications')).PreferenceService(),
        new (await import('../../notifications')).ChannelService(),
        new (await import('../../events')).EventBus()
      );

      const notification = await notificationService.unpin(
        input.id,
        ctx.userId!,
        ctx.organizationId
      );

      if (!notification) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification not found',
        });
      }

      return notification;
    }),

  /**
   * Create notification (internal use)
   */
  create: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        templateKey: z.string(),
        variables: z.record(z.unknown()),
        type: z.enum(['info', 'success', 'warning', 'error']).optional(),
        link: z.string().optional(),
        actorId: z.string().optional(),
        entityId: z.string().optional(),
        entityType: z.string().optional(),
        groupKey: z.string().optional(),
        idempotencyKey: z.string().optional(),
        priorityOverride: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        channelOverrides: z.array(z.string()).optional(),
        locale: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tenant context required',
        });
      }

      const notificationService = new NotificationService(
        new (await import('../../notifications')).TemplateService(),
        new (await import('../../notifications')).PreferenceService(),
        new (await import('../../notifications')).ChannelService(),
        new (await import('../../events')).EventBus()
      );

      return notificationService.createNotification({
        ...input,
        organizationId: ctx.organizationId,
        type: input.type as NotificationType | undefined,
        priorityOverride: input.priorityOverride as NotificationPriority | undefined,
      });
    }),

  /**
   * Send test notification directly (without template)
   * For testing purposes only
   */
  sendTest: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        message: z.string().min(1),
        type: z.enum(['info', 'success', 'warning', 'error']).default('info'),
        toAllMembers: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tenant context required',
        });
      }

      const results: { userId: string; notificationId: string }[] = [];

      if (input.toAllMembers) {
        // Get all members in the organization
        const members = await db
          .select({ userId: member.userId })
          .from(member)
          .where(eq(member.organizationId, ctx.organizationId));

        for (const m of members) {
          const [notification] = await db
            .insert(notifications)
            .values({
              userId: m.userId,
              organizationId: ctx.organizationId,
              type: input.type,
              title: input.title,
              message: input.message,
              priority: 'normal',
              channelsSent: ['in-app'],
              metadata: { source: 'test' },
            })
            .returning();

          if (notification) {
            results.push({
              userId: m.userId,
              notificationId: notification.id,
            });
          }
        }
      } else {
        // Send to current user only
        const [notification] = await db
          .insert(notifications)
          .values({
            userId: ctx.userId!,
            organizationId: ctx.organizationId,
            type: input.type,
            title: input.title,
            message: input.message,
            priority: 'normal',
            channelsSent: ['in-app'],
            metadata: { source: 'test' },
          })
          .returning();

        if (notification) {
          results.push({
            userId: ctx.userId!,
            notificationId: notification.id,
          });
        }
      }

      return {
        success: true,
        count: results.length,
        notifications: results,
      };
    }),
});
