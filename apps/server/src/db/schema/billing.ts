import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// Capabilities - 能力注册表
// ============================================================================

/**
 * Capability type
 * - boolean: feature flag (access/no access)
 * - metered: usage quota with limit
 */
export type CapabilityType = 'boolean' | 'metered';

/**
 * Capability source
 * - core: registered by the system at startup
 * - plugin: registered by a plugin via manifest
 */
export type CapabilitySource = 'core' | 'plugin';

/**
 * Capability approval status
 * - pending: awaiting platform admin review (plugin capabilities)
 * - approved: active and can be used in plans
 * - rejected: denied by platform admin
 */
export type CapabilityStatus = 'pending' | 'approved' | 'rejected';

/**
 * Capabilities Table
 *
 * Persistent registry of all billing capabilities.
 * Core capabilities are seeded at startup (status=approved).
 * Plugin capabilities are registered on plugin load (status=pending).
 */
export const capabilities = pgTable(
  'capabilities',
  {
    subject: text('subject').primaryKey(), // e.g., 'core.storage', 'plugin.acme.api_calls'
    type: text('type').notNull().$type<CapabilityType>(),
    unit: text('unit'), // e.g., 'MB', 'request', null for boolean
    description: text('description'),
    source: text('source').notNull().$type<CapabilitySource>(),
    pluginId: text('plugin_id'), // null for core capabilities
    status: text('status').notNull().$type<CapabilityStatus>().default('pending'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    sourceStatusIdx: index('idx_capabilities_source_status').on(table.source, table.status),
    pluginIdIdx: index('idx_capabilities_plugin_id').on(table.pluginId),
  })
);

export type Capability = typeof capabilities.$inferSelect;
export type InsertCapability = typeof capabilities.$inferInsert;

// ============================================================================
// Plans - 套餐定义
// ============================================================================

/**
 * Billing interval for plans
 */
export type PlanInterval = 'month' | 'year' | 'one_time';

/**
 * Plans Table
 *
 * Defines subscription plans and one-time purchase products.
 */
export const plans = pgTable('plans', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  description: text('description'),
  interval: text('interval').notNull().$type<PlanInterval>(),
  intervalCount: integer('interval_count').notNull().default(1),
  currency: text('currency').notNull().default('usd'),
  priceCents: integer('price_cents').notNull(),
  isActive: integer('is_active').notNull().default(1), // 1 = active, 0 = archived
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = typeof plans.$inferInsert;

// ============================================================================
// Plan Items - 套餐权益项
// ============================================================================

/**
 * Type of entitlement
 * - boolean: feature flag (access/no access)
 * - metered: usage quota
 */
export type PlanItemType = 'boolean' | 'metered';

/**
 * Reset mode for metered items
 * - period: resets each billing cycle
 * - never: never expires (e.g., booster packs)
 */
export type ResetMode = 'period' | 'never';

/**
 * Reset strategy for quota renewal
 * - hard: delete old quota, grant full new amount
 * - soft: keep remaining + add new amount
 * - capped: soft but cap at resetCap
 */
export type ResetStrategy = 'hard' | 'soft' | 'capped';

/**
 * Quota scope - where the quota is allocated
 * - tenant: shared pool for all tenant members
 * - user: individual user allocation
 */
export type QuotaScope = 'tenant' | 'user';

/**
 * Overage policy when quota is exceeded
 * - deny: reject the request (default)
 * - charge: charge the overage to wallet
 * - throttle: rate limit instead of reject
 * - downgrade: automatically downgrade to lower plan
 */
export type OveragePolicy = 'deny' | 'charge' | 'throttle' | 'downgrade';

/**
 * Plan Items Table
 *
 * Defines entitlements included in a plan.
 * subject references capabilities.subject (not enforced as FK to allow seeding order flexibility).
 */
export const planItems = pgTable(
  'plan_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(), // e.g., 'core.storage', 'plugin.acme.api_calls'
    type: text('type').notNull().$type<PlanItemType>(),
    amount: integer('amount'), // null for boolean type
    resetMode: text('reset_mode').notNull().$type<ResetMode>(),
    priority: integer('priority').notNull().default(0), // higher = deduct first
    overagePolicy: text('overage_policy').$type<OveragePolicy>().default('deny'),
    overagePriceCents: integer('overage_price_cents'), // required when overagePolicy='charge'
    resetStrategy: text('reset_strategy').$type<ResetStrategy>().default('hard'),
    resetCap: integer('reset_cap'), // max balance after reset (for 'capped' strategy)
    quotaScope: text('quota_scope').$type<QuotaScope>().notNull().default('tenant'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    planIdIdx: index('idx_plan_items_plan_id').on(table.planId),
    subjectIdx: index('idx_plan_items_subject').on(table.subject),
  })
);

export type PlanItem = typeof planItems.$inferSelect;
export type InsertPlanItem = typeof planItems.$inferInsert;

// ============================================================================
// User Quotas - 用户配额桶
// ============================================================================

/**
 * Source type for quota grants
 */
export type QuotaSourceType = 'membership' | 'shop_order' | 'plugin' | 'admin_grant';

/**
 * User Quotas Table
 *
 * Represents a user's quota "buckets". Multiple buckets can exist
 * for the same feature with different priorities and expiration dates.
 */
export const userQuotas = pgTable(
  'user_quotas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    organizationId: text('organization_id'), // For tenant isolation of user purchases
    subject: text('subject').notNull(),
    balance: integer('balance').notNull(),
    priority: integer('priority').notNull().default(0), // higher = deduct first
    expiresAt: timestamp('expires_at'), // null = never expires
    sourceType: text('source_type').notNull().$type<QuotaSourceType>(),
    sourceId: text('source_id').notNull(), // subscription/order/plugin grant ID
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userSubjectIdx: index('idx_user_quotas_user_feature').on(
      table.userId,
      table.subject
    ),
    waterfallIdx: index('idx_user_quotas_waterfall').on(
      table.userId,
      table.subject,
      table.balance,
      table.priority,
      table.expiresAt
    ),
    userSubjectSourceUniq: uniqueIndex('uq_user_quotas_source').on(
      table.userId,
      table.subject,
      table.sourceType,
      table.sourceId
    ),
  })
);

export type UserQuota = typeof userQuotas.$inferSelect;
export type InsertUserQuota = typeof userQuotas.$inferInsert;

// ============================================================================
// Wallets - 用户钱包（超额计费）
// ============================================================================

/**
 * Wallets Table
 *
 * Stores user wallet balance for overage charges.
 */
export const wallets = pgTable('wallets', {
  userId: text('user_id').primaryKey(),
  balanceCents: integer('balance_cents').notNull().default(0),
  currency: text('currency').notNull().default('usd'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = typeof wallets.$inferInsert;

// ============================================================================
// Transactions - 多态交易账本
// ============================================================================

/**
 * Transaction status
 */
export type TransactionStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

/**
 * Transaction source type
 */
export type TransactionSourceType = 'membership' | 'shop_order' | 'plugin' | 'wallet_topup';

/**
 * Transactions Table
 *
 * Polymorphic ledger for all payment transactions.
 */
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    sourceType: text('source_type').notNull().$type<TransactionSourceType>(),
    sourceId: text('source_id').notNull(),
    status: text('status').notNull().$type<TransactionStatus>().default('PENDING'),
    gateway: text('gateway'), // stripe, alipay, etc.
    externalId: text('external_id'), // gateway payment intent ID
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    userSourceIdx: index('idx_transactions_user_source').on(
      table.userId,
      table.sourceType,
      table.sourceId
    ),
    externalIdUniq: uniqueIndex('uq_transactions_external_id').on(table.externalId),
    statusIdx: index('idx_transactions_status').on(table.status),
  })
);

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

// ============================================================================
// Usage Records - 用量记录（不可变审计日志）
// ============================================================================

/**
 * Usage Records Table
 *
 * Immutable audit log of all usage consumption events.
 * This table is append-only - no UPDATE or DELETE allowed.
 */
export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    subject: text('subject').notNull(),
    amount: integer('amount').notNull(),
    quotaIds: jsonb('quota_ids').$type<string[]>(), // which buckets were deducted
    overageChargedCents: integer('overage_charged_cents'), // if overage was charged
    occurredAt: timestamp('occurred_at').notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (table) => ({
    userSubjectIdx: index('idx_usage_records_user_feature').on(
      table.userId,
      table.subject
    ),
    occurredAtIdx: index('idx_usage_records_occurred_at').on(table.occurredAt),
  })
);

export type UsageRecord = typeof usageRecords.$inferSelect;
export type InsertUsageRecord = typeof usageRecords.$inferInsert;

// ============================================================================
// Plan Subscriptions - Organization 订阅关系
// ============================================================================

/**
 * Subscription status
 */
export type SubscriptionStatus =
  | 'trialing'   // Trial period
  | 'active'     // Active subscription
  | 'past_due'   // Payment overdue
  | 'canceled'   // Canceled (expires at period end)
  | 'expired';   // Subscription ended

/**
 * Plan Subscriptions Table
 *
 * Tracks tenant subscriptions to plans with billing cycle management.
 */
export const planSubscriptions = pgTable(
  'plan_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Core relationships
    organizationId: text('organization_id').notNull(),
    planId: text('plan_id').notNull().references(() => plans.id),

    // Status management
    status: text('status').notNull().$type<SubscriptionStatus>(),
    version: integer('version').notNull().default(1), // Optimistic lock

    // Billing period
    currentPeriodStart: timestamp('current_period_start').notNull(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    billingCycleAnchor: integer('billing_cycle_anchor'), // Day of month (1-28)

    // Trial period
    trialStart: timestamp('trial_start'),
    trialEnd: timestamp('trial_end'),

    // Renewal tracking
    renewalCount: integer('renewal_count').notNull().default(0),
    lastRenewalAt: timestamp('last_renewal_at'),

    // Payment gateway sync
    gateway: text('gateway'),
    externalSubscriptionId: text('external_subscription_id'),

    // Transaction references
    initialTransactionId: uuid('initial_transaction_id')
      .references(() => transactions.id),
    latestTransactionId: uuid('latest_transaction_id')
      .references(() => transactions.id),

    // Cancellation
    canceledAt: timestamp('canceled_at'),
    cancelReason: text('cancel_reason'),
    cancelAtPeriodEnd: integer('cancel_at_period_end').default(0), // 1 = cancel at period end

    // Plan changes (upgrade/downgrade)
    scheduledPlanId: text('scheduled_plan_id').references(() => plans.id),
    scheduledChangeAt: timestamp('scheduled_change_at'),

    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    organizationIdx: index('idx_subscriptions_tenant').on(table.organizationId),
    statusIdx: index('idx_subscriptions_status').on(table.status),
    periodEndIdx: index('idx_subscriptions_period_end').on(table.currentPeriodEnd),
    externalIdUniq: uniqueIndex('uq_subscriptions_external_id').on(
      table.externalSubscriptionId
    ),
    // Partial unique: one active subscription per tenant per plan
    activePlanUniq: uniqueIndex('uq_subscriptions_tenant_plan_active')
      .on(table.organizationId, table.planId)
      .where(sql`status IN ('active', 'trialing')`),
  })
);

export type PlanSubscription = typeof planSubscriptions.$inferSelect;
export type InsertPlanSubscription = typeof planSubscriptions.$inferInsert;

// ============================================================================
// Organization Quotas - Organization 共享配额池
// ============================================================================

/**
 * Organization Quotas Table
 *
 * Shared quota pool for all tenant members.
 * Separate from userQuotas to avoid breaking existing contract.
 */
export const tenantQuotas = pgTable(
  'tenant_quotas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id').notNull(),
    subject: text('subject').notNull(),
    balance: integer('balance').notNull(),
    priority: integer('priority').notNull().default(100), // Higher than user quotas by default
    expiresAt: timestamp('expires_at'), // null = never expires
    sourceType: text('source_type').notNull().$type<QuotaSourceType>(),
    sourceId: text('source_id').notNull(), // subscription/admin grant ID
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    tenantSubjectIdx: index('idx_tenant_quotas_tenant_feature').on(
      table.organizationId,
      table.subject
    ),
    waterfallIdx: index('idx_tenant_quotas_waterfall').on(
      table.organizationId,
      table.subject,
      table.balance,
      table.priority,
      table.expiresAt
    ),
    sourceUniq: uniqueIndex('uq_tenant_quotas_source').on(
      table.organizationId,
      table.subject,
      table.sourceType,
      table.sourceId
    ),
  })
);

export type TenantQuota = typeof tenantQuotas.$inferSelect;
export type InsertTenantQuota = typeof tenantQuotas.$inferInsert;
