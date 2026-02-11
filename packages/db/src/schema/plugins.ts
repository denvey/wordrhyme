/**
 * Plugins Database Schema
 *
 * Drizzle ORM table definitions for plugin management.
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
import { organization } from './auth';

// ============================================================
// Types
// ============================================================

/**
 * Plugin Status
 */
export type PluginStatus =
  | 'enabled'
  | 'disabled'
  | 'crashed'
  | 'invalid'
  | 'archived'
  | 'uninstalled';

/**
 * Plugin Manifest interface (simplified for packages/db)
 * Full type is defined in @wordrhyme/plugin
 */
export interface PluginManifestBase {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  [key: string]: unknown;
}

// ============================================================
// Plugins Table
// ============================================================

/**
 * Plugins Table
 *
 * Stores installed plugin metadata per organization.
 */
export const plugins = pgTable(
  'plugins',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    pluginId: text('plugin_id').notNull(),
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    status: text('status').notNull().$type<PluginStatus>(),
    manifest: jsonb('manifest').notNull().$type<PluginManifestBase>(),
    installedAt: timestamp('installed_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    scheduledDeletionAt: timestamp('scheduled_deletion_at'),
  },
  (table) => [
    uniqueIndex('unique_plugin_per_org').on(table.organizationId, table.pluginId),
  ],
);

// ============================================================
// Plugin Configs Table
// ============================================================

/**
 * Plugin Configs Table
 *
 * Stores plugin configuration (key-value) per organization.
 */
export const pluginConfigs = pgTable(
  'plugin_configs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    pluginId: text('plugin_id').notNull(),
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('unique_config_key').on(
      table.organizationId,
      table.pluginId,
      table.key,
    ),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const pluginSchema = createInsertSchema(plugins);
export const pluginConfigSchema = createInsertSchema(pluginConfigs);

// ============================================================
// Inferred Types
// ============================================================

export type Plugin = typeof plugins.$inferSelect;
export type PluginConfig = typeof pluginConfigs.$inferSelect;
