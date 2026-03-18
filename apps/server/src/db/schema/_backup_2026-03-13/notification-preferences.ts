import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

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

    userId: text('user_id').notNull(),
    organizationId: text('organization_id').notNull(),

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
  (table) => ({
    uniqueUserTenant: uniqueIndex('idx_preferences_user_tenant').on(
      table.userId,
      table.organizationId
    ),
  })
);

export type NotificationPreference =
  typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference =
  typeof notificationPreferences.$inferInsert;
