/**
 * Feature Flags Database Schema
 *
 * Drizzle ORM table definitions for feature flag management.
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
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { organization } from './auth';
import { paginationSchema } from './common';

// ============================================================
// Types
// ============================================================

/**
 * Feature Flag Condition Types
 */
export type ConditionType =
  | 'user_role'
  | 'tenant_plan'
  | 'user_id'
  | 'percentage';

export type ConditionOperator = 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'lt' | 'gte' | 'lte';

/**
 * Feature Flag Condition
 */
export interface FlagCondition {
  type: ConditionType;
  operator: ConditionOperator;
  value?: unknown;
}

// ============================================================
// Feature Flags Table
// ============================================================

/**
 * Feature Flags Table
 *
 * Platform-level feature flag definitions.
 * Supports conditions and rollout percentages.
 */
export const featureFlags = pgTable(
  'feature_flags',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Identification
    key: text('key').notNull().unique(), // Unique flag key (e.g., "dark_mode", "ai_features")
    name: text('name').notNull(), // Display name

    // Configuration
    description: text('description'),
    enabled: boolean('enabled').notNull().default(false),

    // Rollout configuration
    rolloutPercentage: integer('rollout_percentage').notNull().default(100), // 0-100

    // Condition rules (evaluated in order, all must pass)
    conditions: jsonb('conditions')
      .notNull()
      .default([])
      .$type<FlagCondition[]>(),

    // Audit fields
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('idx_feature_flags_key').on(table.key)],
);

// ============================================================
// Feature Flag Overrides Table
// ============================================================

/**
 * Feature Flag Overrides Table
 *
 * Tenant-level overrides for feature flags.
 * Allows per-tenant configuration of global flags.
 */
export const featureFlagOverrides = pgTable(
  'feature_flag_overrides',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // References
    flagId: text('flag_id')
      .notNull()
      .references(() => featureFlags.id, { onDelete: 'cascade' }),
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),

    // Override configuration
    enabled: boolean('enabled').notNull(),
    rolloutPercentage: integer('rollout_percentage'), // NULL means use global value
    conditions: jsonb('conditions').$type<FlagCondition[]>(), // NULL means use global conditions

    // Audit fields
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    // Unique constraint: one override per flag per tenant
    uniqueIndex('idx_ff_overrides_flag_tenant').on(table.flagId, table.organizationId),
    // Index for tenant lookups
    index('idx_ff_overrides_tenant').on(table.organizationId),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

/** Flag condition schema */
export const flagConditionSchema = z.object({
  type: z.enum(['user_role', 'tenant_plan', 'user_id', 'percentage']),
  operator: z.enum(['eq', 'neq', 'in', 'nin', 'gt', 'lt', 'gte', 'lte']),
  value: z.unknown(),
});

/** Base Schema - 直接用于 Create/Update */
export const featureFlagSchema = createInsertSchema(featureFlags);
export const featureFlagOverrideSchema = createInsertSchema(featureFlagOverrides);

// ============================================================
// Query Schemas
// ============================================================

/** Check if a feature flag is enabled */
export const checkFeatureFlagQuery = z.object({
  key: z.string(),
  organizationId: z.string().optional(),
  userId: z.string().optional(),
  userRole: z.string().optional(),
  tenantPlan: z.string().optional(),
});

/** Get feature flag by key */
export const getFeatureFlagQuery = z.object({
  key: z.string().min(1),
});

/** List feature flags */
export const listFeatureFlagsQuery = paginationSchema.partial();

/** List overrides for a tenant */
export const listFlagOverridesQuery = z.object({
  organizationId: z.string().min(1),
});

// ============================================================
// Mutation Schemas
// ============================================================

/** Update feature flag mutation (id for identification + partial fields) */
export const updateFeatureFlagMutation = featureFlagSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial()
  .extend({
    id: z.string(), // Required for identification
  });

/** Delete feature flag mutation */
export const deleteFeatureFlagMutation = z.object({
  id: z.string().uuid(),
});

/** Set flag override mutation */
export const setFlagOverrideMutation = z.object({
  flagKey: z.string(),
  organizationId: z.string(),
  enabled: z.boolean(),
  rolloutPercentage: z.number().min(0).max(100).optional(),
  conditions: z.array(flagConditionSchema).optional(),
});

/** Remove flag override mutation */
export const removeFlagOverrideMutation = z.object({
  flagKey: z.string(),
  organizationId: z.string(),
});

// ============================================================
// Inferred Types
// ============================================================

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type FeatureFlagOverride = typeof featureFlagOverrides.$inferSelect;

/**
 * Feature Flag Evaluation Context
 */
export interface FlagEvaluationContext {
  organizationId: string;
  userId: string;
  userRole?: string | undefined;
  tenantPlan?: string | undefined;
  [key: string]: unknown;
}

/**
 * Feature Flag Check Result
 */
export interface FlagCheckResult {
  enabled: boolean;
  source: 'global' | 'override';
  evaluatedConditions?: boolean;
  rolloutIncluded?: boolean;
}
