import { pgTable, text, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PluginManifest } from '@wordrhyme/plugin';

/**
 * Plugin Status
 */
export type PluginStatus = 'enabled' | 'disabled' | 'crashed' | 'invalid' | 'archived' | 'uninstalled';
export type PluginInstanceStatus = 'installed' | 'loaded' | 'failed';
export type PluginInstallationStatus = 'installed' | 'uninstalled' | 'suspended';
export type PluginActivationStatus = 'enabled' | 'disabled';

/**
 * Plugins Table
 *
 * Stores installed plugin metadata per organization.
 */
export const plugins = pgTable('plugins', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    pluginId: text('plugin_id').notNull(),
    organizationId: text('organization_id').notNull(),
    version: text('version').notNull(),
    installationStatus: text('installation_status').notNull().$type<PluginInstallationStatus>().default('installed'),
    activationStatus: text('activation_status').notNull().$type<PluginActivationStatus>().default('enabled'),
    status: text('status').notNull().$type<PluginStatus>(),
    manifest: jsonb('manifest').notNull().$type<PluginManifest>(),
    installedAt: timestamp('installed_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    scheduledDeletionAt: timestamp('scheduled_deletion_at'),
}, (table) => ({
    uniquePluginPerOrg: uniqueIndex('unique_plugin_per_org')
        .on(table.organizationId, table.pluginId),
}));

/**
 * Plugin Instances Table
 *
 * Stores plugin availability for the current deployment instance.
 */
export const pluginInstances = pgTable('plugin_instances', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    pluginId: text('plugin_id').notNull(),
    version: text('version').notNull(),
    status: text('status').notNull().$type<PluginInstanceStatus>(),
    manifest: jsonb('manifest').notNull().$type<PluginManifest>(),
    installedAt: timestamp('installed_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
    uniquePluginPerInstance: uniqueIndex('unique_plugin_per_instance')
        .on(table.pluginId),
}));

export type Plugin = typeof plugins.$inferSelect;
export type InsertPlugin = typeof plugins.$inferInsert;
export type PluginInstance = typeof pluginInstances.$inferSelect;
export type InsertPluginInstance = typeof pluginInstances.$inferInsert;

/**
 * Plugin Configs Table
 *
 * Stores plugin configuration (key-value) per organization.
 */
export const pluginConfigs = pgTable('plugin_configs', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    pluginId: text('plugin_id').notNull(),
    organizationId: text('organization_id').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
    uniqueConfigKey: uniqueIndex('unique_config_key')
        .on(table.organizationId, table.pluginId, table.key),
}));

export type PluginConfig = typeof pluginConfigs.$inferSelect;
export type InsertPluginConfig = typeof pluginConfigs.$inferInsert;
