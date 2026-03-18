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

/**
 * Settings Table
 *
 * Unified configuration storage with four-scope model.
 * Supports encrypted values for sensitive data.
 *
 * Field Matrix:
 * | Scope          | scope_id     | organization_id      |
 * |----------------|--------------|----------------|
 * | global         | NULL         | NULL           |
 * | tenant         | NULL         | 'tenant-123'   |
 * | plugin_global  | 'my-plugin'  | NULL           |
 * | plugin_tenant  | 'my-plugin'  | 'tenant-123'   |
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
    organizationId: text('organization_id'), // organizationId (only for tenant and plugin_tenant scopes)

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
  (table) => ({
    // Unique constraint with COALESCE to handle NULL values
    uniqueSettingIdx: uniqueIndex('idx_settings_unique').on(
      table.scope,
      sql`COALESCE(${table.scopeId}, '')`,
      sql`COALESCE(${table.organizationId}, '')`,
      table.key
    ),
    // Index for scope + key queries
    scopeKeyIdx: index('idx_settings_scope_key').on(table.scope, table.key),
    // Index for tenant queries (partial)
    organizationIdx: index('idx_settings_tenant').on(table.organizationId),
    // Index for plugin queries (partial)
    pluginIdx: index('idx_settings_plugin').on(table.scopeId),
  })
);

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;

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
  (table) => ({
    // Unique constraint on pattern + version
    uniquePatternVersionIdx: uniqueIndex('idx_setting_schemas_pattern_version').on(
      table.keyPattern,
      table.version
    ),
  })
);

export type SettingSchema = typeof settingSchemas.$inferSelect;
export type InsertSettingSchema = typeof settingSchemas.$inferInsert;

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
