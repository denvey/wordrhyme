/**
 * Drizzle-Zod Auto-generated Schemas
 *
 * These schemas provide runtime validation for database operations.
 */
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { plugins, pluginConfigs } from './plugins';
import { permissions } from './permissions';
import { menus } from './menus';
import { auditLogs } from './audit-logs';
import { auditEvents } from './audit-events';
import { pluginMigrations } from './plugin-migrations';
import { roles } from './roles';
import { rolePermissions } from './role-permissions';
import { settings, settingSchemas } from './settings';
import { featureFlags, featureFlagOverrides } from './feature-flags';

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

// Audit Events
export const insertAuditEventSchema = createInsertSchema(auditEvents);
export const selectAuditEventSchema = createSelectSchema(auditEvents);

// Plugin Migrations
export const insertPluginMigrationSchema = createInsertSchema(pluginMigrations);
export const selectPluginMigrationSchema = createSelectSchema(pluginMigrations);

// Roles
export const insertRoleSchema = createInsertSchema(roles);
export const selectRoleSchema = createSelectSchema(roles);

// Role Permissions (CASL format)
export const insertRolePermissionSchema = createInsertSchema(rolePermissions);
export const selectRolePermissionSchema = createSelectSchema(rolePermissions);

// Settings
export const insertSettingSchema = createInsertSchema(settings);
export const selectSettingSchema = createSelectSchema(settings);

// Setting Schemas
export const insertSettingSchemaSchema = createInsertSchema(settingSchemas);
export const selectSettingSchemaSchema = createSelectSchema(settingSchemas);

// Feature Flags
export const insertFeatureFlagSchema = createInsertSchema(featureFlags);
export const selectFeatureFlagSchema = createSelectSchema(featureFlags);

// Feature Flag Overrides
export const insertFeatureFlagOverrideSchema = createInsertSchema(featureFlagOverrides);
export const selectFeatureFlagOverrideSchema = createSelectSchema(featureFlagOverrides);

// Settings API Schemas
export const settingScopeSchema = z.enum([
  'global',
  'tenant',
  'plugin_global',
  'plugin_tenant',
]);

export const settingValueTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'json',
]);

export const getSettingInputSchema = z.object({
  scope: settingScopeSchema,
  key: z.string().min(1),
  tenantId: z.string().optional(),
  scopeId: z.string().optional(),
  defaultValue: z.unknown().optional(),
});

export const setSettingInputSchema = z.object({
  scope: settingScopeSchema,
  key: z.string().min(1),
  value: z.unknown(),
  tenantId: z.string().optional(),
  scopeId: z.string().optional(),
  encrypted: z.boolean().optional(),
  description: z.string().optional(),
  valueType: settingValueTypeSchema.optional(),
});

export const deleteSettingInputSchema = z.object({
  scope: settingScopeSchema,
  key: z.string().min(1),
  tenantId: z.string().optional(),
  scopeId: z.string().optional(),
});

export const listSettingsInputSchema = z.object({
  scope: settingScopeSchema,
  tenantId: z.string().optional(),
  scopeId: z.string().optional(),
  keyPrefix: z.string().optional(),
});

// Feature Flags API Schemas
export const flagConditionSchema = z.object({
  type: z.enum(['user_role', 'tenant_plan', 'user_id', 'percentage']),
  operator: z.enum(['eq', 'neq', 'in', 'nin', 'gt', 'lt', 'gte', 'lte']),
  value: z.unknown(),
});

export const checkFeatureFlagInputSchema = z.object({
  key: z.string().min(1),
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  userRole: z.string().optional(),
  tenantPlan: z.string().optional(),
});

export const createFeatureFlagInputSchema = z.object({
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  enabled: z.boolean().default(false),
  rolloutPercentage: z.number().min(0).max(100).default(100),
  conditions: z.array(flagConditionSchema).default([]),
});

export const updateFeatureFlagInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().min(0).max(100).optional(),
  conditions: z.array(flagConditionSchema).optional(),
});

export const setFlagOverrideInputSchema = z.object({
  flagKey: z.string().min(1),
  tenantId: z.string().min(1),
  enabled: z.boolean(),
  rolloutPercentage: z.number().min(0).max(100).optional(),
  conditions: z.array(flagConditionSchema).optional(),
});

export const removeFlagOverrideInputSchema = z.object({
  flagKey: z.string().min(1),
  tenantId: z.string().min(1),
});
