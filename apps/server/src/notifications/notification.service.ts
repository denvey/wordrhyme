import { Injectable } from '@nestjs/common';
import { eq, and, desc, lt, sql, or, isNotNull, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  notifications,
  type Notification,
  type NotificationPriority,
  type NotificationType,
  type NotificationSource,
  type NotificationCategory,
  type NotificationActor,
  type NotificationTarget,
  type VisualPriority,
  type AggregationStrategy,
  type GroupedNotification,
} from '../db/schema/definitions.js';
import { RETENTION_POLICIES, DISPLAY_CONFIGS } from '../db/schema/notifications.js';
import { TemplateService } from './template.service.js';
import { PreferenceService } from './preference.service.js';
import { ChannelService } from './channel.service.js';
import { EventBus, type NotificationCreatedEvent } from '../events/index.js';
import {
  ViewStrategyRegistry,
  type NotificationViewStrategy,
  type ViewContext,
} from './view-strategy.js';

/**
 * Input for creating a notification
 */
export interface CreateNotificationInput {
  userId: string;
  organizationId: string;
  templateKey: string;
  variables: Record<string, unknown>;
  type?: NotificationType | undefined;
  link?: string | undefined;
  actorId?: string | undefined;
  entityId?: string | undefined;
  entityType?: string | undefined;
  groupKey?: string | undefined;
  idempotencyKey?: string | undefined;
  sourcePluginId?: string | undefined;
  priorityOverride?: NotificationPriority | undefined;
  channelOverrides?: string[] | undefined;
  locale?: string | undefined;
  // New fields for unified contract
  source?: NotificationSource | undefined;
  category?: NotificationCategory | undefined;
  actor?: NotificationActor | undefined;
  target?: NotificationTarget | undefined;
  visualPriority?: VisualPriority | undefined;
  aggregationStrategy?: AggregationStrategy | undefined;
}

/**
 * Result of notification creation
 */
export interface CreateNotificationResult {
  notification: Notification;
  channels: string[];
  decisionTrace: Array<{ channel: string; included: boolean; reason: string }>;
}

/**
 * Notification Service
 *
 * Core service for creating and managing notifications.
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly templateService: TemplateService,
    private readonly preferenceService: PreferenceService,
    private readonly channelService: ChannelService,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Create a notification
   */
  async createNotification(
    input: CreateNotificationInput
  ): Promise<CreateNotificationResult> {
    // 1. Get and render template
    const template = await this.templateService.getTemplate(input.templateKey);
    if (!template) {
      throw new Error(`Template not found: ${input.templateKey}`);
    }

    const rendered = await this.templateService.renderTemplate(
      input.templateKey,
      input.variables,
      input.locale
    );
    if (!rendered) {
      throw new Error(`Failed to render template: ${input.templateKey}`);
    }

    // 2. Determine priority
    const priority =
      input.priorityOverride ||
      (template.priority as NotificationPriority) ||
      'normal';

    // 3. Resolve channels
    const defaultChannels =
      input.channelOverrides ||
      (template.defaultChannels as string[]) ||
      ['in-app'];

    const { channels, decisionTrace } =
      await this.preferenceService.resolveChannels(
        input.userId,
        input.organizationId,
        input.templateKey,
        defaultChannels,
        priority
      );

    // 4. Check for idempotency (if key provided)
    if (input.idempotencyKey) {
      const [existing] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, input.userId),
            eq(notifications.organizationId, input.organizationId),
            eq(notifications.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1);

      if (existing) {
        return {
          notification: existing,
          channels,
          decisionTrace,
        };
      }
    }

    // 5. Determine visual priority from display configs
    const visualPriority =
      input.visualPriority ||
      DISPLAY_CONFIGS.find((c) => c.type === (input.type || 'info'))
        ?.visualPriority ||
      'medium';

    // 6. Create notification record
    const [notification] = await db
      .insert(notifications)
      .values({
        userId: input.userId,
        organizationId: input.organizationId,
        templateKey: input.templateKey,
        templateVariables: input.variables,
        type: input.type || 'info',
        title: rendered.title,
        message: rendered.message,
        link: input.link,
        priority,
        actorId: input.actorId,
        entityId: input.entityId,
        entityType: input.entityType,
        groupKey: input.groupKey,
        idempotencyKey: input.idempotencyKey,
        sourcePluginId: input.sourcePluginId,
        channelsSent: channels,
        // New unified contract fields
        source: input.source || (input.sourcePluginId ? 'plugin' : 'system'),
        category: input.category || 'system',
        actor: input.actor,
        target: input.target,
        visualPriority,
        aggregationStrategy: input.aggregationStrategy || 'none',
        metadata: {
          decisionTrace,
          locale: input.locale || 'en-US',
        },
      })
      .returning();

    if (!notification) {
      throw new Error('Failed to create notification');
    }

    // 7. Update latest actors if aggregating
    if (input.groupKey && input.actor) {
      await this.updateLatestActors(
        input.groupKey,
        input.userId,
        input.organizationId,
        input.actor
      );
    }

    // 8. Get user preferences for event
    const preference = await this.preferenceService.getPreference(
      input.userId,
      input.organizationId
    );

    // 9. Emit event for plugin enhancement
    const event: NotificationCreatedEvent = {
      notification: {
        id: notification.id,
        userId: notification.userId,
        organizationId: notification.organizationId,
        templateKey: notification.templateKey || undefined,
        templateVariables: notification.templateVariables as Record<string, unknown> | undefined,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        link: notification.link || undefined,
        priority: notification.priority as NotificationPriority,
        actorId: notification.actorId || undefined,
        entityId: notification.entityId || undefined,
        entityType: notification.entityType || undefined,
        groupKey: notification.groupKey || undefined,
        sourcePluginId: notification.sourcePluginId || undefined,
      },
      user: {
        id: input.userId,
        preferences: {
          enabledChannels: preference.enabledChannels as string[],
          templateOverrides: (preference.templateOverrides as Record<string, string[]>) || {},
          quietHours: preference.quietHours as { enabled: boolean; start: string; end: string; timezone: string } | undefined,
          emailFrequency: preference.emailFrequency as 'instant' | 'hourly' | 'daily',
        },
      },
      channels,
      decisionTrace,
    };

    this.eventBus.emitAsync('notification.created', event);

    return {
      notification,
      channels,
      decisionTrace,
    };
  }

  /**
   * Get notification by ID
   */
  async getNotification(
    id: string,
    userId: string,
    organizationId: string
  ): Promise<Notification | null> {
    const [result] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId)
        )
      )
      .limit(1);

    return result || null;
  }

  /**
   * List notifications for user
   */
  async listNotifications(
    userId: string,
    organizationId: string,
    options?: {
      unreadOnly?: boolean | undefined;
      includeArchived?: boolean | undefined;
      limit?: number | undefined;
      cursor?: string | undefined;
    }
  ): Promise<{ notifications: Notification[]; nextCursor: string | null }> {
    const limit = options?.limit || 20;
    const conditions = [
      eq(notifications.userId, userId),
      eq(notifications.organizationId, organizationId),
    ];

    if (options?.unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    if (!options?.includeArchived) {
      conditions.push(eq(notifications.archived, false));
    }

    if (options?.cursor) {
      conditions.push(lt(notifications.createdAt, new Date(options.cursor)));
    }

    const results = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, -1) : results;
    const nextCursor = hasMore
      ? items[items.length - 1]?.createdAt.toISOString() || null
      : null;

    return {
      notifications: items,
      nextCursor,
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(
    id: string,
    userId: string,
    organizationId: string
  ): Promise<Notification | null> {
    const [result] = await db
      .update(notifications)
      .set({
        read: true,
      })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId)
        )
      )
      .returning();

    return result || null;
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string, organizationId: string): Promise<number> {
    const result = await db
      .update(notifications)
      .set({
        read: true,
      })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId),
          eq(notifications.read, false)
        )
      );

    // Drizzle returns different shapes based on driver
    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  }

  /**
   * Archive notification
   */
  async archive(
    id: string,
    userId: string,
    organizationId: string
  ): Promise<Notification | null> {
    const [result] = await db
      .update(notifications)
      .set({
        archived: true,
      })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId)
        )
      )
      .returning();

    return result || null;
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: string, organizationId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId),
          eq(notifications.read, false),
          eq(notifications.archived, false)
        )
      );

    return result?.count ?? 0;
  }

  /**
   * Cleanup old notifications (for scheduled job)
   */
  async cleanupOldNotifications(
    organizationId: string,
    retentionDays: number = 90
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await db.delete(notifications).where(
      and(
        eq(notifications.organizationId, organizationId),
        lt(notifications.createdAt, cutoffDate),
        or(
          eq(notifications.archived, true),
          eq(notifications.read, true)
        )
      )
    );

    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  }

  // ========== NEW UNIFIED CONTRACT METHODS ==========

  /**
   * Update latest actors for aggregated notifications
   * Maintains a list of recent actors for display ("Alice and 4 others...")
   */
  private async updateLatestActors(
    groupKey: string,
    userId: string,
    organizationId: string,
    newActor: NotificationActor
  ): Promise<void> {
    const MAX_ACTORS = 5;

    // Get current notification with this group key
    const [existing] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.groupKey, groupKey),
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId)
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(1);

    if (!existing) return;

    const currentActors = (existing.latestActors as NotificationActor[]) || [];

    // Remove duplicate actor and add new one at the front
    const filtered = currentActors.filter((a) => a.id !== newActor.id);
    const updatedActors = [newActor, ...filtered].slice(0, MAX_ACTORS);

    // Update the notification
    await db
      .update(notifications)
      .set({
        latestActors: updatedActors,
        groupCount: sql`${notifications.groupCount} + 1`,
      })
      .where(eq(notifications.id, existing.id));
  }

  /**
   * Mark all notifications in a group as read
   * Used when user clicks on an aggregated notification
   */
  async markGroupAsRead(
    groupKey: string,
    userId: string,
    organizationId: string
  ): Promise<number> {
    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.groupKey, groupKey),
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId),
          eq(notifications.read, false),
          eq(notifications.archived, false)
        )
      );

    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  }

  /**
   * Mark all notifications as read with optional category filter
   */
  async markAllAsReadWithFilter(
    userId: string,
    organizationId: string,
    category?: NotificationCategory
  ): Promise<number> {
    const conditions = [
      eq(notifications.userId, userId),
      eq(notifications.organizationId, organizationId),
      eq(notifications.read, false),
    ];

    if (category) {
      conditions.push(eq(notifications.category, category));
    }

    const result = await db
      .update(notifications)
      .set({ read: true })
      .where(and(...conditions));

    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  }

  /**
   * List notifications with strategy support
   */
  async listNotificationsWithStrategy(
    userId: string,
    organizationId: string,
    options?: {
      strategy?: 'inbox' | 'social-feed';
      category?: NotificationCategory;
      unreadOnly?: boolean;
      includeArchived?: boolean;
      limit?: number;
      cursor?: string;
    }
  ): Promise<{ notifications: Notification[]; nextCursor: string | null }> {
    const strategy = ViewStrategyRegistry.get(options?.strategy || 'inbox');
    const limit = options?.limit || 20;
    const conditions = [
      eq(notifications.userId, userId),
      eq(notifications.organizationId, organizationId),
    ];

    if (options?.category) {
      conditions.push(eq(notifications.category, options.category));
    }

    if (options?.unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    if (!options?.includeArchived) {
      conditions.push(eq(notifications.archived, false));
    }

    if (options?.cursor) {
      conditions.push(lt(notifications.createdAt, new Date(options.cursor)));
    }

    // Use the new sort order: pinned DESC, read ASC, createdAt DESC
    const results = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(
        desc(notifications.pinned),
        asc(notifications.read),
        desc(notifications.createdAt)
      )
      .limit(limit + 1);

    // Apply strategy visibility filter
    const viewContext: ViewContext = {
      userId,
      organizationId,
      now: new Date(),
    };

    const visibleResults = results.filter((n) =>
      strategy.isVisible(n, viewContext)
    );

    const hasMore = visibleResults.length > limit;
    const items = hasMore ? visibleResults.slice(0, -1) : visibleResults;
    const nextCursor = hasMore
      ? items[items.length - 1]?.createdAt.toISOString() || null
      : null;

    return {
      notifications: items,
      nextCursor,
    };
  }

  /**
   * List grouped/aggregated notifications
   * Returns notifications grouped by groupKey with aggregation info
   */
  async listGroupedNotifications(
    userId: string,
    organizationId: string,
    options?: {
      strategy?: 'inbox' | 'social-feed';
      category?: NotificationCategory;
      unreadOnly?: boolean;
      limit?: number;
      cursor?: string;
    }
  ): Promise<{ notifications: GroupedNotification[]; nextCursor: string | null }> {
    const strategy = ViewStrategyRegistry.get(options?.strategy || 'social-feed');
    const limit = options?.limit || 20;
    const conditions = [
      eq(notifications.userId, userId),
      eq(notifications.organizationId, organizationId),
      eq(notifications.archived, false),
    ];

    if (options?.category) {
      conditions.push(eq(notifications.category, options.category));
    }

    if (options?.unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    if (options?.cursor) {
      conditions.push(lt(notifications.createdAt, new Date(options.cursor)));
    }

    // Query for aggregated notifications using window functions
    const results = await db.execute(sql`
      WITH ranked AS (
        SELECT
          *,
          ROW_NUMBER() OVER (PARTITION BY COALESCE(group_key, id) ORDER BY created_at DESC) as rn,
          COUNT(*) OVER (PARTITION BY COALESCE(group_key, id)) as group_count
        FROM notifications
        WHERE user_id = ${userId}
          AND tenant_id = ${organizationId}
          AND archived = false
          ${options?.category ? sql`AND category = ${options.category}` : sql``}
          ${options?.unreadOnly ? sql`AND read = false` : sql``}
          ${options?.cursor ? sql`AND created_at < ${options.cursor}` : sql``}
      )
      SELECT * FROM ranked
      WHERE rn = 1
      ORDER BY pinned DESC, read ASC, created_at DESC
      LIMIT ${limit + 1}
    `);

    const viewContext: ViewContext = {
      userId,
      organizationId,
      now: new Date(),
    };

    // Transform to GroupedNotification format
    const rawRows = results as unknown as Notification[];
    const grouped: GroupedNotification[] = rawRows
      .filter((n) => strategy.isVisible(n, viewContext))
      .map((n) => {
        const groupInfo = n.groupKey
          ? {
              key: n.groupKey,
              count: n.groupCount,
              latestActors: (n.latestActors as NotificationActor[]) || [],
            }
          : undefined;

        return {
          id: n.id,
          type: n.type,
          actor: (n.actor as NotificationActor) || {
            id: n.actorId || 'system',
            type: 'system' as const,
            name: 'System',
          },
          title: n.title,
          body: n.message,
          target: (n.target as NotificationTarget) || {
            type: n.entityType || 'unknown',
            id: n.entityId || n.id,
            url: n.link || '#',
          },
          ...(groupInfo ? { groupInfo } : {}),
          read: n.read,
          pinned: n.pinned,
          visualPriority: n.visualPriority as VisualPriority,
          createdAt: n.createdAt,
        };
      });

    const hasMore = grouped.length > limit;
    const items = hasMore ? grouped.slice(0, -1) : grouped;
    const nextCursor = hasMore
      ? items[items.length - 1]?.createdAt.toISOString() || null
      : null;

    return {
      notifications: items,
      nextCursor,
    };
  }

  /**
   * Pin a notification (system category only)
   */
  async pin(
    id: string,
    userId: string,
    organizationId: string
  ): Promise<Notification | null> {
    // Verify the notification exists and is system category
    const [existing] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!existing) return null;

    // Only system notifications can be pinned
    if (existing.category !== 'system') {
      throw new Error('Only system notifications can be pinned');
    }

    const [result] = await db
      .update(notifications)
      .set({ pinned: true })
      .where(eq(notifications.id, id))
      .returning();

    return result || null;
  }

  /**
   * Unpin a notification
   */
  async unpin(
    id: string,
    userId: string,
    organizationId: string
  ): Promise<Notification | null> {
    const [result] = await db
      .update(notifications)
      .set({ pinned: false })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId)
        )
      )
      .returning();

    return result || null;
  }

  /**
   * Get grouped unread count (for Social Feed badge)
   */
  async getGroupedUnreadCount(userId: string, organizationId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(DISTINCT COALESCE(group_key, id))::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.organizationId, organizationId),
          eq(notifications.read, false),
          eq(notifications.archived, false)
        )
      );

    return result?.count ?? 0;
  }

  /**
   * Cleanup notifications based on category retention policies
   * Called by scheduled job
   */
  async cleanupByRetentionPolicy(): Promise<{
    category: NotificationCategory;
    deleted: number;
  }[]> {
    const now = new Date();
    const results: { category: NotificationCategory; deleted: number }[] = [];

    for (const policy of RETENTION_POLICIES) {
      if (policy.retentionDays === 'forever') {
        results.push({ category: policy.category, deleted: 0 });
        continue;
      }

      const cutoffDate = new Date(now);
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

      // Extra grace period for unread notifications
      const unreadCutoffDate = new Date(now);
      unreadCutoffDate.setDate(
        unreadCutoffDate.getDate() - policy.retentionDays - 7
      );

      // Delete read notifications past retention
      const readResult = await db.delete(notifications).where(
        and(
          eq(notifications.category, policy.category),
          eq(notifications.read, true),
          lt(notifications.createdAt, cutoffDate)
        )
      );

      // Delete unread notifications past extended retention
      const unreadResult = await db.delete(notifications).where(
        and(
          eq(notifications.category, policy.category),
          eq(notifications.read, false),
          lt(notifications.createdAt, unreadCutoffDate)
        )
      );

      const readDeleted = (readResult as unknown as { rowCount?: number }).rowCount ?? 0;
      const unreadDeleted = (unreadResult as unknown as { rowCount?: number }).rowCount ?? 0;

      results.push({
        category: policy.category,
        deleted: readDeleted + unreadDeleted,
      });
    }

    return results;
  }
}
