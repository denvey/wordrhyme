/**
 * RenewalService Unit Tests
 *
 * Tests for:
 * - Task 9.2: Quota reset strategies (hard / soft / capped)
 * - Task 9.4: Optimistic lock prevents duplicate renewal
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RenewalService } from '../../billing/services/renewal.service.js';

// ─── Shared test data ────────────────────────────────────────────────────────

const mockPlan = {
  id: 'plan-basic',
  name: 'Basic Plan',
  priceCents: 0,          // free by default so payment branch is skipped
  currency: 'usd',
  interval: 'month',
  intervalCount: 1,
  isActive: 1,
};

const PERIOD_START = new Date('2025-01-01T00:00:00.000Z');
const PERIOD_END   = new Date('2025-02-01T00:00:00.000Z'); // expired – renewal eligible

const mockSubscription = {
  id: 'sub-123',
  organizationId: 'org-123',
  planId: 'plan-basic',
  status: 'active' as const,
  currentPeriodStart: PERIOD_START,
  currentPeriodEnd: PERIOD_END,
  cancelAtPeriodEnd: 0,
  scheduledPlanId: null,
  scheduledChangeAt: null,
  renewalCount: 3,
  gateway: 'stripe',
  version: 1,
};

// Renewed subscription returned by extendPeriod
const mockRenewedSubscription = {
  ...mockSubscription,
  currentPeriodStart: PERIOD_END,
  currentPeriodEnd: new Date('2025-03-01T00:00:00.000Z'),
  renewalCount: 4,
  version: 2,
};

// ─── Mock dependencies ───────────────────────────────────────────────────────

const mockSubscriptionRepo = {
  getById: vi.fn(),
  updateStatus: vi.fn(),
  extendPeriod: vi.fn(),
  applyPlanChange: vi.fn(),
  findExpiring: vi.fn(),
};

const mockTenantQuotaRepo = {
  getByTenantAndSubject: vi.fn(),
  upsertBySource: vi.fn(),
  deleteBySource: vi.fn(),
};

const mockBillingRepo = {
  getPlanById: vi.fn(),
  getPlanItems: vi.fn(),
};

const mockPaymentService = {
  createPaymentIntent: vi.fn(),
};

const mockEntitlementService = {
  invalidateForOrg: vi.fn(),
};

const mockEventBus = {
  emit: vi.fn(),
};

// db is unused by RenewalService (injected but not stored)
const mockDb = {};

// ─── Helper: build a metered plan item ───────────────────────────────────────

function makeMeteredItem(overrides: Partial<{
  id: string;
  subject: string;
  amount: number;
  resetStrategy: 'hard' | 'soft' | 'capped';
  resetCap: number | null;
  priority: number;
}> = {}) {
  return {
    id: overrides.id ?? 'item-1',
    planId: 'plan-basic',
    subject: overrides.subject ?? 'core.api_calls',
    type: 'metered' as const,
    amount: overrides.amount ?? 1000,
    resetMode: 'period' as const,
    quotaScope: 'tenant' as const,
    resetStrategy: overrides.resetStrategy ?? 'hard',
    resetCap: overrides.resetCap ?? null,
    priority: overrides.priority ?? 0,
    overagePolicy: 'deny' as const,
    overagePriceCents: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RenewalService', () => {
  let service: RenewalService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy-path stubs
    mockSubscriptionRepo.getById.mockResolvedValue(mockSubscription);
    mockSubscriptionRepo.extendPeriod.mockResolvedValue(mockRenewedSubscription);
    mockBillingRepo.getPlanById.mockResolvedValue(mockPlan);
    mockBillingRepo.getPlanItems.mockResolvedValue([]);
    mockTenantQuotaRepo.getByTenantAndSubject.mockResolvedValue([]);
    mockTenantQuotaRepo.upsertBySource.mockResolvedValue({});
    mockEntitlementService.invalidateForOrg.mockResolvedValue(undefined);

    service = new RenewalService(
      mockDb as any,
      mockSubscriptionRepo as any,
      mockTenantQuotaRepo as any,
      mockBillingRepo as any,
      mockPaymentService as any,
      mockEntitlementService as any,
      mockEventBus as any
    );
  });

  // ─── Basic renewal flow ───────────────────────────────────────────────────

  describe('processRenewal() – basic flow', () => {
    it('should throw when subscription is not found', async () => {
      mockSubscriptionRepo.getById.mockResolvedValue(null);

      await expect(service.processRenewal('sub-unknown')).rejects.toThrow(
        'not found'
      );
    });

    it('should throw when subscription is not eligible (canceled)', async () => {
      mockSubscriptionRepo.getById.mockResolvedValue({
        ...mockSubscription,
        status: 'canceled',
      });

      await expect(service.processRenewal('sub-123')).rejects.toThrow(
        'not eligible for renewal'
      );
    });

    it('should expire subscription when cancelAtPeriodEnd=1', async () => {
      mockSubscriptionRepo.getById.mockResolvedValue({
        ...mockSubscription,
        cancelAtPeriodEnd: 1,
      });
      mockSubscriptionRepo.updateStatus.mockResolvedValue({
        ...mockSubscription,
        status: 'expired',
      });
      mockBillingRepo.getPlanItems.mockResolvedValue([]);

      const result = await service.processRenewal('sub-123');

      expect(result.renewed).toBe(false);
      expect(result.subscription.status).toBe('expired');
      expect(mockSubscriptionRepo.updateStatus).toHaveBeenCalledWith(
        'sub-123',
        'expired'
      );
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'subscription.expired',
        expect.objectContaining({ subscriptionId: 'sub-123' })
      );
    });

    it('should renew a free subscription successfully', async () => {
      const result = await service.processRenewal('sub-123');

      expect(result.renewed).toBe(true);
      expect(result.paymentRequired).toBe(false);
      expect(result.paymentSucceeded).toBeUndefined();
      expect(mockSubscriptionRepo.extendPeriod).toHaveBeenCalledWith(
        'sub-123',
        mockSubscription.version,          // planChanged=false → version unchanged
        PERIOD_END,                        // newPeriodStart = old currentPeriodEnd
        expect.any(Date),
        undefined                          // no transactionId for free plan
      );
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'subscription.renewed',
        expect.objectContaining({ subscriptionId: 'sub-123' })
      );
    });

    it('should extend period by one month by default', async () => {
      await service.processRenewal('sub-123');

      const [, , , newPeriodEnd] =
        mockSubscriptionRepo.extendPeriod.mock.calls[0]!;

      // Feb 01 + 1 month = Mar 01
      expect((newPeriodEnd as Date).toISOString()).toBe(
        '2025-03-01T00:00:00.000Z'
      );
    });
  });

  // ─── Quota reset strategies (Task 9.2) ───────────────────────────────────

  describe('resetQuotas() – via processRenewal()', () => {
    it('hard strategy: replaces existing balance with plan amount', async () => {
      const item = makeMeteredItem({ resetStrategy: 'hard', amount: 1000 });
      mockBillingRepo.getPlanItems.mockResolvedValue([item]);

      // Simulate 400 remaining credits from a previous period
      mockTenantQuotaRepo.getByTenantAndSubject.mockResolvedValue([
        {
          id: 'tq-1',
          organizationId: 'org-123',
          subject: 'core.api_calls',
          sourceId: 'plan_plan-basic',
          sourceType: 'membership',
          balance: 400,
          priority: 0,
        },
      ]);

      await service.processRenewal('sub-123');

      // Hard: balance must be exactly the plan amount, rollover ignored
      expect(mockTenantQuotaRepo.upsertBySource).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
          subject: 'core.api_calls',
          balance: 1000,
          metadata: expect.objectContaining({ strategy: 'hard', previousBalance: 400 }),
        })
      );
    });

    it('soft strategy: adds plan amount to remaining balance (no cap)', async () => {
      const item = makeMeteredItem({ resetStrategy: 'soft', amount: 1000 });
      mockBillingRepo.getPlanItems.mockResolvedValue([item]);

      // 400 credits remaining
      mockTenantQuotaRepo.getByTenantAndSubject.mockResolvedValue([
        {
          id: 'tq-1',
          organizationId: 'org-123',
          subject: 'core.api_calls',
          sourceId: 'plan_plan-basic',
          sourceType: 'membership',
          balance: 400,
          priority: 0,
        },
      ]);

      await service.processRenewal('sub-123');

      // Soft: 400 remaining + 1000 new = 1400
      expect(mockTenantQuotaRepo.upsertBySource).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 1400,
          metadata: expect.objectContaining({ strategy: 'soft', previousBalance: 400 }),
        })
      );
    });

    it('soft strategy with zero remaining balance: equals plan amount', async () => {
      const item = makeMeteredItem({ resetStrategy: 'soft', amount: 1000 });
      mockBillingRepo.getPlanItems.mockResolvedValue([item]);
      // All credits consumed – no existing quota rows
      mockTenantQuotaRepo.getByTenantAndSubject.mockResolvedValue([]);

      await service.processRenewal('sub-123');

      // 0 + 1000 = 1000
      expect(mockTenantQuotaRepo.upsertBySource).toHaveBeenCalledWith(
        expect.objectContaining({ balance: 1000 })
      );
    });

    it('capped strategy: adds remaining but caps at resetCap', async () => {
      const item = makeMeteredItem({
        resetStrategy: 'capped',
        amount: 1000,
        resetCap: 1200,   // hard ceiling
      });
      mockBillingRepo.getPlanItems.mockResolvedValue([item]);

      // 400 remaining
      mockTenantQuotaRepo.getByTenantAndSubject.mockResolvedValue([
        {
          id: 'tq-1',
          organizationId: 'org-123',
          subject: 'core.api_calls',
          sourceId: 'plan_plan-basic',
          sourceType: 'membership',
          balance: 400,
          priority: 0,
        },
      ]);

      await service.processRenewal('sub-123');

      // Without cap: 400 + 1000 = 1400, but cap = 1200 → 1200
      expect(mockTenantQuotaRepo.upsertBySource).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 1200,
          metadata: expect.objectContaining({ strategy: 'capped', previousBalance: 400 }),
        })
      );
    });

    it('capped strategy: does not exceed cap when remaining is high', async () => {
      const item = makeMeteredItem({
        resetStrategy: 'capped',
        amount: 1000,
        resetCap: 1500,
      });
      mockBillingRepo.getPlanItems.mockResolvedValue([item]);

      // 800 remaining → 800 + 1000 = 1800 > cap 1500
      mockTenantQuotaRepo.getByTenantAndSubject.mockResolvedValue([
        {
          id: 'tq-1',
          organizationId: 'org-123',
          subject: 'core.api_calls',
          sourceId: 'plan_plan-basic',
          sourceType: 'membership',
          balance: 800,
          priority: 0,
        },
      ]);

      await service.processRenewal('sub-123');

      expect(mockTenantQuotaRepo.upsertBySource).toHaveBeenCalledWith(
        expect.objectContaining({ balance: 1500 })
      );
    });

    it('capped strategy: uses amount*2 as default cap when resetCap is null', async () => {
      const item = makeMeteredItem({
        resetStrategy: 'capped',
        amount: 1000,
        resetCap: null,  // default cap = 1000 * 2 = 2000
      });
      mockBillingRepo.getPlanItems.mockResolvedValue([item]);

      // 1500 remaining → 1500 + 1000 = 2500 > default cap 2000
      mockTenantQuotaRepo.getByTenantAndSubject.mockResolvedValue([
        {
          id: 'tq-1',
          organizationId: 'org-123',
          subject: 'core.api_calls',
          sourceId: 'plan_plan-basic',
          sourceType: 'membership',
          balance: 1500,
          priority: 0,
        },
      ]);

      await service.processRenewal('sub-123');

      expect(mockTenantQuotaRepo.upsertBySource).toHaveBeenCalledWith(
        expect.objectContaining({ balance: 2000 })
      );
    });

    it('skips items where type is not metered', async () => {
      const booleanItem = {
        ...makeMeteredItem(),
        type: 'boolean' as const,
      };
      mockBillingRepo.getPlanItems.mockResolvedValue([booleanItem]);

      const result = await service.processRenewal('sub-123');

      expect(result.quotasReset).toBe(0);
      expect(mockTenantQuotaRepo.upsertBySource).not.toHaveBeenCalled();
    });

    it('skips items where quotaScope is not tenant', async () => {
      const userScopedItem = {
        ...makeMeteredItem(),
        quotaScope: 'user' as const,
      };
      mockBillingRepo.getPlanItems.mockResolvedValue([userScopedItem]);

      const result = await service.processRenewal('sub-123');

      expect(result.quotasReset).toBe(0);
      expect(mockTenantQuotaRepo.upsertBySource).not.toHaveBeenCalled();
    });

    it('skips items where resetMode is not period', async () => {
      const neverResetItem = {
        ...makeMeteredItem(),
        resetMode: 'never' as const,
      };
      mockBillingRepo.getPlanItems.mockResolvedValue([neverResetItem]);

      const result = await service.processRenewal('sub-123');

      expect(result.quotasReset).toBe(0);
      expect(mockTenantQuotaRepo.upsertBySource).not.toHaveBeenCalled();
    });

    it('resets multiple eligible items and reports correct count', async () => {
      const items = [
        makeMeteredItem({ id: 'item-1', subject: 'core.api_calls', amount: 1000 }),
        makeMeteredItem({ id: 'item-2', subject: 'core.storage_gb', amount: 50 }),
      ];
      mockBillingRepo.getPlanItems.mockResolvedValue(items);
      mockTenantQuotaRepo.getByTenantAndSubject.mockResolvedValue([]);

      const result = await service.processRenewal('sub-123');

      expect(result.quotasReset).toBe(2);
      expect(mockTenantQuotaRepo.upsertBySource).toHaveBeenCalledTimes(2);
    });

    it('emits billing.quota.reset event when quotas are reset', async () => {
      const item = makeMeteredItem({ amount: 1000 });
      mockBillingRepo.getPlanItems.mockResolvedValue([item]);
      mockTenantQuotaRepo.getByTenantAndSubject.mockResolvedValue([]);

      await service.processRenewal('sub-123');

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'billing.quota.reset',
        expect.objectContaining({
          organizationId: 'org-123',
          planId: 'plan-basic',
          quotasReset: 1,
        })
      );
    });

    it('does not emit billing.quota.reset when no quotas are reset', async () => {
      // No plan items → quotasReset = 0
      mockBillingRepo.getPlanItems.mockResolvedValue([]);

      await service.processRenewal('sub-123');

      const quotaResetCalls = mockEventBus.emit.mock.calls.filter(
        (args) => args[0] === 'billing.quota.reset'
      );
      expect(quotaResetCalls).toHaveLength(0);
    });

    it('upsert receives correct sourceId using plan_ prefix', async () => {
      const item = makeMeteredItem({ amount: 500 });
      mockBillingRepo.getPlanItems.mockResolvedValue([item]);
      mockTenantQuotaRepo.getByTenantAndSubject.mockResolvedValue([]);

      await service.processRenewal('sub-123');

      expect(mockTenantQuotaRepo.upsertBySource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'membership',
          sourceId: 'plan_plan-basic',
        })
      );
    });

    it('only sums balances from the matching sourceId when calculating currentBalance', async () => {
      const item = makeMeteredItem({ resetStrategy: 'soft', amount: 1000 });
      mockBillingRepo.getPlanItems.mockResolvedValue([item]);

      // Two rows: one from our plan, one from a different source (admin grant)
      mockTenantQuotaRepo.getByTenantAndSubject.mockResolvedValue([
        {
          id: 'tq-plan',
          organizationId: 'org-123',
          subject: 'core.api_calls',
          sourceId: 'plan_plan-basic',   // matches
          sourceType: 'membership',
          balance: 300,
          priority: 0,
        },
        {
          id: 'tq-admin',
          organizationId: 'org-123',
          subject: 'core.api_calls',
          sourceId: 'admin_grant_xyz',   // does not match
          sourceType: 'admin_grant',
          balance: 500,
          priority: 100,
        },
      ]);

      await service.processRenewal('sub-123');

      // currentBalance should be 300 (only matching sourceId), not 800
      // soft: 300 + 1000 = 1300
      expect(mockTenantQuotaRepo.upsertBySource).toHaveBeenCalledWith(
        expect.objectContaining({ balance: 1300 })
      );
    });
  });

  // ─── Scheduled plan change during renewal ────────────────────────────────

  describe('processRenewal() – scheduled plan change', () => {
    const newPlan = {
      ...mockPlan,
      id: 'plan-pro',
      name: 'Pro Plan',
    };

    it('applies scheduled plan change when scheduledChangeAt has passed', async () => {
      const subWithSchedule = {
        ...mockSubscription,
        scheduledPlanId: 'plan-pro',
        scheduledChangeAt: new Date('2025-01-15T00:00:00.000Z'), // in the past
      };
      mockSubscriptionRepo.getById.mockResolvedValue(subWithSchedule);
      mockSubscriptionRepo.applyPlanChange.mockResolvedValue({
        ...subWithSchedule,
        planId: 'plan-pro',
        scheduledPlanId: null,
        version: 2,
      });
      mockBillingRepo.getPlanById.mockImplementation((id: string) =>
        id === 'plan-pro' ? Promise.resolve(newPlan) : Promise.resolve(mockPlan)
      );

      const result = await service.processRenewal('sub-123');

      expect(result.planChanged).toBe(true);
      expect(result.newPlanId).toBe('plan-pro');
      expect(mockSubscriptionRepo.applyPlanChange).toHaveBeenCalledWith(
        'sub-123',
        subWithSchedule.version
      );
    });

    it('does not apply plan change when scheduledChangeAt is in the future', async () => {
      // Use a date far in the future so it is always ahead of Date.now()
      const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const futureDateSub = {
        ...mockSubscription,
        scheduledPlanId: 'plan-pro',
        scheduledChangeAt: farFuture,
      };
      mockSubscriptionRepo.getById.mockResolvedValue(futureDateSub);

      const result = await service.processRenewal('sub-123');

      expect(result.planChanged).toBe(false);
      expect(mockSubscriptionRepo.applyPlanChange).not.toHaveBeenCalled();
    });
  });

  // ─── Payment processing ───────────────────────────────────────────────────

  describe('processRenewal() – payment processing', () => {
    const paidPlan = { ...mockPlan, priceCents: 2999 };

    beforeEach(() => {
      mockBillingRepo.getPlanById.mockResolvedValue(paidPlan);
    });

    it('processes payment for paid plans', async () => {
      mockPaymentService.createPaymentIntent.mockResolvedValue({
        transactionId: 'txn-abc',
        status: 'succeeded',
      });
      mockSubscriptionRepo.extendPeriod.mockResolvedValue({
        ...mockRenewedSubscription,
        latestTransactionId: 'txn-abc',
      });

      const result = await service.processRenewal('sub-123');

      expect(result.paymentRequired).toBe(true);
      expect(result.paymentSucceeded).toBe(true);
      expect(result.transactionId).toBe('txn-abc');
      expect(mockPaymentService.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 2999,
          currency: 'usd',
          mode: 'subscription',
        })
      );
    });

    it('marks subscription as past_due when payment fails', async () => {
      mockPaymentService.createPaymentIntent.mockRejectedValue(
        new Error('Card declined')
      );
      mockSubscriptionRepo.updateStatus.mockResolvedValue({
        ...mockSubscription,
        status: 'past_due',
      });

      const result = await service.processRenewal('sub-123');

      expect(result.renewed).toBe(false);
      expect(result.paymentSucceeded).toBe(false);
      expect(mockSubscriptionRepo.updateStatus).toHaveBeenCalledWith(
        'sub-123',
        'past_due'
      );
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'subscription.payment_failed',
        expect.objectContaining({ subscriptionId: 'sub-123' })
      );
    });

    it('does not extend period when payment fails', async () => {
      mockPaymentService.createPaymentIntent.mockRejectedValue(
        new Error('Payment gateway timeout')
      );
      mockSubscriptionRepo.updateStatus.mockResolvedValue({
        ...mockSubscription,
        status: 'past_due',
      });

      await service.processRenewal('sub-123');

      expect(mockSubscriptionRepo.extendPeriod).not.toHaveBeenCalled();
    });
  });

  // ─── Optimistic lock – concurrent renewal prevention (Task 9.4) ──────────

  describe('processRenewal() – optimistic lock (Task 9.4)', () => {
    it('throws when extendPeriod returns null due to version mismatch', async () => {
      // extendPeriod returns null = another process already updated the row
      mockSubscriptionRepo.extendPeriod.mockResolvedValue(null);

      await expect(service.processRenewal('sub-123')).rejects.toThrow(
        'Failed to extend period'
      );
    });

    it('passes expected version to extendPeriod for optimistic lock', async () => {
      const subWithVersion5 = { ...mockSubscription, version: 5 };
      mockSubscriptionRepo.getById.mockResolvedValue(subWithVersion5);
      mockSubscriptionRepo.extendPeriod.mockResolvedValue({
        ...mockRenewedSubscription,
        version: 6,
      });

      await service.processRenewal('sub-123');

      expect(mockSubscriptionRepo.extendPeriod).toHaveBeenCalledWith(
        'sub-123',
        5,  // expectedVersion = subscription.version (planChanged=false)
        expect.any(Date),
        expect.any(Date),
        undefined
      );
    });

    it('passes version+1 to extendPeriod when plan was changed during renewal', async () => {
      // Subscription with a scheduled plan change ready to apply
      const subWithPlanChange = {
        ...mockSubscription,
        version: 3,
        scheduledPlanId: 'plan-pro',
        scheduledChangeAt: new Date('2025-01-15T00:00:00.000Z'),
      };
      mockSubscriptionRepo.getById.mockResolvedValue(subWithPlanChange);
      mockSubscriptionRepo.applyPlanChange.mockResolvedValue({
        ...subWithPlanChange,
        planId: 'plan-pro',
        version: 4,  // applyPlanChange increments version
      });
      mockBillingRepo.getPlanById.mockResolvedValue(mockPlan); // pro plan also free
      mockSubscriptionRepo.extendPeriod.mockResolvedValue({
        ...mockRenewedSubscription,
        version: 5,
      });

      await service.processRenewal('sub-123');

      // planChanged=true → expectedVersion = subscription.version + 1 = 4
      expect(mockSubscriptionRepo.extendPeriod).toHaveBeenCalledWith(
        'sub-123',
        4,
        expect.any(Date),
        expect.any(Date),
        undefined
      );
    });

    it('invalidates entitlements after successful renewal', async () => {
      await service.processRenewal('sub-123');

      expect(mockEntitlementService.invalidateForOrg).toHaveBeenCalledWith(
        'org-123'
      );
    });

    it('invalidates entitlements even when cancelAtPeriodEnd causes expiry', async () => {
      mockSubscriptionRepo.getById.mockResolvedValue({
        ...mockSubscription,
        cancelAtPeriodEnd: 1,
      });
      mockSubscriptionRepo.updateStatus.mockResolvedValue({
        ...mockSubscription,
        status: 'expired',
      });
      mockBillingRepo.getPlanItems.mockResolvedValue([]);

      await service.processRenewal('sub-123');

      expect(mockEntitlementService.invalidateForOrg).toHaveBeenCalledWith(
        'org-123'
      );
    });
  });

  // ─── processAllDueRenewals() ─────────────────────────────────────────────

  describe('processAllDueRenewals()', () => {
    it('processes all due subscriptions and reports correct counts', async () => {
      const dueSubs = [
        { ...mockSubscription, id: 'sub-1' },
        { ...mockSubscription, id: 'sub-2' },
      ];
      mockSubscriptionRepo.findExpiring.mockResolvedValue(dueSubs);
      // getById is called once per processRenewal
      mockSubscriptionRepo.getById
        .mockResolvedValueOnce({ ...mockSubscription, id: 'sub-1' })
        .mockResolvedValueOnce({ ...mockSubscription, id: 'sub-2' });

      const result = await service.processAllDueRenewals();

      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('captures errors per subscription without crashing the batch', async () => {
      const dueSubs = [
        { ...mockSubscription, id: 'sub-ok' },
        { ...mockSubscription, id: 'sub-bad' },
      ];
      mockSubscriptionRepo.findExpiring.mockResolvedValue(dueSubs);
      // sub-ok succeeds, sub-bad throws
      mockSubscriptionRepo.getById
        .mockResolvedValueOnce({ ...mockSubscription, id: 'sub-ok' })
        .mockRejectedValueOnce(new Error('DB connection lost'));

      const result = await service.processAllDueRenewals();

      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toMatchObject({
        subscriptionId: 'sub-bad',
        error: 'DB connection lost',
      });
    });

    it('returns zero counts when no subscriptions are due', async () => {
      mockSubscriptionRepo.findExpiring.mockResolvedValue([]);

      const result = await service.processAllDueRenewals();

      expect(result.processed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
    });
  });
});
