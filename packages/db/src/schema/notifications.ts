/**
 * Notifications Database Schema
 *
 * Drizzle ORM table definitions for notification management.
 * These are the source of truth - Zod schemas are generated from these.
 */
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { user, organization } from './auth';

// ============================================================
// Types
// ============================================================

/**
 * Notification priority levels
 */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Legacy Notification type (kept for backward compatibility)
 * @deprecated Use NotificationTypeEnum instead
 */
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

/**
 * Notification Type Enum - Strong typing for notification categories
 * Following Actor-Action-Object pattern
 */
export const NotificationTypeEnum = {
  // System / SaaS
  SYSTEM_ALERT: 'system_alert',
  SYSTEM_WARNING: 'system_warning',
  TASK_ASSIGNED: 'task_assigned',
  TASK_COMPLETED: 'task_completed',
  EXPORT_READY: 'export_ready',

  // Collaboration
  COMMENT_ADDED: 'comment_added',
  COMMENT_REPLIED: 'comment_replied',
  MENTIONED: 'mentioned',

  // Social (reserved for future)
  POST_LIKED: 'post_liked',
  POST_COMMENTED: 'post_commented',
  USER_FOLLOWED: 'user_followed',
} as const;

export type NotificationTypeEnumValue =
  (typeof NotificationTypeEnum)[keyof typeof NotificationTypeEnum];

/**
 * Notification Source - who triggered the notification
 */
export type NotificationSource = 'system' | 'plugin' | 'user';

/**
 * Notification Category - determines retention and view strategy
 */
export type NotificationCategory = 'system' | 'collaboration' | 'social';

/**
 * Visual Priority - determines UI styling
 */
export type VisualPriority = 'high' | 'medium' | 'low';

/**
 * Aggregation Strategy for plugin notifications
 */
export type AggregationStrategy = 'none' | 'by_target' | 'by_actor' | 'by_type';

/**
 * Actor information for notification
 */
export interface NotificationActor {
  id: string;
  type: 'user' | 'system' | 'plugin';
  name: string;
  avatarUrl?: string;
}

/**
 * Target object for notification
 */
export interface NotificationTarget {
  type: string;
  id: string;
  url?: string | undefined;
  previewImage?: string | undefined;
}

/**
 * Channel decision trace for debugging
 */
export interface ChannelDecisionTrace {
  channel: string;
  included: boolean;
  reason: string;
}

// ============================================================
// Notifications Table
// ============================================================

/**
 * Notifications Table
 *
 * Stores in-app notifications for users.
 * Supports unified notification contract for SaaS + Social scenarios.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // FK to user table
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),

    // Actor/Entity for better UI rendering
    actorId: text('actor_id'),
    entityId: text('entity_id'),
    entityType: text('entity_type'),

    // Template reference
    templateKey: text('template_key'),
    templateVariables: jsonb('template_variables').$type<Record<string, unknown>>(),

    // Content (rendered)
    type: text('type').notNull().$type<NotificationType>(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    link: text('link'),

    // Status
    read: boolean('read').notNull().default(false),
    archived: boolean('archived').notNull().default(false),

    // Channel tracking
    channelsSent: jsonb('channels_sent').$type<string[]>(),
    channelsFailed: jsonb('channels_failed').$type<string[]>(),
    emailSent: boolean('email_sent').notNull().default(false),
    emailSentAt: timestamp('email_sent_at'),

    // Grouping/Bundling support
    groupKey: text('group_key'),
    groupCount: integer('group_count').notNull().default(1),

    // Idempotency
    idempotencyKey: text('idempotency_key').unique(),

    // Source tracking
    sourcePluginId: text('source_plugin_id'),

    // Priority
    priority: text('priority').notNull().default('normal').$type<NotificationPriority>(),

    // Source - who triggered the notification (system/plugin/user)
    source: text('source').notNull().default('system').$type<NotificationSource>(),

    // Category - determines retention policy and view strategy
    category: text('category').notNull().default('system').$type<NotificationCategory>(),

    // Latest Actors - for aggregation display ("Alice and 4 others...")
    latestActors: jsonb('latest_actors').$type<NotificationActor[]>().default([]),

    // Pinned - for system alerts that need to stay at top
    pinned: boolean('pinned').notNull().default(false),

    // Visual Priority - for UI styling
    visualPriority: text('visual_priority').notNull().default('medium').$type<VisualPriority>(),

    // Actor info - structured actor data for rendering
    actor: jsonb('actor').$type<NotificationActor>(),

    // Target info - what the notification is about
    target: jsonb('target').$type<NotificationTarget>(),

    // Aggregation Strategy - how to group notifications
    aggregationStrategy: text('aggregation_strategy')
      .notNull()
      .default('none')
      .$type<AggregationStrategy>(),

    // Metadata includes decisionTrace for debugging
    metadata: jsonb('metadata').$type<{
      decisionTrace?: ChannelDecisionTrace[];
      [key: string]: unknown;
    }>(),

    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'),
  },
  (table) => [
    index('idx_notifications_user_read').on(table.userId, table.read),
    index('idx_notifications_template').on(table.templateKey),
    index('idx_notifications_group').on(table.groupKey),
    index('idx_notifications_expires').on(table.expiresAt),
    index('idx_notifications_tenant_user').on(table.organizationId, table.userId),
    index('idx_notifications_category').on(table.category),
    index('idx_notifications_source').on(table.source),
    index('idx_notifications_pinned').on(table.pinned),
    index('idx_notifications_cleanup').on(table.category, table.read, table.createdAt),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const notificationSchema = createInsertSchema(notifications);

// ============================================================
// Inferred Types
// ============================================================

export type Notification = typeof notifications.$inferSelect;

/**
 * Grouped notification response for API
 */
export interface GroupedNotification {
  id: string;
  type: NotificationType | NotificationTypeEnumValue;
  actor: NotificationActor;
  title: string;
  body?: string;
  target: NotificationTarget;
  groupInfo?: {
    key: string;
    count: number;
    latestActors: NotificationActor[];
  };
  read: boolean;
  pinned: boolean;
  visualPriority: VisualPriority;
  createdAt: Date;
}
