/**
 * Notification Preferences Database Schema
 *
 * Drizzle ORM table definitions for user notification preferences.
 * These are the source of truth - Zod schemas are generated from these.
 */
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { user, organization } from './auth';

// ============================================================
// Types
// ============================================================

/**
 * Quiet hours configuration
 */
export interface QuietHoursConfig {
  enabled: boolean;
  start: string; // '22:00'
  end: string; // '08:00'
  timezone: string;
}

/**
 * Email frequency options
 */
export type EmailFrequency = 'instant' | 'hourly' | 'daily';

// ============================================================
// Notification Preferences Table
// ============================================================

/**
 * Notification Preferences Table
 *
 * Stores user notification preferences per tenant.
 */
export const notificationPreferences = pgTable(
  'notification_preferences',
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

    // Enabled channels (global)
    enabledChannels: jsonb('enabled_channels')
      .notNull()
      .default(['in-app'])
      .$type<string[]>(),

    // Per-template channel overrides
    // e.g., { 'order.urgent': ['in-app', 'email', 'sms'] }
    templateOverrides: jsonb('template_overrides').$type<
      Record<string, string[]>
    >(),

    // Quiet hours (do not disturb)
    quietHours: jsonb('quiet_hours').$type<QuietHoursConfig>(),

    // Email digest frequency
    emailFrequency: text('email_frequency')
      .notNull()
      .default('instant')
      .$type<EmailFrequency>(),

    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_preferences_user_tenant').on(
      table.userId,
      table.organizationId
    ),
  ]
);

// ============================================================
// Zod Schemas
// ============================================================

export const notificationPreferenceSchema = createInsertSchema(notificationPreferences);

// ============================================================
// Inferred Types
// ============================================================

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
