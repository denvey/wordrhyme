import {
  pgTable,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import type { NotificationPriority } from './notifications';

/**
 * i18n text structure
 */
export type I18nText = Record<string, string>;

/**
 * Template category
 */
export type TemplateCategory = 'system' | 'plugin' | 'custom';

/**
 * Notification Templates Table
 *
 * Stores configurable notification templates with i18n support.
 */
export const notificationTemplates = pgTable(
  'notification_templates',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Unique key (e.g., 'comment.new', 'order.shipped')
    key: text('key').notNull().unique(),

    // Display name
    name: text('name').notNull(),
    description: text('description'),

    // Category
    category: text('category').notNull().$type<TemplateCategory>(),

    // i18n content
    title: jsonb('title').notNull().$type<I18nText>(),
    message: jsonb('message').notNull().$type<I18nText>(),

    // Variables that can be interpolated
    variables: jsonb('variables').$type<string[]>(),

    // Default channels for this template
    defaultChannels: jsonb('default_channels')
      .notNull()
      .default(['in-app'])
      .$type<string[]>(),

    // Priority
    priority: text('priority')
      .notNull()
      .default('normal')
      .$type<NotificationPriority>(),

    // Plugin reference (if registered by plugin)
    pluginId: text('plugin_id'),

    // Template evolution
    deprecated: boolean('deprecated').notNull().default(false),
    version: integer('version').notNull().default(1),

    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    pluginIdx: index('idx_templates_plugin').on(table.pluginId),
    categoryIdx: index('idx_templates_category').on(table.category),
  })
);

export type NotificationTemplate = typeof notificationTemplates.$inferSelect;
export type InsertNotificationTemplate =
  typeof notificationTemplates.$inferInsert;
