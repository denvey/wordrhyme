/**
 * Plugin Migrations Database Schema
 *
 * Drizzle ORM table definitions for plugin migration tracking.
 * These are the source of truth - Zod schemas are generated from these.
 */
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { organization } from './auth';

// ============================================================
// Plugin Migrations Table
// ============================================================

/**
 * Plugin Migrations Table
 *
 * Tracks applied plugin database migrations by migration owner.
 *
 * Current runtime default:
 * - the `organization_id` column stores the instance migration owner key
 * - the reserved value `'default'` means "current deployment instance"
 *
 * This preserves the current table shape while the runtime model converges on
 * instance-scoped schema ownership.
 */
export const pluginMigrations = pgTable(
  'plugin_migrations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    pluginId: text('plugin_id').notNull(),
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    migrationFile: text('migration_file').notNull(),
    appliedAt: timestamp('applied_at').notNull().defaultNow(),
    checksum: text('checksum').notNull(), // SHA256 of file content
  },
  (table) => [
    uniqueIndex('unique_plugin_migration').on(
      table.organizationId,
      table.pluginId,
      table.migrationFile,
    ),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const pluginMigrationSchema = createInsertSchema(pluginMigrations);

// ============================================================
// Inferred Types
// ============================================================

export type PluginMigration = typeof pluginMigrations.$inferSelect;
export type InsertPluginMigration = typeof pluginMigrations.$inferInsert;
