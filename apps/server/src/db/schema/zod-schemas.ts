/**
 * Drizzle-Zod Auto-generated Schemas
 *
 * These schemas provide runtime validation for database operations.
 */
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { plugins, pluginConfigs } from './plugins';
import { permissions } from './permissions';
import { menus } from './menus';
import { auditLogs } from './audit-logs';
import { pluginMigrations } from './plugin-migrations';

// Plugins
export const insertPluginSchema = createInsertSchema(plugins);
export const selectPluginSchema = createSelectSchema(plugins);
export const insertPluginConfigSchema = createInsertSchema(pluginConfigs);
export const selectPluginConfigSchema = createSelectSchema(pluginConfigs);

// Permissions
export const insertPermissionSchema = createInsertSchema(permissions);
export const selectPermissionSchema = createSelectSchema(permissions);

// Menus
export const insertMenuSchema = createInsertSchema(menus);
export const selectMenuSchema = createSelectSchema(menus);

// Audit Logs
export const insertAuditLogSchema = createInsertSchema(auditLogs);
export const selectAuditLogSchema = createSelectSchema(auditLogs);

// Plugin Migrations
export const insertPluginMigrationSchema = createInsertSchema(pluginMigrations);
export const selectPluginMigrationSchema = createSelectSchema(pluginMigrations);
