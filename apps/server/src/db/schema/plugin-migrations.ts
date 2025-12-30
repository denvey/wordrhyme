import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Plugin Migrations Table
 *
 * Tracks applied plugin database migrations per organization.
 */
export const pluginMigrations = pgTable('plugin_migrations', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    pluginId: text('plugin_id').notNull(),
    organizationId: text('organization_id').notNull(),
    migrationFile: text('migration_file').notNull(),
    appliedAt: timestamp('applied_at').notNull().defaultNow(),
    checksum: text('checksum').notNull(), // SHA256 of file content
}, (table) => ({
    uniqueMigration: uniqueIndex('unique_plugin_migration')
        .on(table.organizationId, table.pluginId, table.migrationFile),
}));

export type PluginMigration = typeof pluginMigrations.$inferSelect;
export type InsertPluginMigration = typeof pluginMigrations.$inferInsert;
