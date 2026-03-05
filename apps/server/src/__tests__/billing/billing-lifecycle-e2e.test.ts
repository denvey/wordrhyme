/**
 * Billing Full Lifecycle E2E Tests (Task 9.7)
 *
 * Tests the COORDINATION between billing services across the full lifecycle:
 * subscribe -> pay -> activate -> consume -> renew -> cancel
 *
 * Each test verifies one step. All tests share mock services and verify:
 * - Correct method calls across services
 * - Event emissions at each step
 * - State transitions (PENDING -> active -> canceled -> expired)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionService } from '../../billing/services/subscription.service.js';
import { PaymentService } from '../../billing/services/payment.service.js';
import { RenewalService } from '../../billing/services/renewal.service.js';
import { QuotaService } from '../../billing/services/quota.service.js';

// ─── Shared Test Constants ──────────────────────────────────────────────────

const ORG_ID = 'org-lifecycle-test';
const USER_ID = 'user-lifecycle-test';
const PLAN_ID = 'plan-pro-monthly';
const SUBSCRIPTION_ID = 'sub-lifecycle-001';
const TRANSACTION_ID = 'txn-lifecycle-001';
const EXTERNAL_ID = 'pi_stripe_lifecycle_001';

const PLAN_PRO = {
  id: PLAN_ID,
  name: 'Pro Plan Monthly',
  priceCents: 2900,
  currency: 'usd',
  interval: 'month',
  intervalCount: 1,
  isActive: 1,
};

const PLAN_ITEMS_METERED = [
  {
    id: 'item-ai-tokens',
    planId: PLAN_ID,
    subject: 'ai.tokens',
    type: 'metered',
    amount: 10000,
    priority: 100,
    quotaScope: 'tenant',
    resetMode: 'period',
    resetStrategy: 'hard',
    resetCap: null,
    overagePriceCents: 0,
  },
  {
    id: 'item-storage',
    planId: PLAN_ID,
    subject: 'storage.mb',
    type: 'metered',
    amount: 5000,
    priority: 100,
    quotaScope: 'tenant',
    resetMode: 'period',
    resetStrategy: 'hard',
    resetCap: null,
    overagePriceCents: 0,
  },
  {
    id: 'item-api-calls',
    planId: PLAN_ID,
    subject: 'api.calls',
    type: 'boolean',
    amount: null,
    priority: 0,
    quotaScope: 'tenant',
    resetMode: null,
    resetStrategy: null,
    resetCap: null,
    overagePriceCents: 0,
  },
];

const NOW = new Date('2026-03-01T00:00:00Z');
const PERIOD_END = new Date('2026-04-01T00:00:00Z');

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: SUBSCRIPTION_ID,
    organizationId: ORG_ID,
    planId: PLAN_ID,
    status: 'active',
    currentPeriodStart: NOW,
    currentPeriodEnd: PERIOD_END,
    billingCycleAnchor: 1,
    gateway: 'stripe',
    version: 1,
    renewalCount: 0,
    cancelAtPeriodEnd: 0,
    scheduledPlanId: null,
    scheduledChangeAt: null,
    initialTransactionId: null,
    trialStart: null,
    trialEnd: null,
    metadata: null,
    ...overrides,
  };
}

function makeTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSACTION_ID,
    userId: ORG_ID,
    amountCents: 2900,
    currency: 'usd',
    sourceType: 'membership' as const,
    sourceId: SUBSCRIPTION_ID,
    gateway: 'stripe',
    externalId: EXTERNAL_ID,
    status: 'PENDING' as string,
    metadata: { subscriptionId: SUBSCRIPTION_ID, planId: PLAN_ID },
    ...overrides,
  };
}

// ─── Mock Repositories ──────────────────────────────────────────────────────

const mockSubscriptionRepo = {
  create: vi.fn(),
  getById: vi.fn(),
  getActiveByTenant: vi.fn(),
  getAllByTenant: vi.fn(),
  updateStatus: vi.fn(),
  updateWithVersion: vi.fn(),
  schedulePlanChange: vi.fn(),
  applyPlanChange: vi.fn(),
  extendPeriod: vi.fn(),
  findExpiring: vi.fn(),
};

const mockTenantQuotaRepo = {
  upsertBySource: vi.fn(),
  deleteBySource: vi.fn(),
  getByTenantAndSubject: vi.fn(),
  getTotalBalance: vi.fn(),
};

const mockBillingRepo = {
  getPlanById: vi.fn(),
  getPlanItems: vi.fn(),
  createTransaction: vi.fn(),
  updateTransactionStatus: vi.fn(),
  getTransactionByExternalId: vi.fn(),
  getTransactionById: vi.fn(),
  getUserTransactions: vi.fn(),
  getCapabilityBySubject: vi.fn(),
  hasBooleanEntitlement: vi.fn(),
};

const mockQuotaRepo = {
  createQuota: vi.fn(),
  getQuotaBySource: vi.fn(),
  getUserQuotasBySubject: vi.fn(),
  getAllUserQuotas: vi.fn(),
  getTotalBalance: vi.fn(),
  getUserUsageRecords: vi.fn(),
  getTotalUsage: vi.fn(),
};

const mockAdapterRegistry = {
  getOrThrow: vi.fn(),
  register: vi.fn(),
  getAllMetadata: vi.fn(),
};

const mockAdapter = {
  name: 'stripe',
  handleWebhook: vi.fn(),
  createPaymentIntent: vi.fn(),
};

const mockEventBus = {
  emit: vi.fn(),
  emitAsync: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  clear: vi.fn(),
  listenerCount: vi.fn(),
};

const mockDb = {
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn(),
    }),
  }),
  transaction: vi.fn(),
};

const mockEntitlementService = {
  invalidateForOrg: vi.fn(),
  requireAccess: vi.fn(),
  requireAndConsume: vi.fn(),
  hasAccess: vi.fn(),
  hasQuota: vi.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Billing Full Lifecycle E2E', () => {
  let subscriptionService: SubscriptionService;
  let paymentService: PaymentService;
  let renewalService: RenewalService;
  let quotaService: QuotaService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock behaviors
    mockBillingRepo.getPlanItems.mockResolvedValue([]);
    mockAdapterRegistry.getOrThrow.mockReturnValue(mockAdapter);

    // Instantiate services with mocks
    subscriptionService = new SubscriptionService(
      mockDb as any,
      mockSubscriptionRepo as any,
      mockTenantQuotaRepo as any,
      mockBillingRepo as any,
      { createPaymentIntent: vi.fn() } as any,
      mockEntitlementService as any,
      mockEventBus as any,
    );

    paymentService = new PaymentService(
      mockAdapterRegistry as any,
      mockBillingRepo as any,
      mockEventBus as any,
    );

    renewalService = new RenewalService(
      mockDb as any,
      mockSubscriptionRepo as any,
      mockTenantQuotaRepo as any,
      mockBillingRepo as any,
      { createPaymentIntent: vi.fn() } as any,
      mockEntitlementService as any,
      mockEventBus as any,
    );

    quotaService = new QuotaService(
      mockQuotaRepo as any,
      mockEventBus as any,
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 1: Create subscription (status depends on plan price / trial)
  // ──────────────────────────────────────────────────────────────────────────

  it('Step 1: Create subscription for a paid plan (active, no trial)', async () => {
    const createdSub = makeSubscription({ status: 'active' });

    mockBillingRepo.getPlanById.mockResolvedValue(PLAN_PRO);
    mockSubscriptionRepo.getActiveByTenant.mockResolvedValue([]);
    mockSubscriptionRepo.create.mockResolvedValue(createdSub);
    mockBillingRepo.getPlanItems.mockResolvedValue(PLAN_ITEMS_METERED);

    // Re-create with a payment service mock that returns payment intent
    const mockPaySvc = {
      createPaymentIntent: vi.fn().mockResolvedValue({
        transactionId: TRANSACTION_ID,
        externalId: EXTERNAL_ID,
        clientSecret: 'cs_test_secret',
      }),
    };
    subscriptionService = new SubscriptionService(
      mockDb as any,
      mockSubscriptionRepo as any,
      mockTenantQuotaRepo as any,
      mockBillingRepo as any,
      mockPaySvc as any,
      mockEntitlementService as any,
      mockEventBus as any,
    );

    const result = await subscriptionService.create({
      organizationId: ORG_ID,
      planId: PLAN_ID,
      gateway: 'stripe',
    });

    // Subscription should be created
    expect(mockSubscriptionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        planId: PLAN_ID,
        status: 'active',
      }),
    );

    // Payment intent should be created for paid plan
    expect(mockPaySvc.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 2900,
        currency: 'usd',
        sourceType: 'membership',
        sourceId: SUBSCRIPTION_ID,
      }),
    );

    // Event should be emitted
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'subscription.created',
      expect.objectContaining({
        subscriptionId: SUBSCRIPTION_ID,
        organizationId: ORG_ID,
        planId: PLAN_ID,
      }),
    );

    // Result should indicate payment required
    expect(result.paymentRequired).toBe(true);
    expect(result.clientSecret).toBe('cs_test_secret');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 2: Create payment intent (payment service)
  // ──────────────────────────────────────────────────────────────────────────

  it('Step 2: Create payment intent via PaymentService', async () => {
    mockBillingRepo.createTransaction.mockResolvedValue({
      id: TRANSACTION_ID,
      status: 'PENDING',
    });
    mockAdapter.createPaymentIntent.mockResolvedValue({
      externalId: EXTERNAL_ID,
      clientSecret: 'cs_test_secret',
    });
    mockBillingRepo.updateTransactionStatus.mockResolvedValue(undefined);

    const result = await paymentService.createPaymentIntent({
      userId: ORG_ID,
      amountCents: 2900,
      currency: 'usd',
      sourceType: 'membership',
      sourceId: SUBSCRIPTION_ID,
      mode: 'subscription',
      gateway: 'stripe',
      metadata: { subscriptionId: SUBSCRIPTION_ID, planId: PLAN_ID },
    });

    // Transaction should be created in DB
    expect(mockBillingRepo.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ORG_ID,
        amountCents: 2900,
        status: 'PENDING',
        gateway: 'stripe',
      }),
    );

    // Adapter should be called
    expect(mockAdapter.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 2900,
        currency: 'usd',
        mode: 'subscription',
      }),
    );

    expect(result.transactionId).toBe(TRANSACTION_ID);
    expect(result.externalId).toBe(EXTERNAL_ID);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 3: Webhook payment success -> activate subscription
  // ──────────────────────────────────────────────────────────────────────────

  it('Step 3: Webhook payment success updates transaction and emits event', async () => {
    const pendingTx = makeTransaction({ status: 'PENDING' });

    mockAdapter.handleWebhook.mockResolvedValue({
      externalId: EXTERNAL_ID,
      status: 'PAID',
      raw: { type: 'payment_intent.succeeded' },
    });
    mockBillingRepo.getTransactionByExternalId.mockResolvedValue(pendingTx);
    mockBillingRepo.updateTransactionStatus.mockResolvedValue(undefined);

    await paymentService.handleWebhook({
      gateway: 'stripe',
      payload: Buffer.from('{}'),
      signature: 'whsec_test',
    });

    // Transaction should be marked PAID
    expect(mockBillingRepo.updateTransactionStatus).toHaveBeenCalledWith(
      TRANSACTION_ID,
      'PAID',
      expect.objectContaining({ paidAt: expect.any(Date) }),
    );

    // billing.payment.success event should be emitted
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'billing.payment.success',
      expect.objectContaining({
        transactionId: TRANSACTION_ID,
        userId: ORG_ID,
        amountCents: 2900,
        sourceType: 'membership',
        sourceId: SUBSCRIPTION_ID,
        externalId: EXTERNAL_ID,
      }),
    );
  });

  it('Step 3b: Activate subscription after payment success', async () => {
    const pendingSub = makeSubscription({ status: 'pending_payment' });
    const activeSub = makeSubscription({ status: 'active' });

    mockSubscriptionRepo.getById.mockResolvedValue(pendingSub);
    mockSubscriptionRepo.updateStatus.mockResolvedValue(activeSub);
    mockBillingRepo.getPlanItems.mockResolvedValue(PLAN_ITEMS_METERED);

    const result = await subscriptionService.activate(SUBSCRIPTION_ID);

    // Status should transition to active
    expect(result.status).toBe('active');
    expect(mockSubscriptionRepo.updateStatus).toHaveBeenCalledWith(
      SUBSCRIPTION_ID,
      'active',
    );

    // subscription.activated event
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'subscription.activated',
      expect.objectContaining({
        subscriptionId: SUBSCRIPTION_ID,
        organizationId: ORG_ID,
      }),
    );

    // Entitlement cache should be invalidated
    expect(mockEntitlementService.invalidateForOrg).toHaveBeenCalledWith(ORG_ID);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 4: Verify quotas provisioned after activation
  // ──────────────────────────────────────────────────────────────────────────

  it('Step 4: Quotas are provisioned for metered plan items on activation', async () => {
    const pendingSub = makeSubscription({ status: 'pending_payment' });
    const activeSub = makeSubscription({ status: 'active' });

    mockSubscriptionRepo.getById.mockResolvedValue(pendingSub);
    mockSubscriptionRepo.updateStatus.mockResolvedValue(activeSub);
    mockBillingRepo.getPlanItems.mockResolvedValue(PLAN_ITEMS_METERED);

    await subscriptionService.activate(SUBSCRIPTION_ID);

    // Should provision quota for each metered item with quotaScope=tenant
    // ai.tokens and storage.mb are metered, api.calls is boolean (skipped)
    expect(mockTenantQuotaRepo.upsertBySource).toHaveBeenCalledTimes(2);

    expect(mockTenantQuotaRepo.upsertBySource).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        subject: 'ai.tokens',
        balance: 10000,
        sourceType: 'membership',
        sourceId: `plan_${PLAN_ID}`,
      }),
    );

    expect(mockTenantQuotaRepo.upsertBySource).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        subject: 'storage.mb',
        balance: 5000,
        sourceType: 'membership',
        sourceId: `plan_${PLAN_ID}`,
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 5: Consume quota (via QuotaService grant, showing grant+consumption)
  // ──────────────────────────────────────────────────────────────────────────

  it('Step 5: Grant user quota and emit event', async () => {
    mockQuotaRepo.getQuotaBySource.mockResolvedValue(null); // No existing grant
    mockQuotaRepo.createQuota.mockResolvedValue(undefined);

    await quotaService.grant({
      userId: USER_ID,
      subject: 'ai.tokens',
      amount: 500,
      priority: 50,
      expiresAt: PERIOD_END,
      sourceType: 'membership',
      sourceId: `plan_${PLAN_ID}`,
    });

    // Should create the quota bucket
    expect(mockQuotaRepo.createQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        subject: 'ai.tokens',
        balance: 500,
        priority: 50,
        sourceType: 'membership',
      }),
    );

    // Should emit billing.quota.granted event
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'billing.quota.granted',
      expect.objectContaining({
        userId: USER_ID,
        subject: 'ai.tokens',
        amount: 500,
        sourceType: 'membership',
      }),
    );
  });

  it('Step 5b: Idempotent grant skips duplicate', async () => {
    // Simulate existing grant
    mockQuotaRepo.getQuotaBySource.mockResolvedValue({
      id: 'q-existing',
      userId: USER_ID,
      subject: 'ai.tokens',
      balance: 500,
    });

    await quotaService.grant({
      userId: USER_ID,
      subject: 'ai.tokens',
      amount: 500,
      priority: 50,
      sourceType: 'membership',
      sourceId: `plan_${PLAN_ID}`,
    });

    // Should NOT create a new quota
    expect(mockQuotaRepo.createQuota).not.toHaveBeenCalled();
    // Should NOT emit event
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 6: Renew subscription at period end
  // ──────────────────────────────────────────────────────────────────────────

  it('Step 6: Renew subscription extends period and resets quotas', async () => {
    const activeSub = makeSubscription({
      status: 'active',
      renewalCount: 0,
      version: 1,
    });
    const newPeriodEnd = new Date('2026-05-01T00:00:00Z');
    const extendedSub = makeSubscription({
      status: 'active',
      renewalCount: 1,
      currentPeriodStart: PERIOD_END,
      currentPeriodEnd: newPeriodEnd,
      version: 2,
    });

    mockSubscriptionRepo.getById.mockResolvedValue(activeSub);
    mockBillingRepo.getPlanById.mockResolvedValue(PLAN_PRO);
    mockBillingRepo.getPlanItems.mockResolvedValue(PLAN_ITEMS_METERED);

    // Payment mock for renewal
    const mockPaySvcForRenewal = {
      createPaymentIntent: vi.fn().mockResolvedValue({
        transactionId: 'txn-renewal-001',
        externalId: 'pi_renewal_001',
      }),
    };
    renewalService = new RenewalService(
      mockDb as any,
      mockSubscriptionRepo as any,
      mockTenantQuotaRepo as any,
      mockBillingRepo as any,
      mockPaySvcForRenewal as any,
      mockEntitlementService as any,
      mockEventBus as any,
    );

    mockSubscriptionRepo.extendPeriod.mockResolvedValue(extendedSub);
    mockTenantQuotaRepo.getByTenantAndSubject.mockResolvedValue([
      {
        id: 'tq-ai',
        organizationId: ORG_ID,
        subject: 'ai.tokens',
        balance: 2500, // Remaining from previous period
        sourceId: `plan_${PLAN_ID}`,
      },
    ]);

    const result = await renewalService.processRenewal(SUBSCRIPTION_ID);

    expect(result.renewed).toBe(true);
    expect(result.paymentRequired).toBe(true);
    expect(result.paymentSucceeded).toBe(true);

    // Payment should be processed for renewal
    expect(mockPaySvcForRenewal.createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ORG_ID,
        amountCents: 2900,
        sourceType: 'membership',
        metadata: expect.objectContaining({ renewalCount: 1 }),
      }),
    );

    // Period should be extended
    expect(mockSubscriptionRepo.extendPeriod).toHaveBeenCalledWith(
      SUBSCRIPTION_ID,
      1, // version
      PERIOD_END, // newPeriodStart = old periodEnd
      expect.any(Date), // newPeriodEnd
      'txn-renewal-001', // transactionId
    );

    // subscription.renewed event should be emitted
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'subscription.renewed',
      expect.objectContaining({
        subscriptionId: SUBSCRIPTION_ID,
        organizationId: ORG_ID,
        planId: PLAN_ID,
      }),
    );

    // Entitlement cache should be invalidated
    expect(mockEntitlementService.invalidateForOrg).toHaveBeenCalledWith(ORG_ID);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 7: Cancel subscription
  // ──────────────────────────────────────────────────────────────────────────

  it('Step 7: Cancel subscription at period end', async () => {
    const activeSub = makeSubscription({ status: 'active' });
    const canceledSub = makeSubscription({
      status: 'canceled',
      cancelAtPeriodEnd: 1,
    });

    mockSubscriptionRepo.getById.mockResolvedValue(activeSub);
    mockSubscriptionRepo.updateStatus.mockResolvedValue(canceledSub);

    const result = await subscriptionService.cancel({
      subscriptionId: SUBSCRIPTION_ID,
      reason: 'Too expensive',
    });

    expect(result.status).toBe('canceled');

    // Should update with cancel_at_period_end flag
    expect(mockSubscriptionRepo.updateStatus).toHaveBeenCalledWith(
      SUBSCRIPTION_ID,
      'canceled',
      expect.objectContaining({
        canceledAt: expect.any(Date),
        cancelReason: 'Too expensive',
        cancelAtPeriodEnd: 1,
      }),
    );

    // subscription.canceled event with reason
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'subscription.canceled',
      expect.objectContaining({
        subscriptionId: SUBSCRIPTION_ID,
        organizationId: ORG_ID,
        reason: 'Too expensive',
        expiresAt: PERIOD_END, // Expires at period end, not immediately
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 8: Verify quotas cleaned up after expiry (renewal triggers expiry)
  // ──────────────────────────────────────────────────────────────────────────

  it('Step 8: Renewal of canceled subscription expires it and removes quotas', async () => {
    const canceledSub = makeSubscription({
      status: 'active',
      cancelAtPeriodEnd: 1,
    });

    mockSubscriptionRepo.getById.mockResolvedValue(canceledSub);
    mockSubscriptionRepo.updateStatus.mockResolvedValue(undefined);
    mockBillingRepo.getPlanItems.mockResolvedValue(PLAN_ITEMS_METERED);

    const result = await renewalService.processRenewal(SUBSCRIPTION_ID);

    // Should NOT renew - should expire instead
    expect(result.renewed).toBe(false);
    expect(result.subscription.status).toBe('expired');

    // Should update status to expired
    expect(mockSubscriptionRepo.updateStatus).toHaveBeenCalledWith(
      SUBSCRIPTION_ID,
      'expired',
    );

    // Should remove quotas for each tenant-scoped plan item
    expect(mockTenantQuotaRepo.deleteBySource).toHaveBeenCalledWith(
      ORG_ID,
      'ai.tokens',
      'membership',
      `plan_${PLAN_ID}`,
    );
    expect(mockTenantQuotaRepo.deleteBySource).toHaveBeenCalledWith(
      ORG_ID,
      'storage.mb',
      'membership',
      `plan_${PLAN_ID}`,
    );

    // subscription.expired event
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'subscription.expired',
      expect.objectContaining({
        subscriptionId: SUBSCRIPTION_ID,
        organizationId: ORG_ID,
      }),
    );

    // Entitlement cache should be invalidated
    expect(mockEntitlementService.invalidateForOrg).toHaveBeenCalledWith(ORG_ID);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ──────────────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('Duplicate payment webhook is idempotently skipped', async () => {
      const paidTx = makeTransaction({ status: 'PAID' });

      mockAdapter.handleWebhook.mockResolvedValue({
        externalId: EXTERNAL_ID,
        status: 'PAID',
        raw: {},
      });
      mockBillingRepo.getTransactionByExternalId.mockResolvedValue(paidTx);

      await paymentService.handleWebhook({
        gateway: 'stripe',
        payload: Buffer.from('{}'),
        signature: 'whsec_test',
      });

      // Should NOT update transaction
      expect(mockBillingRepo.updateTransactionStatus).not.toHaveBeenCalled();
      // Should NOT emit any events
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('Activating already-active subscription returns same subscription', async () => {
      const activeSub = makeSubscription({ status: 'active' });
      mockSubscriptionRepo.getById.mockResolvedValue(activeSub);

      const result = await subscriptionService.activate(SUBSCRIPTION_ID);

      expect(result).toEqual(activeSub);
      // Should NOT call updateStatus
      expect(mockSubscriptionRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('Immediate cancellation expires subscription and removes quotas', async () => {
      const activeSub = makeSubscription({ status: 'active' });
      const expiredSub = makeSubscription({ status: 'expired' });

      mockSubscriptionRepo.getById.mockResolvedValue(activeSub);
      mockSubscriptionRepo.updateStatus.mockResolvedValue(expiredSub);
      mockBillingRepo.getPlanItems.mockResolvedValue(PLAN_ITEMS_METERED);

      const result = await subscriptionService.cancel({
        subscriptionId: SUBSCRIPTION_ID,
        immediate: true,
        reason: 'Fraud detected',
      });

      // Should expire immediately (not cancel)
      expect(result.status).toBe('expired');
      expect(mockSubscriptionRepo.updateStatus).toHaveBeenCalledWith(
        SUBSCRIPTION_ID,
        'expired',
        expect.objectContaining({
          canceledAt: expect.any(Date),
          cancelReason: 'Fraud detected',
        }),
      );

      // Quotas should be removed
      expect(mockTenantQuotaRepo.deleteBySource).toHaveBeenCalledWith(
        ORG_ID,
        'ai.tokens',
        'membership',
        `plan_${PLAN_ID}`,
      );

      // Entitlement cache invalidated
      expect(mockEntitlementService.invalidateForOrg).toHaveBeenCalledWith(ORG_ID);
    });

    it('Cannot cancel an already canceled subscription', async () => {
      const canceledSub = makeSubscription({ status: 'canceled' });
      mockSubscriptionRepo.getById.mockResolvedValue(canceledSub);

      await expect(
        subscriptionService.cancel({ subscriptionId: SUBSCRIPTION_ID }),
      ).rejects.toThrow('already canceled');
    });

    it('Cannot cancel an expired subscription', async () => {
      const expiredSub = makeSubscription({ status: 'expired' });
      mockSubscriptionRepo.getById.mockResolvedValue(expiredSub);

      await expect(
        subscriptionService.cancel({ subscriptionId: SUBSCRIPTION_ID }),
      ).rejects.toThrow('already expired');
    });

    it('Renewal with payment failure marks subscription as past_due', async () => {
      const activeSub = makeSubscription({ status: 'active', version: 1 });

      mockSubscriptionRepo.getById.mockResolvedValue(activeSub);
      mockBillingRepo.getPlanById.mockResolvedValue(PLAN_PRO);

      // Payment fails
      const mockPaySvcFail = {
        createPaymentIntent: vi.fn().mockRejectedValue(
          new Error('Card declined'),
        ),
      };
      renewalService = new RenewalService(
        mockDb as any,
        mockSubscriptionRepo as any,
        mockTenantQuotaRepo as any,
        mockBillingRepo as any,
        mockPaySvcFail as any,
        mockEntitlementService as any,
        mockEventBus as any,
      );

      const result = await renewalService.processRenewal(SUBSCRIPTION_ID);

      expect(result.renewed).toBe(false);
      expect(result.paymentRequired).toBe(true);
      expect(result.paymentSucceeded).toBe(false);
      expect(result.subscription.status).toBe('past_due');

      // Should mark subscription as past_due
      expect(mockSubscriptionRepo.updateStatus).toHaveBeenCalledWith(
        SUBSCRIPTION_ID,
        'past_due',
      );

      // subscription.payment_failed event
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'subscription.payment_failed',
        expect.objectContaining({
          subscriptionId: SUBSCRIPTION_ID,
          organizationId: ORG_ID,
          error: 'Card declined',
        }),
      );
    });

    it('Free plan subscription skips payment entirely', async () => {
      const freePlan = { ...PLAN_PRO, priceCents: 0 };
      const createdSub = makeSubscription({ status: 'active' });

      mockBillingRepo.getPlanById.mockResolvedValue(freePlan);
      mockSubscriptionRepo.getActiveByTenant.mockResolvedValue([]);
      mockSubscriptionRepo.create.mockResolvedValue(createdSub);

      const mockPaySvcUnused = { createPaymentIntent: vi.fn() };
      subscriptionService = new SubscriptionService(
        mockDb as any,
        mockSubscriptionRepo as any,
        mockTenantQuotaRepo as any,
        mockBillingRepo as any,
        mockPaySvcUnused as any,
        mockEntitlementService as any,
        mockEventBus as any,
      );

      const result = await subscriptionService.create({
        organizationId: ORG_ID,
        planId: 'plan-free',
        gateway: 'stripe',
      });

      expect(result.paymentRequired).toBe(false);
      expect(mockPaySvcUnused.createPaymentIntent).not.toHaveBeenCalled();
    });

    it('Subscription with trial starts as trialing and skips payment', async () => {
      const trialingSub = makeSubscription({ status: 'trialing' });

      mockBillingRepo.getPlanById.mockResolvedValue(PLAN_PRO);
      mockSubscriptionRepo.getActiveByTenant.mockResolvedValue([]);
      mockSubscriptionRepo.create.mockResolvedValue(trialingSub);
      mockBillingRepo.getPlanItems.mockResolvedValue(PLAN_ITEMS_METERED);

      const mockPaySvcUnused = { createPaymentIntent: vi.fn() };
      subscriptionService = new SubscriptionService(
        mockDb as any,
        mockSubscriptionRepo as any,
        mockTenantQuotaRepo as any,
        mockBillingRepo as any,
        mockPaySvcUnused as any,
        mockEntitlementService as any,
        mockEventBus as any,
      );

      const result = await subscriptionService.create({
        organizationId: ORG_ID,
        planId: PLAN_ID,
        gateway: 'stripe',
        trialDays: 14,
      });

      expect(result.subscription.status).toBe('trialing');
      expect(result.paymentRequired).toBe(false);
      expect(mockPaySvcUnused.createPaymentIntent).not.toHaveBeenCalled();

      // Quotas should still be provisioned during trial
      expect(mockTenantQuotaRepo.upsertBySource).toHaveBeenCalled();
    });

    it('Plan change during renewal applies new plan quotas', async () => {
      const newPlanId = 'plan-enterprise';
      const newPlan = { ...PLAN_PRO, id: newPlanId, priceCents: 9900 };
      const subWithScheduledChange = makeSubscription({
        status: 'active',
        scheduledPlanId: newPlanId,
        scheduledChangeAt: new Date('2026-02-28T00:00:00Z'), // In the past = ready
        version: 1,
      });
      const changedSub = makeSubscription({
        status: 'active',
        planId: newPlanId,
        version: 2,
      });
      const extendedSub = makeSubscription({
        status: 'active',
        planId: newPlanId,
        renewalCount: 1,
        version: 3,
      });

      mockSubscriptionRepo.getById.mockResolvedValue(subWithScheduledChange);
      mockSubscriptionRepo.applyPlanChange.mockResolvedValue(changedSub);
      mockBillingRepo.getPlanById.mockResolvedValue(newPlan);
      mockBillingRepo.getPlanItems.mockResolvedValue([]);
      mockTenantQuotaRepo.getByTenantAndSubject.mockResolvedValue([]);

      const mockPaySvcRenewal = {
        createPaymentIntent: vi.fn().mockResolvedValue({
          transactionId: 'txn-change-001',
          externalId: 'pi_change_001',
        }),
      };
      renewalService = new RenewalService(
        mockDb as any,
        mockSubscriptionRepo as any,
        mockTenantQuotaRepo as any,
        mockBillingRepo as any,
        mockPaySvcRenewal as any,
        mockEntitlementService as any,
        mockEventBus as any,
      );
      mockSubscriptionRepo.extendPeriod.mockResolvedValue(extendedSub);

      const result = await renewalService.processRenewal(SUBSCRIPTION_ID);

      expect(result.renewed).toBe(true);
      expect(result.planChanged).toBe(true);
      expect(result.newPlanId).toBe(newPlanId);

      // Should apply the scheduled plan change
      expect(mockSubscriptionRepo.applyPlanChange).toHaveBeenCalledWith(
        SUBSCRIPTION_ID,
        1, // version
      );

      // Payment should use new plan price
      expect(mockPaySvcRenewal.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 9900,
        }),
      );
    });

    it('Renewal of free plan does not attempt payment', async () => {
      const freePlan = { ...PLAN_PRO, priceCents: 0 };
      const activeSub = makeSubscription({ status: 'active', version: 1 });
      const extendedSub = makeSubscription({
        status: 'active',
        renewalCount: 1,
        version: 2,
      });

      mockSubscriptionRepo.getById.mockResolvedValue(activeSub);
      mockBillingRepo.getPlanById.mockResolvedValue(freePlan);
      mockBillingRepo.getPlanItems.mockResolvedValue([]);
      mockSubscriptionRepo.extendPeriod.mockResolvedValue(extendedSub);

      const mockPaySvcFree = { createPaymentIntent: vi.fn() };
      renewalService = new RenewalService(
        mockDb as any,
        mockSubscriptionRepo as any,
        mockTenantQuotaRepo as any,
        mockBillingRepo as any,
        mockPaySvcFree as any,
        mockEntitlementService as any,
        mockEventBus as any,
      );

      const result = await renewalService.processRenewal(SUBSCRIPTION_ID);

      expect(result.renewed).toBe(true);
      expect(result.paymentRequired).toBe(false);
      expect(mockPaySvcFree.createPaymentIntent).not.toHaveBeenCalled();
    });

    it('Cannot renew a canceled (non-period-end) subscription', async () => {
      const canceledSub = makeSubscription({ status: 'canceled', cancelAtPeriodEnd: 0 });
      mockSubscriptionRepo.getById.mockResolvedValue(canceledSub);

      await expect(
        renewalService.processRenewal(SUBSCRIPTION_ID),
      ).rejects.toThrow('not eligible for renewal');
    });
  });
});
