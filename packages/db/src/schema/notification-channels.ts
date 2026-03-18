/**
 * Notification Channels Database Schema
 *
 * Drizzle ORM table definitions for notification channel management.
 * These are the source of truth - Zod schemas are generated from these.
 */
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import type { I18nText } from './notification-templates';

// ============================================================
// Notification Channels Table
// ============================================================

/**
 * Notification Channels Table
 *
 * Stores available notification channels (plugin-registered).
 */
export const notificationChannels = pgTable(
  'notification_channels',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Unique key (namespaced)
    // Format: 'in-app' (Core) or 'plugin:{pluginId}:{channel}'
    key: text('key').notNull().unique(),

    // Display name (i18n)
    name: jsonb('name').notNull().$type<I18nText>(),

    // Description (i18n)
    description: jsonb('description').$type<I18nText>(),

    // Icon name
    icon: text('icon'),

    // Plugin reference
    pluginId: text('plugin_id').notNull(),

    // Is this channel currently enabled
    enabled: boolean('enabled').notNull().default(true),

    // User configuration schema (Zod schema as JSON)
    configSchema: jsonb('config_schema'),

    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_channels_plugin').on(table.pluginId),
    index('idx_channels_enabled').on(table.enabled),
  ]
);

// ============================================================
// Zod Schemas
// ============================================================

export const notificationChannelSchema = createInsertSchema(notificationChannels);

// ============================================================
// Inferred Types
// ============================================================

export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type InsertNotificationChannel = typeof notificationChannels.$inferInsert;
