# Membership Subscription System Design

> Version: 1.0
> Date: 2026-01-14
> Status: Approved

---

## 1. Overview

### 1.1 Business Model

```
Tenant 订阅 Plan → 分配共享配额 (高 priority)
Admin 给 Tenant 加量 → 共享配额池 (中 priority)
User 个人购买加量 → 个人专属 (低 priority)
```

### 1.2 Deduction Order

```
1️⃣ Tenant 共享配额 (tenantQuotas) - priority DESC, expiresAt ASC
2️⃣ User 个人配额 (userQuotas) - priority DESC, expiresAt ASC
3️⃣ 超额处理 (wallet deduction)
```

### 1.3 Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Subscription Subject | Tenant | Aligns with B2B SaaS model |
| Quota Pool Separation | Separate tables | Avoid breaking existing userQuotas contract |
| Deduction Order | Tenant → User | Use shared pool first, preserve personal purchases |
| Priority | Customizable | Flexible business rules |

---

## 2. Data Model

### 2.1 New Table: `plan_subscriptions`

Tenant subscription to a Plan.

```typescript
export type SubscriptionStatus =
  | 'trialing'    // Trial period
  | 'active'      // Active subscription
  | 'past_due'    // Payment overdue
  | 'canceled'    // Canceled (expires at period end)
  | 'expired';    // Subscription ended

export const planSubscriptions = pgTable(
  'plan_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Core relationships
    tenantId: text('tenant_id').notNull(),
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
    cancelAtPeriodEnd: integer('cancel_at_period_end').default(0),

    // Plan changes (upgrade/downgrade)
    scheduledPlanId: text('scheduled_plan_id').references(() => plans.id),
    scheduledChangeAt: timestamp('scheduled_change_at'),

    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_subscriptions_tenant').on(table.tenantId),
    statusIdx: index('idx_subscriptions_status').on(table.status),
    periodEndIdx: index('idx_subscriptions_period_end').on(table.currentPeriodEnd),
    externalIdUniq: uniqueIndex('uq_subscriptions_external_id').on(
      table.externalSubscriptionId
    ),
    // Partial unique: one active subscription per tenant per plan
    activePlanUniq: uniqueIndex('uq_subscriptions_tenant_plan_active').on(
      table.tenantId,
      table.planId
    ).where(sql`status IN ('active', 'trialing')`),
  })
);
```

### 2.2 New Table: `tenant_quotas`

Tenant shared quota pool (separate from user_quotas).

```typescript
export const tenantQuotas = pgTable(
  'tenant_quotas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id').notNull(),
    featureKey: text('feature_key').notNull(),
    balance: integer('balance').notNull(),
    priority: integer('priority').notNull().default(100), // Higher than user quotas
    expiresAt: timestamp('expires_at'),
    sourceType: text('source_type').notNull().$type<QuotaSourceType>(),
    sourceId: text('source_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    tenantFeatureIdx: index('idx_tenant_quotas_tenant_feature').on(
      table.tenantId,
      table.featureKey
    ),
    waterfallIdx: index('idx_tenant_quotas_waterfall').on(
      table.tenantId,
      table.featureKey,
      table.balance,
      table.priority,
      table.expiresAt
    ),
    sourceUniq: uniqueIndex('uq_tenant_quotas_source').on(
      table.tenantId,
      table.featureKey,
      table.sourceType,
      table.sourceId
    ),
  })
);
```

### 2.3 Extend: `plan_items`

Add quota reset strategy and scope.

```typescript
export type ResetStrategy = 'hard' | 'soft' | 'capped';
export type QuotaScope = 'tenant' | 'user';

// Add to existing planItems table:
resetStrategy: text('reset_strategy').$type<ResetStrategy>().default('hard'),
resetCap: integer('reset_cap'),  // Max balance after reset (for 'capped' strategy)
quotaScope: text('quota_scope').$type<QuotaScope>().notNull().default('tenant'),
```

### 2.4 Extend: `user_quotas`

Add tenant isolation for user quotas.

```typescript
// Add to existing userQuotas table:
tenantId: text('tenant_id'),  // For tenant isolation of user purchases
```

---

## 3. Reset Strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `hard` | Delete old quota, grant new full amount | Standard monthly reset |
| `soft` | Keep remaining + add new amount | Loyalty reward |
| `capped` | soft but cap at `resetCap` | Prevent hoarding |

Example:
- Plan grants 1000 tokens/month
- User has 200 remaining at renewal
- `hard`: New balance = 1000
- `soft`: New balance = 1200
- `capped(1500)`: New balance = 1200 (under cap)

---

## 4. Core Services

### 4.1 SubscriptionService

```typescript
interface SubscriptionService {
  // Lifecycle
  create(input: CreateSubscriptionInput): Promise<Subscription>;
  activate(subscriptionId: string): Promise<void>;
  cancel(subscriptionId: string, reason?: string): Promise<void>;

  // Queries
  getByTenant(tenantId: string): Promise<Subscription | null>;
  getActiveByTenant(tenantId: string): Promise<Subscription[]>;

  // Plan changes
  schedulePlanChange(subscriptionId: string, newPlanId: string): Promise<void>;
  applyScheduledChange(subscriptionId: string): Promise<void>;
}
```

### 4.2 RenewalService

```typescript
interface RenewalService {
  // Renewal
  renewSubscription(subscriptionId: string): Promise<void>;

  // Quota reset
  resetQuotasForRenewal(
    tenantId: string,
    planId: string,
    newPeriodEnd: Date
  ): Promise<void>;

  // Batch processing
  processExpiringSubscriptions(): Promise<void>;
}
```

### 4.3 UnifiedUsageService

Extends existing UsageService with dual-dimension deduction.

```typescript
interface UnifiedUsageService {
  consume(input: {
    tenantId: string;
    userId: string;
    featureKey: string;
    amount: number;
    allowOverage?: boolean;
  }): Promise<ConsumeQuotaResult>;
}
```

**Deduction Algorithm:**
1. Lock and fetch tenant quotas (priority DESC, expiresAt ASC)
2. Deduct from tenant pool
3. If remaining > 0, lock and fetch user quotas
4. Deduct from user pool
5. If remaining > 0 and allowOverage, charge wallet
6. Record usage with deduction breakdown

---

## 5. Subscription Flows

### 5.1 Create Subscription

```
User Request → Validate Plan → Create PaymentIntent
    → Payment Success Webhook → Create Subscription → Provision Quotas
```

```typescript
async createSubscription(input: {
  tenantId: string;
  planId: string;
  gateway: string;
}): Promise<CreateSubscriptionResult> {
  // 1. Validate no active subscription for this plan
  // 2. Get plan details and calculate period
  // 3. Create payment intent via PaymentService
  // 4. Return clientSecret for frontend completion

  // On webhook success:
  // 5. Create subscription record (status: 'active')
  // 6. Provision tenant quotas based on planItems
  // 7. Emit 'subscription.created' event
}
```

### 5.2 Renewal Flow

```
Scheduler (daily) → Find expiring subscriptions
    → For each: Create renewal payment → On success: Extend period + Reset quotas
```

```typescript
async renewSubscription(subscriptionId: string): Promise<void> {
  await this.db.transaction(async (tx) => {
    // 1. Lock subscription record
    // 2. Validate status = 'active'
    // 3. Calculate new period dates
    // 4. Update subscription (extend period, increment renewalCount)
    // 5. Reset quotas based on resetStrategy
    // 6. Emit 'subscription.renewed' event
  });
}
```

### 5.3 Cancellation Flow

```
User Cancel → Set cancelAtPeriodEnd = true
    → At period end: status = 'expired', quotas deleted
```

### 5.4 Upgrade/Downgrade Flow

```
User Request Change → Validate new plan → Schedule change
    → At period end: Switch plan, adjust quotas
```

**Immediate Upgrade Option:**
- Prorate remaining days
- Switch plan immediately
- Provision new quotas

---

## 6. Events

```typescript
export interface SubscriptionEvents {
  'subscription.created': {
    subscriptionId: string;
    tenantId: string;
    planId: string;
  };
  'subscription.activated': {
    subscriptionId: string;
  };
  'subscription.renewed': {
    subscriptionId: string;
    renewalCount: number;
    periodEnd: Date;
  };
  'subscription.plan_changed': {
    subscriptionId: string;
    fromPlanId: string;
    toPlanId: string;
  };
  'subscription.canceled': {
    subscriptionId: string;
    reason?: string;
    expiresAt: Date;
  };
  'subscription.expired': {
    subscriptionId: string;
  };
  'subscription.past_due': {
    subscriptionId: string;
    overdueAmount: number;
  };
}
```

---

## 7. API Endpoints (tRPC)

```typescript
export const subscriptionRouter = router({
  // Queries
  getCurrentSubscription: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(/* ... */),

  getSubscriptionHistory: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(/* ... */),

  // Mutations
  subscribe: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      planId: z.string(),
      gateway: z.string(),
    }))
    .mutation(/* ... */),

  cancel: protectedProcedure
    .input(z.object({
      subscriptionId: z.string(),
      reason: z.string().optional(),
      immediate: z.boolean().default(false),
    }))
    .mutation(/* ... */),

  changePlan: protectedProcedure
    .input(z.object({
      subscriptionId: z.string(),
      newPlanId: z.string(),
      immediate: z.boolean().default(false),
    }))
    .mutation(/* ... */),

  // Admin
  grantTenantQuota: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      featureKey: z.string(),
      amount: z.number().positive(),
      priority: z.number().default(50),
      expiresAt: z.string().datetime().optional(),
    }))
    .mutation(/* ... */),
});
```

---

## 8. Implementation Phases

### Phase 1: Data Model (2-3 days)

- [ ] Create `plan_subscriptions` table
- [ ] Create `tenant_quotas` table
- [ ] Extend `plan_items` with resetStrategy, quotaScope
- [ ] Extend `user_quotas` with tenantId
- [ ] Generate and apply migrations

### Phase 2: Core Services (3-4 days)

- [ ] Create SubscriptionRepository
- [ ] Create TenantQuotaRepository
- [ ] Create SubscriptionService
- [ ] Refactor UsageService → UnifiedUsageService
- [ ] Create RenewalService

### Phase 3: Business Flows (5-7 days)

- [ ] Implement subscribe flow with PaymentService integration
- [ ] Implement renewal flow with quota reset
- [ ] Implement cancellation flow
- [ ] Implement upgrade/downgrade flow
- [ ] Add webhook handlers for payment events
- [ ] Create tRPC router endpoints

### Phase 4: Monitoring (2-3 days)

- [ ] Add subscription events
- [ ] Implement expiring subscription alerts
- [ ] Add MRR calculation (optional)
- [ ] Add audit logging

---

## 9. Migration Strategy

### 9.1 Existing Data

Current `userQuotas` with `sourceType: 'membership'` need migration:

```typescript
// Migration script
async function migrateMembershipQuotas() {
  const membershipQuotas = await db.select()
    .from(userQuotas)
    .where(eq(userQuotas.sourceType, 'membership'));

  for (const quota of membershipQuotas) {
    const membership = await getMembershipByUserId(quota.userId);

    await db.insert(tenantQuotas).values({
      tenantId: membership.organizationId,
      featureKey: quota.featureKey,
      balance: quota.balance,
      priority: quota.priority,
      expiresAt: quota.expiresAt,
      sourceType: 'membership',
      sourceId: quota.sourceId,
      metadata: { migratedFrom: quota.id },
    });
  }
}
```

### 9.2 Backward Compatibility

- Keep existing `userQuotas` for personal purchases
- Add `tenantId` as optional field for tenant isolation
- UnifiedUsageService checks both tables

---

## 10. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Concurrent renewal | Optimistic lock (version field) |
| Double quota provision | Idempotency via sourceId uniqueness |
| Payment webhook failure | Retry queue + manual reconciliation |
| Quota over-deduction | Transaction + row locks |
| Plan deletion with active subs | Soft delete, prevent deletion |

---

## Appendix: Priority Guidelines

| Source | Suggested Priority | Notes |
|--------|-------------------|-------|
| Tenant Subscription | 100 | Base entitlement, use first |
| Admin Tenant Boost | 80 | Organization purchase |
| Promotional Grant | 60 | Time-limited offers |
| User Personal Purchase | 40 | Personal backup |
| Referral Bonus | 20 | Low priority extras |

Higher priority = deducted first.
