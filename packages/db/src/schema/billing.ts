/**
 * Billing Database Schema
 *
 * Drizzle ORM table definitions for subscription and billing management.
 * These are the source of truth - Zod schemas are generated from these.
 */
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
import { createInsertSchema } from 'drizzle-zod';
import { organization } from './auth';
import { user } from './auth';

// ============================================================
// Types
// ============================================================

export type PlanInterval = 'month' | 'year' | 'one_time';
export type PlanItemType = 'boolean' | 'metered';
export type ResetMode = 'period' | 'never';
export type ResetStrategy = 'hard' | 'soft' | 'capped';
export type QuotaScope = 'tenant' | 'user';
export type QuotaSourceType = 'membership' | 'shop_order' | 'plugin' | 'admin_grant';
export type TransactionStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type TransactionSourceType = 'membership' | 'shop_order' | 'plugin' | 'wallet_topup';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
export type CapabilityType = 'boolean' | 'metered';
export type CapabilitySource = 'core' | 'plugin';
export type CapabilityStatus = 'pending' | 'approved' | 'rejected';
export type OveragePolicy = 'deny' | 'charge' | 'throttle' | 'downgrade';

// ============================================================
// Capabilities Table
// ============================================================

export const capabilities = pgTable(
  'capabilities',
  {
    subject: text('subject').primaryKey(),
    type: text('type').notNull().$type<CapabilityType>(),
    unit: text('unit'),
    description: text('description'),
    source: text('source').notNull().$type<CapabilitySource>(),
    pluginId: text('plugin_id'),
    status: text('status').notNull().$type<CapabilityStatus>().default('pending'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_capabilities_source_status').on(table.source, table.status),
    index('idx_capabilities_plugin_id').on(table.pluginId),
  ],
);

export type Capability = typeof capabilities.$inferSelect;

// ============================================================
// Plans Table
// ============================================================

export const plans = pgTable('plans', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  description: text('description'),
  interval: text('interval').notNull().$type<PlanInterval>(),
  intervalCount: integer('interval_count').notNull().default(1),
  currency: text('currency').notNull().default('usd'),
  priceCents: integer('price_cents').notNull(),
  isActive: integer('is_active').notNull().default(1),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Plan = typeof plans.$inferSelect;

// ============================================================
// Plan Items Table
// ============================================================

export const planItems = pgTable(
  'plan_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    type: text('type').notNull().$type<PlanItemType>(),
    amount: integer('amount'),
    resetMode: text('reset_mode').notNull().$type<ResetMode>(),
    priority: integer('priority').notNull().default(0),
    overagePolicy: text('overage_policy').$type<OveragePolicy>().default('deny'),
    overagePriceCents: integer('overage_price_cents'),
    resetStrategy: text('reset_strategy').$type<ResetStrategy>().default('hard'),
    resetCap: integer('reset_cap'),
    quotaScope: text('quota_scope').$type<QuotaScope>().notNull().default('tenant'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_plan_items_plan_id').on(table.planId),
    index('idx_plan_items_subject').on(table.subject),
  ],
);

export type PlanItem = typeof planItems.$inferSelect;

// ============================================================
// User Quotas Table
// ============================================================

export const userQuotas = pgTable(
  'user_quotas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .references(() => organization.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    balance: integer('balance').notNull(),
    priority: integer('priority').notNull().default(0),
    expiresAt: timestamp('expires_at'),
    sourceType: text('source_type').notNull().$type<QuotaSourceType>(),
    sourceId: text('source_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_user_quotas_user_feature').on(table.userId, table.subject),
    index('idx_user_quotas_waterfall').on(
      table.userId,
      table.subject,
      table.balance,
      table.priority,
      table.expiresAt,
    ),
    uniqueIndex('uq_user_quotas_source').on(
      table.userId,
      table.subject,
      table.sourceType,
      table.sourceId,
    ),
  ],
);

export type UserQuota = typeof userQuotas.$inferSelect;

// ============================================================
// Wallets Table
// ============================================================

export const wallets = pgTable('wallets', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  balanceCents: integer('balance_cents').notNull().default(0),
  currency: text('currency').notNull().default('usd'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Wallet = typeof wallets.$inferSelect;

// ============================================================
// Transactions Table
// ============================================================

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    sourceType: text('source_type').notNull().$type<TransactionSourceType>(),
    sourceId: text('source_id').notNull(),
    status: text('status').notNull().$type<TransactionStatus>().default('PENDING'),
    gateway: text('gateway'),
    externalId: text('external_id'),
    baseCurrency: text('base_currency'),
    baseAmountCents: integer('base_amount_cents'),
    settlementCurrency: text('settlement_currency'),
    settlementAmountCents: integer('settlement_amount_cents'),
    exchangeRate: text('exchange_rate'),
    exchangeRateAt: timestamp('exchange_rate_at'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_transactions_user_source').on(table.userId, table.sourceType, table.sourceId),
    uniqueIndex('uq_transactions_external_id').on(table.externalId),
    index('idx_transactions_status').on(table.status),
  ],
);

export type Transaction = typeof transactions.$inferSelect;

// ============================================================
// Usage Records Table
// ============================================================

export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    amount: integer('amount').notNull(),
    quotaIds: jsonb('quota_ids').$type<string[]>(),
    overageChargedCents: integer('overage_charged_cents'),
    occurredAt: timestamp('occurred_at').notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('idx_usage_records_user_feature').on(table.userId, table.subject),
    index('idx_usage_records_occurred_at').on(table.occurredAt),
  ],
);

export type UsageRecord = typeof usageRecords.$inferSelect;

// ============================================================
// Plan Subscriptions Table
// ============================================================

export const planSubscriptions = pgTable(
  'plan_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    status: text('status').notNull().$type<SubscriptionStatus>(),
    version: integer('version').notNull().default(1),
    currentPeriodStart: timestamp('current_period_start').notNull(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    billingCycleAnchor: integer('billing_cycle_anchor'),
    trialStart: timestamp('trial_start'),
    trialEnd: timestamp('trial_end'),
    renewalCount: integer('renewal_count').notNull().default(0),
    lastRenewalAt: timestamp('last_renewal_at'),
    gateway: text('gateway'),
    externalSubscriptionId: text('external_subscription_id'),
    initialTransactionId: uuid('initial_transaction_id')
      .references(() => transactions.id, { onDelete: 'set null' }),
    latestTransactionId: uuid('latest_transaction_id')
      .references(() => transactions.id, { onDelete: 'set null' }),
    canceledAt: timestamp('canceled_at'),
    cancelReason: text('cancel_reason'),
    cancelAtPeriodEnd: integer('cancel_at_period_end').default(0),
    scheduledPlanId: text('scheduled_plan_id')
      .references(() => plans.id, { onDelete: 'set null' }),
    scheduledChangeAt: timestamp('scheduled_change_at'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_subscriptions_tenant').on(table.organizationId),
    index('idx_subscriptions_status').on(table.status),
    index('idx_subscriptions_period_end').on(table.currentPeriodEnd),
    uniqueIndex('uq_subscriptions_external_id').on(table.externalSubscriptionId),
    uniqueIndex('uq_subscriptions_tenant_plan_active')
      .on(table.organizationId, table.planId)
      .where(sql`status IN ('active', 'trialing')`),
  ],
);

export type PlanSubscription = typeof planSubscriptions.$inferSelect;

// ============================================================
// Tenant Quotas Table
// ============================================================

export const tenantQuotas = pgTable(
  'tenant_quotas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    balance: integer('balance').notNull(),
    priority: integer('priority').notNull().default(100),
    expiresAt: timestamp('expires_at'),
    sourceType: text('source_type').notNull().$type<QuotaSourceType>(),
    sourceId: text('source_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_tenant_quotas_tenant_feature').on(table.organizationId, table.subject),
    index('idx_tenant_quotas_waterfall').on(
      table.organizationId,
      table.subject,
      table.balance,
      table.priority,
      table.expiresAt,
    ),
    uniqueIndex('uq_tenant_quotas_source').on(
      table.organizationId,
      table.subject,
      table.sourceType,
      table.sourceId,
    ),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const capabilitySchema = createInsertSchema(capabilities);
export const planSchema = createInsertSchema(plans);
export const planItemSchema = createInsertSchema(planItems);
export const userQuotaSchema = createInsertSchema(userQuotas);
export const walletSchema = createInsertSchema(wallets);
export const transactionSchema = createInsertSchema(transactions);
export const usageRecordSchema = createInsertSchema(usageRecords);
export const planSubscriptionSchema = createInsertSchema(planSubscriptions);
export const tenantQuotaSchema = createInsertSchema(tenantQuotas);

// ============================================================
// Inferred Types
// ============================================================

export type TenantQuota = typeof tenantQuotas.$inferSelect;
export type InsertPlan = typeof plans.$inferInsert;
export type InsertPlanItem = typeof planItems.$inferInsert;
export type InsertCapability = typeof capabilities.$inferInsert;
export type InsertUserQuota = typeof userQuotas.$inferInsert;
export type InsertTransaction = typeof transactions.$inferInsert;
export type InsertUsageRecord = typeof usageRecords.$inferInsert;
export type InsertPlanSubscription = typeof planSubscriptions.$inferInsert;
export type InsertTenantQuota = typeof tenantQuotas.$inferInsert;

