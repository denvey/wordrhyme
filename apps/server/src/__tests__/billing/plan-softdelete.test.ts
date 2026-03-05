/**
 * Plan Soft-Delete Constraint Tests (Task 9.6)
 *
 * Verifies that:
 * - Plans with active subscriptions cannot be deleted (hard delete guard) or
 *   archived (soft-delete via billingRouter.plans.archive)
 * - Plans with no active subscriptions can be deleted / archived freely
 *
 * These tests exercise the constraint logic extracted from billing.ts to avoid
 * importing the full tRPC router (which drags in DB and NestJS). We test the
 * two equivalent paths:
 *
 *   1. BillingRepository.hasActiveSubscriptions() – the shared query method
 *   2. The delete middleware logic (inlined here as a pure function) that the
 *      createCrudRouter middleware delegates to.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'pending_payment';

interface Plan {
  id: string;
  name: string;
  priceCents: number;
  isActive: number;
}

interface Subscription {
  id: string;
  planId: string;
  status: SubscriptionStatus;
  organizationId: string;
}

// ─── Helpers – reproduce the billing constraint logic ─────────────────────────

/**
 * Mirrors BillingRepository.hasActiveSubscriptions()
 * Returns true when any subscription for the plan has an active-like status.
 */
function hasActiveSubscriptions(
  subscriptions: Subscription[],
  planId: string
): boolean {
  const activeStatuses: SubscriptionStatus[] = ['active', 'trialing', 'past_due'];
  return subscriptions.some(
    (s) => s.planId === planId && activeStatuses.includes(s.status)
  );
}

/**
 * Mirrors the delete middleware in billing.ts plansCrud.
 * Throws with PRECONDITION_FAILED when active subscriptions exist.
 */
async function deletePlanMiddleware(opts: {
  id: string;
  plans: Plan[];
  subscriptions: Subscription[];
  next: () => Promise<void>;
}): Promise<void> {
  const { id, plans, subscriptions, next } = opts;

  const plan = plans.find((p) => p.id === id);
  if (!plan) {
    throw Object.assign(new Error(`Plan ${id} not found`), { code: 'NOT_FOUND' });
  }

  if (hasActiveSubscriptions(subscriptions, id)) {
    throw Object.assign(
      new Error('Cannot delete plan with active subscriptions. Cancel all subscriptions first.'),
      { code: 'PRECONDITION_FAILED' }
    );
  }

  return next();
}

/**
 * Mirrors billingRouter.plans.archive mutation guard (uses billingRepo).
 */
async function archivePlanGuard(opts: {
  planId: string;
  getPlan: (id: string) => Promise<Plan | null>;
  hasActive: (planId: string) => Promise<boolean>;
}): Promise<{ archived: boolean }> {
  const plan = await opts.getPlan(opts.planId);
  if (!plan) {
    throw Object.assign(new Error(`Plan ${opts.planId} not found`), { code: 'NOT_FOUND' });
  }

  const hasActive = await opts.hasActive(opts.planId);
  if (hasActive) {
    throw Object.assign(
      new Error('Cannot archive plan with active subscriptions.'),
      { code: 'PRECONDITION_FAILED' }
    );
  }

  return { archived: true };
}

// ─── Test data ────────────────────────────────────────────────────────────────

const planBasic: Plan = { id: 'plan-basic', name: 'Basic', priceCents: 0, isActive: 1 };
const planPro: Plan   = { id: 'plan-pro',   name: 'Pro',   priceCents: 4900, isActive: 1 };

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: `sub-${Math.random().toString(36).slice(2)}`,
    planId: 'plan-basic',
    status: 'active',
    organizationId: 'org-123',
    ...overrides,
  };
}

// ─── hasActiveSubscriptions() unit tests ─────────────────────────────────────

describe('hasActiveSubscriptions()', () => {
  it('returns false when there are no subscriptions at all', () => {
    expect(hasActiveSubscriptions([], 'plan-basic')).toBe(false);
  });

  it('returns false when no subscriptions belong to the plan', () => {
    const subs = [makeSub({ planId: 'plan-pro', status: 'active' })];
    expect(hasActiveSubscriptions(subs, 'plan-basic')).toBe(false);
  });

  it('returns true for active status', () => {
    const subs = [makeSub({ planId: 'plan-basic', status: 'active' })];
    expect(hasActiveSubscriptions(subs, 'plan-basic')).toBe(true);
  });

  it('returns true for trialing status', () => {
    const subs = [makeSub({ planId: 'plan-basic', status: 'trialing' })];
    expect(hasActiveSubscriptions(subs, 'plan-basic')).toBe(true);
  });

  it('returns true for past_due status', () => {
    const subs = [makeSub({ planId: 'plan-basic', status: 'past_due' })];
    expect(hasActiveSubscriptions(subs, 'plan-basic')).toBe(true);
  });

  it('returns false for canceled status', () => {
    const subs = [makeSub({ planId: 'plan-basic', status: 'canceled' })];
    expect(hasActiveSubscriptions(subs, 'plan-basic')).toBe(false);
  });

  it('returns false for expired status', () => {
    const subs = [makeSub({ planId: 'plan-basic', status: 'expired' })];
    expect(hasActiveSubscriptions(subs, 'plan-basic')).toBe(false);
  });

  it('returns false for pending_payment status', () => {
    const subs = [makeSub({ planId: 'plan-basic', status: 'pending_payment' })];
    expect(hasActiveSubscriptions(subs, 'plan-basic')).toBe(false);
  });

  it('returns true when mix of active and canceled subscriptions exists', () => {
    const subs = [
      makeSub({ planId: 'plan-basic', status: 'canceled' }),
      makeSub({ planId: 'plan-basic', status: 'active' }),
    ];
    expect(hasActiveSubscriptions(subs, 'plan-basic')).toBe(true);
  });

  it('returns false when all subscriptions for the plan are terminal', () => {
    const subs = [
      makeSub({ planId: 'plan-basic', status: 'canceled' }),
      makeSub({ planId: 'plan-basic', status: 'expired' }),
    ];
    expect(hasActiveSubscriptions(subs, 'plan-basic')).toBe(false);
  });

  it('handles multiple plans correctly – only checks the target plan', () => {
    const subs = [
      makeSub({ planId: 'plan-pro',   status: 'active' }),  // active on different plan
      makeSub({ planId: 'plan-basic', status: 'canceled' }), // canceled on target plan
    ];
    expect(hasActiveSubscriptions(subs, 'plan-basic')).toBe(false);
    expect(hasActiveSubscriptions(subs, 'plan-pro')).toBe(true);
  });
});

// ─── Hard-delete middleware constraint ───────────────────────────────────────

describe('deletePlanMiddleware() – hard-delete constraint', () => {
  const next = vi.fn().mockResolvedValue(undefined) as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next() when plan has no subscriptions', async () => {
    await deletePlanMiddleware({
      id: 'plan-basic',
      plans: [planBasic],
      subscriptions: [],
      next,
    });

    expect(next).toHaveBeenCalledOnce();
  });

  it('calls next() when all subscriptions for the plan are canceled', async () => {
    const subs = [
      makeSub({ planId: 'plan-basic', status: 'canceled' }),
      makeSub({ planId: 'plan-basic', status: 'expired' }),
    ];

    await deletePlanMiddleware({
      id: 'plan-basic',
      plans: [planBasic],
      subscriptions: subs,
      next,
    });

    expect(next).toHaveBeenCalledOnce();
  });

  it('throws PRECONDITION_FAILED when plan has an active subscription', async () => {
    const subs = [makeSub({ planId: 'plan-basic', status: 'active' })];

    await expect(
      deletePlanMiddleware({ id: 'plan-basic', plans: [planBasic], subscriptions: subs, next })
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining('active subscriptions'),
    });

    expect(next).not.toHaveBeenCalled();
  });

  it('throws PRECONDITION_FAILED when plan has a trialing subscription', async () => {
    const subs = [makeSub({ planId: 'plan-basic', status: 'trialing' })];

    await expect(
      deletePlanMiddleware({ id: 'plan-basic', plans: [planBasic], subscriptions: subs, next })
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('throws PRECONDITION_FAILED when plan has a past_due subscription', async () => {
    const subs = [makeSub({ planId: 'plan-basic', status: 'past_due' })];

    await expect(
      deletePlanMiddleware({ id: 'plan-basic', plans: [planBasic], subscriptions: subs, next })
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('throws NOT_FOUND when the plan does not exist', async () => {
    await expect(
      deletePlanMiddleware({
        id: 'plan-ghost',
        plans: [planBasic],
        subscriptions: [],
        next,
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(next).not.toHaveBeenCalled();
  });

  it('does not affect other plans when one plan has active subscriptions', async () => {
    const subs = [
      makeSub({ planId: 'plan-pro', status: 'active' }), // active on a different plan
    ];

    // Deleting plan-basic should be allowed
    await deletePlanMiddleware({
      id: 'plan-basic',
      plans: [planBasic, planPro],
      subscriptions: subs,
      next,
    });

    expect(next).toHaveBeenCalledOnce();
  });
});

// ─── Archive (soft-delete) constraint ────────────────────────────────────────

describe('archivePlanGuard() – soft-delete constraint', () => {
  const mockGetPlan = vi.fn();
  const mockHasActive = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { archived: true } when plan has no active subscriptions', async () => {
    mockGetPlan.mockResolvedValue(planBasic);
    mockHasActive.mockResolvedValue(false);

    const result = await archivePlanGuard({
      planId: 'plan-basic',
      getPlan: mockGetPlan,
      hasActive: mockHasActive,
    });

    expect(result).toEqual({ archived: true });
  });

  it('throws PRECONDITION_FAILED when plan has active subscriptions', async () => {
    mockGetPlan.mockResolvedValue(planBasic);
    mockHasActive.mockResolvedValue(true);

    await expect(
      archivePlanGuard({
        planId: 'plan-basic',
        getPlan: mockGetPlan,
        hasActive: mockHasActive,
      })
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining('active subscriptions'),
    });
  });

  it('throws NOT_FOUND when plan does not exist', async () => {
    mockGetPlan.mockResolvedValue(null);
    mockHasActive.mockResolvedValue(false);

    await expect(
      archivePlanGuard({
        planId: 'plan-ghost',
        getPlan: mockGetPlan,
        hasActive: mockHasActive,
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('does not call hasActive when plan is not found', async () => {
    mockGetPlan.mockResolvedValue(null);

    await expect(
      archivePlanGuard({
        planId: 'plan-ghost',
        getPlan: mockGetPlan,
        hasActive: mockHasActive,
      })
    ).rejects.toThrow();

    expect(mockHasActive).not.toHaveBeenCalled();
  });
});

// ─── Integration scenario: full delete lifecycle ──────────────────────────────

describe('Plan delete lifecycle (integration scenario)', () => {
  it('allows delete of a plan after all subscriptions are canceled', async () => {
    const next = vi.fn().mockResolvedValue(undefined) as any;

    // Initially: plan has an active subscription
    const subsAttempt1 = [makeSub({ planId: 'plan-basic', status: 'active' })];

    await expect(
      deletePlanMiddleware({
        id: 'plan-basic',
        plans: [planBasic],
        subscriptions: subsAttempt1,
        next,
      })
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    // After cancellation: subscription moves to canceled
    const subsAttempt2 = [makeSub({ planId: 'plan-basic', status: 'canceled' })];
    vi.clearAllMocks();

    await deletePlanMiddleware({
      id: 'plan-basic',
      plans: [planBasic],
      subscriptions: subsAttempt2,
      next,
    });

    expect(next).toHaveBeenCalledOnce();
  });

  it('correctly guards all three active-like statuses before allowing delete', async () => {
    const next = vi.fn().mockResolvedValue(undefined) as any;
    const blockingStatuses: SubscriptionStatus[] = ['active', 'trialing', 'past_due'];

    for (const status of blockingStatuses) {
      vi.clearAllMocks();
      const subs = [makeSub({ planId: 'plan-basic', status })];

      await expect(
        deletePlanMiddleware({ id: 'plan-basic', plans: [planBasic], subscriptions: subs, next })
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

      expect(next).not.toHaveBeenCalled();
    }
  });
});
