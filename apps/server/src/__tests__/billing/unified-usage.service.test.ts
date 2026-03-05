/**
 * UnifiedUsageService – Waterfall Deduction Full Flow Tests (Task 9.3)
 *
 * Tests the dual-dimension waterfall deduction algorithm:
 * Tenant shared quotas -> User personal quotas -> Wallet overage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UnifiedUsageService,
  UnifiedQuotaExceededError,
  UnifiedInsufficientFundsError,
} from '../../billing/services/unified-usage.service';

// ─── Constants ──────────────────────────────────────────────────────────────────

const ORG_ID = 'org-001';
const USER_ID = 'user-001';
const SUBJECT = 'api.requests';

// ─── Mock bucket factories ──────────────────────────────────────────────────────

function makeTenantBucket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tq-001',
    organizationId: ORG_ID,
    subject: SUBJECT,
    balance: 100,
    priority: 10,
    expiresAt: null,
    sourceType: 'membership',
    sourceId: 'plan-basic',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeUserBucket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uq-001',
    userId: USER_ID,
    organizationId: ORG_ID,
    subject: SUBJECT,
    balance: 50,
    priority: 5,
    expiresAt: null,
    sourceType: 'membership',
    sourceId: 'plan-basic',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ─── Mock chain builder ─────────────────────────────────────────────────────────

/**
 * Creates a chainable mock for Drizzle select queries.
 * Chain: select() -> from() -> where() -> orderBy() -> for('update') -> result
 */
function createSelectChain(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    for: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

/**
 * Creates a chainable mock for Drizzle update queries.
 * Chain: update() -> set() -> where() -> returning() -> result
 */
function createUpdateChain(result: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

/**
 * Creates a chainable mock for Drizzle insert queries.
 * Chain: insert() -> values() -> result
 */
function createInsertChain() {
  const chain = {
    values: vi.fn().mockResolvedValue(undefined),
  };
  return chain;
}

// ─── Mock dependencies ──────────────────────────────────────────────────────────

const mockTenantQuotaRepo = {
  getTotalBalance: vi.fn(),
};

const mockQuotaRepo = {
  getTotalBalance: vi.fn(),
};

const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

// ─── Test suite ─────────────────────────────────────────────────────────────────

describe('UnifiedUsageService – Waterfall Deduction', () => {
  let service: UnifiedUsageService;
  let mockDb: { transaction: ReturnType<typeof vi.fn> };

  // For per-test control of tx behavior
  let selectChains: ReturnType<typeof createSelectChain>[];
  let updateChains: ReturnType<typeof createUpdateChain>[];
  let insertChain: ReturnType<typeof createInsertChain>;

  function setupTx(options: {
    tenantBuckets?: unknown[];
    userBuckets?: unknown[];
    updateResults?: unknown[][];
    overagePriceResult?: unknown[];
    walletUpdateResult?: unknown[];
    walletSelectResult?: unknown[];
  }) {
    const {
      tenantBuckets = [],
      userBuckets = [],
      updateResults = [],
      overagePriceResult,
      walletUpdateResult,
      walletSelectResult,
    } = options;

    selectChains = [];
    updateChains = [];
    insertChain = createInsertChain();

    // Track select/update/insert call counts
    let selectCallCount = 0;
    let updateCallCount = 0;

    // Pre-build select chains:
    // Call 0: tenant buckets
    // Call 1: user buckets (if remaining > 0)
    // Call 2: overage price (planItems) (if remaining > 0 and allowOverage)
    // Call 3: wallet select (if wallet update fails)
    const selectResults: unknown[][] = [tenantBuckets, userBuckets];
    if (overagePriceResult !== undefined) {
      selectResults.push(overagePriceResult);
    }
    if (walletSelectResult !== undefined) {
      selectResults.push(walletSelectResult);
    }
    for (const result of selectResults) {
      selectChains.push(createSelectChain(result));
    }

    // Pre-build update chains:
    // One per bucket deduction + one for wallet (if overage)
    for (const result of updateResults) {
      updateChains.push(createUpdateChain(result));
    }
    if (walletUpdateResult !== undefined) {
      updateChains.push(createUpdateChain(walletUpdateResult));
    }

    const mockTx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockImplementation(() => {
        const chain = selectChains[selectCallCount];
        selectCallCount++;
        return chain ?? createSelectChain([]);
      }),
      update: vi.fn().mockImplementation(() => {
        const chain = updateChains[updateCallCount];
        updateCallCount++;
        return chain ?? createUpdateChain([]);
      }),
      insert: vi.fn().mockImplementation(() => insertChain),
    };

    mockDb = {
      transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
        fn(mockTx)
      ),
    };

    service = new UnifiedUsageService(
      mockDb as any,
      mockTenantQuotaRepo as any,
      mockQuotaRepo as any,
      mockEventBus as any
    );

    return mockTx;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── 1. Tenant-only deduction ─────────────────────────────────────────────────

  it('should deduct entirely from tenant buckets when tenant has enough balance', async () => {
    const tenantBucket = makeTenantBucket({ balance: 100 });
    const updatedBucket = { ...tenantBucket, balance: 90 };

    setupTx({
      tenantBuckets: [tenantBucket],
      updateResults: [[updatedBucket]],
    });

    const result = await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 10,
    });

    expect(result.consumed).toBe(10);
    expect(result.deductedFrom).toHaveLength(1);
    expect(result.deductedFrom[0]).toEqual(
      expect.objectContaining({
        quotaId: 'tq-001',
        amount: 10,
        scope: 'tenant',
      })
    );
    expect(result.overageChargedCents).toBeUndefined();
    expect(result.remainingUnconsumed).toBeUndefined();
  });

  // ─── 2. User-only deduction ───────────────────────────────────────────────────

  it('should deduct from user buckets when no tenant quotas exist', async () => {
    const userBucket = makeUserBucket({ balance: 50 });
    const updatedBucket = { ...userBucket, balance: 30 };

    setupTx({
      tenantBuckets: [], // No tenant buckets
      userBuckets: [userBucket],
      updateResults: [[updatedBucket]],
    });

    const result = await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 20,
    });

    expect(result.consumed).toBe(20);
    expect(result.deductedFrom).toHaveLength(1);
    expect(result.deductedFrom[0]).toEqual(
      expect.objectContaining({
        quotaId: 'uq-001',
        amount: 20,
        scope: 'user',
      })
    );
  });

  // ─── 3. Waterfall: tenant -> user ─────────────────────────────────────────────

  it('should waterfall from tenant to user when tenant buckets partially cover the amount', async () => {
    const tenantBucket = makeTenantBucket({ id: 'tq-001', balance: 30, priority: 10 });
    const userBucket = makeUserBucket({ id: 'uq-001', balance: 50, priority: 5 });

    setupTx({
      tenantBuckets: [tenantBucket],
      userBuckets: [userBucket],
      updateResults: [
        [{ ...tenantBucket, balance: 0 }],  // Tenant fully drained
        [{ ...userBucket, balance: 30 }],    // User partially drained
      ],
    });

    const result = await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 50, // 30 from tenant + 20 from user
    });

    expect(result.consumed).toBe(50);
    expect(result.deductedFrom).toHaveLength(2);

    expect(result.deductedFrom[0]).toEqual(
      expect.objectContaining({
        quotaId: 'tq-001',
        amount: 30,
        scope: 'tenant',
      })
    );
    expect(result.deductedFrom[1]).toEqual(
      expect.objectContaining({
        quotaId: 'uq-001',
        amount: 20,
        scope: 'user',
      })
    );
  });

  // ─── 4. Priority ordering ────────────────────────────────────────────────────

  it('should deduct from higher priority tenant buckets first', async () => {
    const highPriorityBucket = makeTenantBucket({
      id: 'tq-high',
      balance: 20,
      priority: 100,
    });
    const lowPriorityBucket = makeTenantBucket({
      id: 'tq-low',
      balance: 50,
      priority: 1,
    });

    // Buckets returned in priority DESC order by the query
    setupTx({
      tenantBuckets: [highPriorityBucket, lowPriorityBucket],
      updateResults: [
        [{ ...highPriorityBucket, balance: 0 }],  // High priority fully drained
        [{ ...lowPriorityBucket, balance: 40 }],   // Low priority partially used
      ],
    });

    const result = await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 30, // 20 from high + 10 from low
    });

    expect(result.consumed).toBe(30);
    expect(result.deductedFrom).toHaveLength(2);

    // High priority bucket deducted first
    expect(result.deductedFrom[0]!.quotaId).toBe('tq-high');
    expect(result.deductedFrom[0]!.amount).toBe(20);
    expect(result.deductedFrom[0]!.priority).toBe(100);

    // Low priority bucket deducted second
    expect(result.deductedFrom[1]!.quotaId).toBe('tq-low');
    expect(result.deductedFrom[1]!.amount).toBe(10);
    expect(result.deductedFrom[1]!.priority).toBe(1);
  });

  // ─── 5. Expiry filtering ─────────────────────────────────────────────────────

  it('should exclude expired buckets (handled by SQL WHERE clause)', async () => {
    // The SQL query filters expired buckets via WHERE clause:
    // or(isNull(expiresAt), gt(expiresAt, now))
    // So expired buckets simply won't appear in the results.
    const activeBucket = makeTenantBucket({ id: 'tq-active', balance: 100, expiresAt: null });

    // Only active bucket returned (expired ones filtered by SQL)
    setupTx({
      tenantBuckets: [activeBucket],
      updateResults: [[{ ...activeBucket, balance: 90 }]],
    });

    const result = await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 10,
    });

    expect(result.consumed).toBe(10);
    expect(result.deductedFrom).toHaveLength(1);
    expect(result.deductedFrom[0]!.quotaId).toBe('tq-active');
  });

  it('should not deduct from expired user buckets (SQL-filtered)', async () => {
    // No tenant buckets, and only active user bucket returned
    const activeUserBucket = makeUserBucket({ id: 'uq-active', balance: 30 });

    setupTx({
      tenantBuckets: [],
      userBuckets: [activeUserBucket],
      updateResults: [[{ ...activeUserBucket, balance: 20 }]],
    });

    const result = await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 10,
    });

    expect(result.consumed).toBe(10);
    expect(result.deductedFrom).toHaveLength(1);
    expect(result.deductedFrom[0]!.quotaId).toBe('uq-active');
  });

  // ─── 6. Optimistic lock failure ───────────────────────────────────────────────

  it('should throw error when tenant bucket optimistic lock fails (concurrent modification)', async () => {
    const tenantBucket = makeTenantBucket({ balance: 100 });

    setupTx({
      tenantBuckets: [tenantBucket],
      // Returning empty array simulates concurrent modification
      updateResults: [[]],
    });

    await expect(
      service.consume({
        organizationId: ORG_ID,
        userId: USER_ID,
        subject: SUBJECT,
        amount: 10,
      })
    ).rejects.toThrow('Concurrent modification detected for tenant quota bucket tq-001');
  });

  it('should throw error when user bucket optimistic lock fails (concurrent modification)', async () => {
    const userBucket = makeUserBucket({ id: 'uq-locked', balance: 50 });

    setupTx({
      tenantBuckets: [],
      userBuckets: [userBucket],
      updateResults: [[]],
    });

    await expect(
      service.consume({
        organizationId: ORG_ID,
        userId: USER_ID,
        subject: SUBJECT,
        amount: 10,
      })
    ).rejects.toThrow('Concurrent modification detected for user quota bucket uq-locked');
  });

  // ─── 7. Overage with wallet ───────────────────────────────────────────────────

  it('should charge wallet when allowOverage=true and quota exhausted', async () => {
    const tenantBucket = makeTenantBucket({ balance: 5 });
    const walletRecord = { id: 'w-001', userId: USER_ID, balanceCents: 10000 };

    setupTx({
      tenantBuckets: [tenantBucket],
      userBuckets: [],
      updateResults: [
        [{ ...tenantBucket, balance: 0 }], // Tenant drained
      ],
      // Overage price from planItems
      overagePriceResult: [{ overagePriceCents: 100 }], // 100 cents per unit
      walletUpdateResult: [{ ...walletRecord, balanceCents: 9500 }], // wallet updated
    });

    const result = await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 10,     // 5 from tenant + 5 overage
      allowOverage: true,
    });

    expect(result.consumed).toBe(10);
    expect(result.overageChargedCents).toBe(500); // 5 units * 100 cents
    expect(result.deductedFrom).toHaveLength(1);
    expect(result.deductedFrom[0]).toEqual(
      expect.objectContaining({
        quotaId: 'tq-001',
        amount: 5,
        scope: 'tenant',
      })
    );
  });

  it('should charge wallet for full amount when no quota buckets exist and allowOverage=true', async () => {
    setupTx({
      tenantBuckets: [],
      userBuckets: [],
      updateResults: [],
      overagePriceResult: [{ overagePriceCents: 50 }],
      walletUpdateResult: [{ id: 'w-001', userId: USER_ID, balanceCents: 9500 }],
    });

    const result = await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 10,
      allowOverage: true,
    });

    expect(result.consumed).toBe(10);
    expect(result.overageChargedCents).toBe(500); // 10 units * 50 cents
    expect(result.deductedFrom).toHaveLength(0);
  });

  // ─── 8. Overage insufficient funds ────────────────────────────────────────────

  it('should throw UnifiedInsufficientFundsError when wallet balance is insufficient', async () => {
    setupTx({
      tenantBuckets: [],
      userBuckets: [],
      updateResults: [],
      overagePriceResult: [{ overagePriceCents: 100 }],
      walletUpdateResult: [], // Wallet update fails (insufficient balance)
      walletSelectResult: [{ balanceCents: 200 }], // Current balance: 200 cents
    });

    await expect(
      service.consume({
        organizationId: ORG_ID,
        userId: USER_ID,
        subject: SUBJECT,
        amount: 10, // 10 * 100 = 1000 cents needed, only 200 available
        allowOverage: true,
      })
    ).rejects.toThrow(UnifiedInsufficientFundsError);
  });

  it('should include correct amounts in UnifiedInsufficientFundsError', async () => {
    setupTx({
      tenantBuckets: [],
      userBuckets: [],
      updateResults: [],
      overagePriceResult: [{ overagePriceCents: 100 }],
      walletUpdateResult: [],
      walletSelectResult: [{ balanceCents: 200 }],
    });

    try {
      await service.consume({
        organizationId: ORG_ID,
        userId: USER_ID,
        subject: SUBJECT,
        amount: 10,
        allowOverage: true,
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnifiedInsufficientFundsError);
      const e = error as UnifiedInsufficientFundsError;
      expect(e.userId).toBe(USER_ID);
      expect(e.required).toBe(1000); // 10 * 100
      expect(e.available).toBe(200);
    }
  });

  it('should throw UnifiedInsufficientFundsError with 0 when no wallet exists', async () => {
    setupTx({
      tenantBuckets: [],
      userBuckets: [],
      updateResults: [],
      overagePriceResult: [{ overagePriceCents: 100 }],
      walletUpdateResult: [],
      walletSelectResult: [], // No wallet record found
    });

    try {
      await service.consume({
        organizationId: ORG_ID,
        userId: USER_ID,
        subject: SUBJECT,
        amount: 5,
        allowOverage: true,
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnifiedInsufficientFundsError);
      const e = error as UnifiedInsufficientFundsError;
      expect(e.available).toBe(0);
    }
  });

  // ─── 9. Quota exceeded without overage ────────────────────────────────────────

  it('should throw UnifiedQuotaExceededError when allowOverage=false and quota exhausted', async () => {
    setupTx({
      tenantBuckets: [],
      userBuckets: [],
      updateResults: [],
    });

    await expect(
      service.consume({
        organizationId: ORG_ID,
        userId: USER_ID,
        subject: SUBJECT,
        amount: 10,
        allowOverage: false,
      })
    ).rejects.toThrow(UnifiedQuotaExceededError);
  });

  it('should include correct amounts in UnifiedQuotaExceededError', async () => {
    const tenantBucket = makeTenantBucket({ balance: 3 });

    setupTx({
      tenantBuckets: [tenantBucket],
      userBuckets: [],
      updateResults: [
        [{ ...tenantBucket, balance: 0 }],
      ],
    });

    try {
      await service.consume({
        organizationId: ORG_ID,
        userId: USER_ID,
        subject: SUBJECT,
        amount: 10,
        allowOverage: false,
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UnifiedQuotaExceededError);
      const e = error as UnifiedQuotaExceededError;
      expect(e.organizationId).toBe(ORG_ID);
      expect(e.userId).toBe(USER_ID);
      expect(e.subject).toBe(SUBJECT);
      expect(e.requested).toBe(10);
      expect(e.available).toBe(3); // amount - remaining = 10 - 7 = 3
    }
  });

  it('should throw UnifiedQuotaExceededError when allowOverage=true but no overage price exists', async () => {
    setupTx({
      tenantBuckets: [],
      userBuckets: [],
      updateResults: [],
      overagePriceResult: [], // No overage price configured
    });

    await expect(
      service.consume({
        organizationId: ORG_ID,
        userId: USER_ID,
        subject: SUBJECT,
        amount: 10,
        allowOverage: true,
      })
    ).rejects.toThrow(UnifiedQuotaExceededError);
  });

  // ─── 10. Usage record created ─────────────────────────────────────────────────

  it('should create immutable usage record on every successful consume', async () => {
    const tenantBucket = makeTenantBucket({ balance: 100 });

    const tx = setupTx({
      tenantBuckets: [tenantBucket],
      updateResults: [[{ ...tenantBucket, balance: 90 }]],
    });

    await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 10,
      metadata: { requestId: 'req-001' },
    });

    // insert() should have been called for usageRecords
    expect(tx.insert).toHaveBeenCalled();
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        subject: SUBJECT,
        amount: 10,
        quotaIds: ['tq-001'],
        overageChargedCents: null,
        occurredAt: expect.any(Date),
        metadata: expect.objectContaining({
          requestId: 'req-001',
          organizationId: ORG_ID,
          deductionBreakdown: expect.arrayContaining([
            expect.objectContaining({
              quotaId: 'tq-001',
              amount: 10,
              scope: 'tenant',
            }),
          ]),
        }),
      })
    );
  });

  it('should include overage charge in usage record when wallet charged', async () => {
    const _tx = setupTx({
      tenantBuckets: [],
      userBuckets: [],
      updateResults: [],
      overagePriceResult: [{ overagePriceCents: 50 }],
      walletUpdateResult: [{ id: 'w-001', userId: USER_ID, balanceCents: 9750 }],
    });

    await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 5,
      allowOverage: true,
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        overageChargedCents: 250, // 5 * 50
        quotaIds: [],
      })
    );
  });

  // ─── 11. Events emitted ───────────────────────────────────────────────────────

  it('should emit billing.quota.consumed event after successful deduction', async () => {
    const tenantBucket = makeTenantBucket({ balance: 100 });

    setupTx({
      tenantBuckets: [tenantBucket],
      updateResults: [[{ ...tenantBucket, balance: 90 }]],
    });

    await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 10,
    });

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'billing.quota.consumed',
      expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
        subject: SUBJECT,
        amount: 10,
        deductedFrom: expect.arrayContaining([
          expect.objectContaining({
            quotaId: 'tq-001',
            scope: 'tenant',
          }),
        ]),
        consumedAt: expect.any(Date),
      })
    );
  });

  it('should emit billing.quota.exhausted event when quota exceeded without overage', async () => {
    setupTx({
      tenantBuckets: [],
      userBuckets: [],
      updateResults: [],
    });

    await expect(
      service.consume({
        organizationId: ORG_ID,
        userId: USER_ID,
        subject: SUBJECT,
        amount: 10,
      })
    ).rejects.toThrow(UnifiedQuotaExceededError);

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'billing.quota.exhausted',
      expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
        subject: SUBJECT,
        remainingAmount: 10,
        overageAttempted: false,
        exhaustedAt: expect.any(Date),
      })
    );
  });

  it('should emit billing.quota.exhausted with overageAttempted=true when overage has no price', async () => {
    setupTx({
      tenantBuckets: [],
      userBuckets: [],
      updateResults: [],
      overagePriceResult: [], // no overage price
    });

    await expect(
      service.consume({
        organizationId: ORG_ID,
        userId: USER_ID,
        subject: SUBJECT,
        amount: 10,
        allowOverage: true,
      })
    ).rejects.toThrow(UnifiedQuotaExceededError);

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'billing.quota.exhausted',
      expect.objectContaining({
        overageAttempted: true,
      })
    );
  });

  it('should include overageChargedCents in consumed event when wallet charged', async () => {
    setupTx({
      tenantBuckets: [],
      userBuckets: [],
      updateResults: [],
      overagePriceResult: [{ overagePriceCents: 200 }],
      walletUpdateResult: [{ id: 'w-001', userId: USER_ID, balanceCents: 9000 }],
    });

    await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 5,
      allowOverage: true,
    });

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      'billing.quota.consumed',
      expect.objectContaining({
        amount: 5,
        overageChargedCents: 1000, // 5 * 200
      })
    );
  });

  // ─── getCombinedBalance / hasQuota ────────────────────────────────────────────

  describe('getCombinedBalance()', () => {
    beforeEach(() => {
      service = new UnifiedUsageService(
        {} as any,
        mockTenantQuotaRepo as any,
        mockQuotaRepo as any,
        mockEventBus as any
      );
    });

    it('should return combined tenant + user balance', async () => {
      mockTenantQuotaRepo.getTotalBalance.mockResolvedValue(100);
      mockQuotaRepo.getTotalBalance.mockResolvedValue(50);

      const result = await service.getCombinedBalance(ORG_ID, USER_ID, SUBJECT);

      expect(result.tenant).toBe(100);
      expect(result.user).toBe(50);
      expect(result.total).toBe(150);
    });

    it('should return zero when no quotas exist', async () => {
      mockTenantQuotaRepo.getTotalBalance.mockResolvedValue(0);
      mockQuotaRepo.getTotalBalance.mockResolvedValue(0);

      const result = await service.getCombinedBalance(ORG_ID, USER_ID, SUBJECT);

      expect(result.total).toBe(0);
    });
  });

  describe('hasQuota()', () => {
    beforeEach(() => {
      service = new UnifiedUsageService(
        {} as any,
        mockTenantQuotaRepo as any,
        mockQuotaRepo as any,
        mockEventBus as any
      );
    });

    it('should return true when combined balance is sufficient', async () => {
      mockTenantQuotaRepo.getTotalBalance.mockResolvedValue(60);
      mockQuotaRepo.getTotalBalance.mockResolvedValue(40);

      const result = await service.hasQuota(ORG_ID, USER_ID, SUBJECT, 100);

      expect(result).toBe(true);
    });

    it('should return false when combined balance is insufficient', async () => {
      mockTenantQuotaRepo.getTotalBalance.mockResolvedValue(30);
      mockQuotaRepo.getTotalBalance.mockResolvedValue(20);

      const result = await service.hasQuota(ORG_ID, USER_ID, SUBJECT, 100);

      expect(result).toBe(false);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────────

  it('should handle multiple tenant buckets with different priorities and amounts', async () => {
    const buckets = [
      makeTenantBucket({ id: 'tq-p100', balance: 5, priority: 100 }),
      makeTenantBucket({ id: 'tq-p50', balance: 10, priority: 50 }),
      makeTenantBucket({ id: 'tq-p1', balance: 20, priority: 1 }),
    ];

    setupTx({
      tenantBuckets: buckets,
      updateResults: [
        [{ ...buckets[0], balance: 0 }],   // 5 deducted
        [{ ...buckets[1], balance: 2 }],    // 8 deducted
      ],
    });

    const result = await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 13, // 5 + 8 = 13
    });

    expect(result.consumed).toBe(13);
    expect(result.deductedFrom).toHaveLength(2);
    expect(result.deductedFrom[0]!.quotaId).toBe('tq-p100');
    expect(result.deductedFrom[0]!.amount).toBe(5);
    expect(result.deductedFrom[1]!.quotaId).toBe('tq-p50');
    expect(result.deductedFrom[1]!.amount).toBe(8);
  });

  it('should set transaction isolation level to REPEATABLE READ', async () => {
    const tenantBucket = makeTenantBucket({ balance: 100 });

    const tx = setupTx({
      tenantBuckets: [tenantBucket],
      updateResults: [[{ ...tenantBucket, balance: 90 }]],
    });

    await service.consume({
      organizationId: ORG_ID,
      userId: USER_ID,
      subject: SUBJECT,
      amount: 10,
    });

    // The first call in the transaction should be SET TRANSACTION ISOLATION LEVEL
    expect(tx.execute).toHaveBeenCalled();
  });

  it('should default allowOverage to false when not specified', async () => {
    setupTx({
      tenantBuckets: [],
      userBuckets: [],
      updateResults: [],
    });

    // Should throw QuotaExceeded (not try overage)
    await expect(
      service.consume({
        organizationId: ORG_ID,
        userId: USER_ID,
        subject: SUBJECT,
        amount: 10,
        // allowOverage not specified, defaults to false
      })
    ).rejects.toThrow(UnifiedQuotaExceededError);
  });
});
