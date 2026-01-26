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
    rolloutPercentage: integer('rollout_percentage')
      .notNull()
      .default(100), // 0-100

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
  (table) => ({
    keyIdx: index('idx_feature_flags_key').on(table.key),
  })
);

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = typeof featureFlags.$inferInsert;

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
    organizationId: text('organization_id').notNull(),

    // Override configuration
    enabled: boolean('enabled').notNull(),
    rolloutPercentage: integer('rollout_percentage'), // NULL means use global value
    conditions: jsonb('conditions').$type<FlagCondition[]>(), // NULL means use global conditions

    // Audit fields
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    // Unique constraint: one override per flag per tenant
    uniqueFlagTenantIdx: uniqueIndex('idx_ff_overrides_flag_tenant').on(
      table.flagId,
      table.organizationId
    ),
    // Index for tenant lookups
    organizationIdx: index('idx_ff_overrides_tenant').on(table.organizationId),
  })
);

export type FeatureFlagOverride = typeof featureFlagOverrides.$inferSelect;
export type InsertFeatureFlagOverride = typeof featureFlagOverrides.$inferInsert;

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
