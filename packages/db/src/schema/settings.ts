/**
 * Settings Database Schema
 *
 * Drizzle ORM table definitions for configuration storage.
 * These are the source of truth - Zod schemas are generated from these.
 */
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  boolean,
  integer,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { organization } from './auth';
import { paginationSchema } from './common';

// ============================================================
// Types
// ============================================================

/**
 * Setting Scope Types
 *
 * - global: Platform-wide configuration
 * - tenant: Organization-specific configuration
 * - plugin_global: Plugin's global configuration
 * - plugin_tenant: Plugin's organization-specific configuration
 */
export type SettingScope =
  | 'global'
  | 'tenant'
  | 'plugin_global'
  | 'plugin_tenant';

/**
 * Setting Value Types
 */
export type SettingValueType = 'string' | 'number' | 'boolean' | 'json';

/**
 * Encrypted Value Structure
 */
export interface EncryptedValue {
  ciphertext: string; // Base64 encoded
  iv: string; // 12 bytes, Base64
  authTag: string; // 16 bytes, Base64
  keyVersion: number; // Key version for rotation
}

// ============================================================
// Settings Table
// ============================================================

/**
 * Settings Table
 *
 * Unified configuration storage with four-scope model.
 * Supports encrypted values for sensitive data.
 *
 * Field Matrix:
 * | Scope          | scope_id     | organization_id      |
 * |----------------|--------------|----------------------|
 * | global         | NULL         | NULL                 |
 * | tenant         | NULL         | 'tenant-123'         |
 * | plugin_global  | 'my-plugin'  | NULL                 |
 * | plugin_tenant  | 'my-plugin'  | 'tenant-123'         |
 */
export const settings = pgTable(
  'settings',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Scope identification
    scope: text('scope').notNull().$type<SettingScope>(),
    scopeId: text('scope_id'), // pluginId (only for plugin_* scopes)
    // FK to organization table (nullable - only for tenant and plugin_tenant scopes)
    organizationId: text('organization_id')
      .references(() => organization.id, { onDelete: 'cascade' }),

    // Setting data
    key: text('key').notNull(), // Setting key (e.g., "email.smtp.host")
    value: jsonb('value'), // Setting value (or EncryptedValue if encrypted)
    valueType: text('value_type').$type<SettingValueType>().default('string'),

    // Encryption
    encrypted: boolean('encrypted').notNull().default(false),

    // Schema version for migration support
    schemaVersion: integer('schema_version').notNull().default(1),

    // Metadata
    description: text('description'),

    // Audit fields
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Unique constraint with COALESCE to handle NULL values
    uniqueIndex('idx_settings_unique').on(
      table.scope,
      sql`COALESCE(${table.scopeId}, '')`,
      sql`COALESCE(${table.organizationId}, '')`,
      table.key,
    ),
    // Index for scope + key queries
    index('idx_settings_scope_key').on(table.scope, table.key),
    // Index for tenant queries (partial)
    index('idx_settings_tenant').on(table.organizationId),
    // Index for plugin queries (partial)
    index('idx_settings_plugin').on(table.scopeId),
  ],
);

// ============================================================
// Setting Schemas Table
// ============================================================

/**
 * Setting Schemas Table
 *
 * Defines JSON Schema validation for settings.
 * Supports wildcard patterns for matching multiple keys.
 */
export const settingSchemas = pgTable(
  'setting_schemas',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Pattern matching (supports wildcards, e.g., "email.*" or "plugin:*:api_key")
    keyPattern: text('key_pattern').notNull(),

    // JSON Schema definition
    schema: jsonb('schema').notNull().$type<Record<string, unknown>>(),

    // Version for schema evolution
    version: integer('version').notNull().default(1),

    // Default value if setting doesn't exist
    defaultValue: jsonb('default_value'),

    // Metadata
    description: text('description'),
    deprecated: boolean('deprecated').notNull().default(false),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    // Unique constraint on pattern + version
    uniqueIndex('idx_setting_schemas_pattern_version').on(
      table.keyPattern,
      table.version,
    ),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const settingScopeSchema = z.enum(['global', 'tenant', 'plugin_global', 'plugin_tenant']);
export const settingValueTypeSchema = z.enum(['string', 'number', 'boolean', 'json']);

export const settingSchema = createInsertSchema(settings);
export const settingSchemaSchema = createInsertSchema(settingSchemas);

// ============================================================
// Query Schemas
// ============================================================

/**
 * Get setting query - 获取单个配置
 */
export const getSettingQuery = settingSchema.pick({
  scope: true,
  key: true,
  organizationId: true,
  scopeId: true,
}).extend({
  defaultValue: z.unknown().optional(),
});

/**
 * List settings query - 列表查询配置
 */
export const listSettingsQuery = settingSchema
  .pick({
    scope: true,
    organizationId: true,
    scopeId: true,
  })
  .merge(paginationSchema)
  .extend({
    keyPrefix: z.string().optional(),
  });

/**
 * Set setting mutation - 设置配置值
 */
export const setSettingMutation = settingSchema.pick({
  scope: true,
  key: true,
  value: true,
  organizationId: true,
  scopeId: true,
  encrypted: true,
  description: true,
  valueType: true,
});

/**
 * Delete setting mutation - 删除配置
 */
export const deleteSettingMutation = settingSchema.pick({
  scope: true,
  key: true,
  organizationId: true,
  scopeId: true,
});

// ============================================================
// Inferred Types
// ============================================================

export type Setting = typeof settings.$inferSelect;
export type SettingSchemaType = typeof settingSchemas.$inferSelect;

/**
 * Get options for retrieving settings
 */
export interface GetSettingOptions {
  organizationId?: string | undefined;
  scopeId?: string | undefined; // pluginId for plugin scopes
  defaultValue?: unknown;
}

/**
 * Set options for storing settings
 */
export interface SetSettingOptions {
  organizationId?: string | undefined;
  scopeId?: string | undefined; // pluginId for plugin scopes
  encrypted?: boolean | undefined;
  description?: string | undefined;
  valueType?: SettingValueType | undefined;
}

/**
 * List options for querying settings
 */
export interface ListSettingsOptions {
  organizationId?: string | undefined;
  scopeId?: string | undefined;
  keyPrefix?: string | undefined;
  includeEncrypted?: boolean | undefined;
}
