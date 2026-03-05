/**
 * EntitlementService Integration Tests
 *
 * Tests for the entitlement facade that orchestrates:
 * 1. Subscription activate → entitlement load → consume → verify flow
 * 2. Plan change → entitlement reload → new quota
 * 3. Subscription expire → entitlement invalid → consume rejected
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EntitlementService,
  EntitlementDeniedError,
} from '../../billing/services/entitlement.service.js';
import { UnifiedQuotaExceededError } from '../../billing/services/unified-usage.service.js';

// ============================================================================
// Mock factories
// ============================================================================

const createMockBillingRepo = () => ({
  getCapabilityBySubject: vi.fn(),
  hasBooleanEntitlement: vi.fn(),
  getPlanById: vi.fn(),
  getPlanItems: vi.fn(),
  seedCoreCapabilities: vi.fn(),
  upsertCapability: vi.fn(),
  listCapabilities: vi.fn(),
  updateCapabilityStatus: vi.fn(),
  isCapabilityReferencedByPlanItem: vi.fn(),
  deleteCapability: vi.fn(),
  registerPluginCapability: vi.fn(),
  createPlanItem: vi.fn(),
  updatePlanItem: vi.fn(),
  deletePlanItem: vi.fn(),
  createPlan: vi.fn(),
  getActivePlans: vi.fn(),
  getAllPlans: vi.fn(),
  updatePlan: vi.fn(),
  softDeletePlan: vi.fn(),
  hasActiveSubscriptions: vi.fn(),
  getPlanWithItems: vi.fn(),
  createTransaction: vi.fn(),
  getTransactionById: vi.fn(),
  getTransactionByExternalId: vi.fn(),
  updateTransactionStatus: vi.fn(),
  getUserTransactions: vi.fn(),
  getTransactionsBySource: vi.fn(),
});

const createMockTenantQuotaRepo = () => ({
  getTotalBalance: vi.fn(),
  getActiveForDeduction: vi.fn(),
  upsertBySource: vi.fn(),
  deleteBySource: vi.fn(),
  create: vi.fn(),
  getByTenant: vi.fn(),
  getByTenantAndSubject: vi.fn(),
  getActiveForDeductionWithLock: vi.fn(),
  deduct: vi.fn(),
  deleteByTenantAndSubject: vi.fn(),
  getQuotaSummary: vi.fn(),
});

const createMockUnifiedUsage = () => ({
  consume: vi.fn(),
  getCombinedBalance: vi.fn(),
  hasQuota: vi.fn(),
});

const createMockEventBus = () => ({
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
});

// ============================================================================
// Test suite
// ============================================================================

describe('EntitlementService', () => {
  let service: EntitlementService;
  let billingRepo: ReturnType<typeof createMockBillingRepo>;
  let tenantQuotaRepo: ReturnType<typeof createMockTenantQuotaRepo>;
  let unifiedUsage: ReturnType<typeof createMockUnifiedUsage>;
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    vi.clearAllMocks();
    billingRepo = createMockBillingRepo();
    tenantQuotaRepo = createMockTenantQuotaRepo();
    unifiedUsage = createMockUnifiedUsage();
    eventBus = createMockEventBus();

    service = new EntitlementService(
      billingRepo as any,
      tenantQuotaRepo as any,
      unifiedUsage as any,
      eventBus as any
    );
  });

  // ==========================================================================
  // 5.5.2: requireAccess (boolean type)
  // ==========================================================================

  describe('requireAccess()', () => {
    it('should grant access for boolean capability with active subscription', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.advancedEditor',
        type: 'boolean',
        status: 'approved',
      });
      billingRepo.hasBooleanEntitlement.mockResolvedValue(true);

      await expect(
        service.requireAccess('org-1', 'core.advancedEditor')
      ).resolves.toBeUndefined();

      expect(billingRepo.hasBooleanEntitlement).toHaveBeenCalledWith(
        'org-1',
        'core.advancedEditor'
      );
    });

    it('should deny access for boolean capability without active subscription', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.advancedEditor',
        type: 'boolean',
        status: 'approved',
      });
      billingRepo.hasBooleanEntitlement.mockResolvedValue(false);

      await expect(
        service.requireAccess('org-1', 'core.advancedEditor')
      ).rejects.toThrow(EntitlementDeniedError);
    });

    it('should deny access for unapproved capability', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'plugin.beta',
        type: 'boolean',
        status: 'pending',
      });

      await expect(
        service.requireAccess('org-1', 'plugin.beta')
      ).rejects.toThrow(EntitlementDeniedError);
    });

    it('should deny access for unknown capability', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue(undefined);

      await expect(
        service.requireAccess('org-1', 'nonexistent')
      ).rejects.toThrow(EntitlementDeniedError);
    });

    it('should grant access for metered capability with positive balance', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.storage',
        type: 'metered',
        status: 'approved',
      });
      tenantQuotaRepo.getTotalBalance.mockResolvedValue(500);

      await expect(
        service.requireAccess('org-1', 'core.storage')
      ).resolves.toBeUndefined();
    });

    it('should deny access for metered capability with zero balance', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.storage',
        type: 'metered',
        status: 'approved',
      });
      tenantQuotaRepo.getTotalBalance.mockResolvedValue(0);

      await expect(
        service.requireAccess('org-1', 'core.storage')
      ).rejects.toThrow(EntitlementDeniedError);
    });
  });

  // ==========================================================================
  // 5.5.3: requireAndConsume (metered type)
  // ==========================================================================

  describe('requireAndConsume()', () => {
    it('should consume metered quota via waterfall deduction', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.apiCalls',
        type: 'metered',
        status: 'approved',
      });
      unifiedUsage.consume.mockResolvedValue({
        consumed: 5,
        deductedFrom: [
          { quotaId: 'q-1', amount: 5, priority: 1, scope: 'tenant' },
        ],
      });

      const result = await service.requireAndConsume('org-1', 'user-1', 'core.apiCalls', 5);

      expect(result.consumed).toBe(5);
      expect(unifiedUsage.consume).toHaveBeenCalledWith({
        organizationId: 'org-1',
        userId: 'user-1',
        subject: 'core.apiCalls',
        amount: 5,
      });
    });

    it('should default amount to 1', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.apiCalls',
        type: 'metered',
        status: 'approved',
      });
      unifiedUsage.consume.mockResolvedValue({
        consumed: 1,
        deductedFrom: [
          { quotaId: 'q-1', amount: 1, priority: 1, scope: 'tenant' },
        ],
      });

      await service.requireAndConsume('org-1', 'user-1', 'core.apiCalls');

      expect(unifiedUsage.consume).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1 })
      );
    });

    it('should throw when metered quota is exhausted', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.apiCalls',
        type: 'metered',
        status: 'approved',
      });
      unifiedUsage.consume.mockRejectedValue(
        new UnifiedQuotaExceededError('org-1', 'user-1', 'core.apiCalls', 10, 0)
      );

      await expect(
        service.requireAndConsume('org-1', 'user-1', 'core.apiCalls', 10)
      ).rejects.toThrow(UnifiedQuotaExceededError);
    });

    it('should not consume for boolean capability (access check only)', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.advancedEditor',
        type: 'boolean',
        status: 'approved',
      });
      billingRepo.hasBooleanEntitlement.mockResolvedValue(true);

      const result = await service.requireAndConsume(
        'org-1',
        'user-1',
        'core.advancedEditor',
        1
      );

      expect(result.consumed).toBe(0);
      expect(unifiedUsage.consume).not.toHaveBeenCalled();
    });

    it('should reject unapproved capability', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'plugin.feature',
        type: 'metered',
        status: 'rejected',
      });

      await expect(
        service.requireAndConsume('org-1', 'user-1', 'plugin.feature', 1)
      ).rejects.toThrow(EntitlementDeniedError);
    });
  });

  // ==========================================================================
  // 5.5.4: Cache invalidation
  // ==========================================================================

  describe('invalidateForOrg()', () => {
    it('should emit invalidation event', async () => {
      await service.invalidateForOrg('org-1');

      expect(eventBus.emit).toHaveBeenCalledWith(
        'entitlement.invalidated',
        expect.objectContaining({ organizationId: 'org-1' })
      );
    });
  });

  // ==========================================================================
  // hasAccess / hasQuota (non-throwing variants)
  // ==========================================================================

  describe('hasAccess()', () => {
    it('should return true when access is granted', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.advancedEditor',
        type: 'boolean',
        status: 'approved',
      });
      billingRepo.hasBooleanEntitlement.mockResolvedValue(true);

      expect(await service.hasAccess('org-1', 'core.advancedEditor')).toBe(true);
    });

    it('should return false when access is denied', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.advancedEditor',
        type: 'boolean',
        status: 'approved',
      });
      billingRepo.hasBooleanEntitlement.mockResolvedValue(false);

      expect(await service.hasAccess('org-1', 'core.advancedEditor')).toBe(false);
    });
  });

  describe('hasQuota()', () => {
    it('should delegate to unifiedUsage.hasQuota for metered', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.storage',
        type: 'metered',
        status: 'approved',
      });
      unifiedUsage.hasQuota.mockResolvedValue(true);

      const result = await service.hasQuota('org-1', 'user-1', 'core.storage', 100);
      expect(result).toBe(true);
      expect(unifiedUsage.hasQuota).toHaveBeenCalledWith('org-1', 'user-1', 'core.storage', 100);
    });

    it('should return false for unapproved capability', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue(undefined);

      const result = await service.hasQuota('org-1', 'user-1', 'nonexistent', 1);
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // 5.5.6: Integration: subscribe → activate → entitlement → consume → verify
  // ==========================================================================

  describe('Lifecycle Integration: activate → load → consume', () => {
    it('should allow consumption after subscription activation provisions quotas', async () => {
      // Simulate: subscription activated, quotas provisioned
      // EntitlementService should find active quotas and allow consumption

      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.apiCalls',
        type: 'metered',
        status: 'approved',
      });

      // First call: verify access (quota exists)
      tenantQuotaRepo.getTotalBalance.mockResolvedValue(1000);
      await expect(
        service.requireAccess('org-1', 'core.apiCalls')
      ).resolves.toBeUndefined();

      // Second call: consume quota
      unifiedUsage.consume.mockResolvedValue({
        consumed: 10,
        deductedFrom: [
          { quotaId: 'tq-1', amount: 10, priority: 1, scope: 'tenant' },
        ],
      });

      const result = await service.requireAndConsume('org-1', 'user-1', 'core.apiCalls', 10);
      expect(result.consumed).toBe(10);
      expect(result.deductedFrom).toHaveLength(1);
      expect(result.deductedFrom[0]!.scope).toBe('tenant');
    });
  });

  // ==========================================================================
  // 5.5.7: Integration: Plan change → entitlement reload → new quota
  // ==========================================================================

  describe('Lifecycle Integration: plan change → new quotas', () => {
    it('should reflect new plan quotas after upgrade', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.storage',
        type: 'metered',
        status: 'approved',
      });

      // Before upgrade: 100 MB quota, not enough for 200
      unifiedUsage.hasQuota.mockResolvedValueOnce(false);
      expect(await service.hasQuota('org-1', 'user-1', 'core.storage', 200)).toBe(false);

      // After upgrade: quotas re-provisioned to 500 MB
      // (SubscriptionService.schedulePlanChange → removeQuotas → provisionQuotas → invalidateForOrg)
      unifiedUsage.hasQuota.mockResolvedValueOnce(true);
      expect(await service.hasQuota('org-1', 'user-1', 'core.storage', 200)).toBe(true);
    });
  });

  // ==========================================================================
  // 5.5.8: Integration: expire → entitlement invalid → consume rejected
  // ==========================================================================

  describe('Lifecycle Integration: expire → entitlement denied', () => {
    it('should deny access after subscription expires and quotas are removed', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.apiCalls',
        type: 'metered',
        status: 'approved',
      });

      // Before expiration: quota available
      tenantQuotaRepo.getTotalBalance.mockResolvedValueOnce(500);
      await expect(
        service.requireAccess('org-1', 'core.apiCalls')
      ).resolves.toBeUndefined();

      // After expiration: quotas removed
      // (RenewalService.processRenewal → cancelAtPeriodEnd → expire → invalidateForOrg)
      tenantQuotaRepo.getTotalBalance.mockResolvedValueOnce(0);
      await expect(
        service.requireAccess('org-1', 'core.apiCalls')
      ).rejects.toThrow(EntitlementDeniedError);
    });

    it('should reject consumption after subscription expires', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.apiCalls',
        type: 'metered',
        status: 'approved',
      });

      // After expiration: UnifiedUsageService throws
      unifiedUsage.consume.mockRejectedValue(
        new UnifiedQuotaExceededError('org-1', 'user-1', 'core.apiCalls', 1, 0)
      );

      await expect(
        service.requireAndConsume('org-1', 'user-1', 'core.apiCalls', 1)
      ).rejects.toThrow(UnifiedQuotaExceededError);
    });

    it('should deny boolean access after subscription expires', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.advancedEditor',
        type: 'boolean',
        status: 'approved',
      });

      // After expiration: no active subscription
      billingRepo.hasBooleanEntitlement.mockResolvedValue(false);

      await expect(
        service.requireAccess('org-1', 'core.advancedEditor')
      ).rejects.toThrow(EntitlementDeniedError);
    });
  });

  // ==========================================================================
  // 5.7.3: Core feature denied when quota insufficient
  // ==========================================================================

  describe('5.7.3: Core feature quota denial', () => {
    it('should deny core.media upload when file count quota exhausted', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.media',
        type: 'metered',
        status: 'approved',
      });
      unifiedUsage.consume.mockRejectedValue(
        new UnifiedQuotaExceededError('org-1', 'user-1', 'core.media', 1, 0)
      );

      await expect(
        service.requireAndConsume('org-1', 'user-1', 'core.media', 1)
      ).rejects.toThrow(UnifiedQuotaExceededError);
    });

    it('should deny core.storage upload when storage quota exhausted', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.storage',
        type: 'metered',
        status: 'approved',
      });
      unifiedUsage.consume.mockRejectedValue(
        new UnifiedQuotaExceededError('org-1', 'user-1', 'core.storage', 50, 10)
      );

      await expect(
        service.requireAndConsume('org-1', 'user-1', 'core.storage', 50)
      ).rejects.toThrow(UnifiedQuotaExceededError);
    });

    it('should deny core.teamMembers when seat limit reached', async () => {
      billingRepo.getCapabilityBySubject.mockResolvedValue({
        subject: 'core.teamMembers',
        type: 'metered',
        status: 'approved',
      });
      unifiedUsage.consume.mockRejectedValue(
        new UnifiedQuotaExceededError('org-1', 'user-1', 'core.teamMembers', 1, 0)
      );

      await expect(
        service.requireAndConsume('org-1', 'user-1', 'core.teamMembers', 1)
      ).rejects.toThrow(UnifiedQuotaExceededError);
    });
  });

  // ==========================================================================
  // 5.7.4: Core and Plugin subjects coexist in same Plan
  // ==========================================================================

  describe('5.7.4: Core and Plugin subjects coexist', () => {
    it('should allow Core subject consumption independently of Plugin subject', async () => {
      // Core subject: core.media
      billingRepo.getCapabilityBySubject.mockResolvedValueOnce({
        subject: 'core.media',
        type: 'metered',
        status: 'approved',
      });
      unifiedUsage.consume.mockResolvedValueOnce({
        consumed: 1,
        deductedFrom: [{ quotaId: 'tq-core-1', amount: 1, priority: 1, scope: 'tenant' }],
      });

      const coreResult = await service.requireAndConsume('org-1', 'user-1', 'core.media', 1);
      expect(coreResult.consumed).toBe(1);

      // Plugin subject: plugin.imageGen
      billingRepo.getCapabilityBySubject.mockResolvedValueOnce({
        subject: 'plugin.imageGen',
        type: 'metered',
        status: 'approved',
      });
      unifiedUsage.consume.mockResolvedValueOnce({
        consumed: 3,
        deductedFrom: [{ quotaId: 'tq-plugin-1', amount: 3, priority: 1, scope: 'tenant' }],
      });

      const pluginResult = await service.requireAndConsume('org-1', 'user-1', 'plugin.imageGen', 3);
      expect(pluginResult.consumed).toBe(3);

      // Both consumed independently
      expect(unifiedUsage.consume).toHaveBeenCalledTimes(2);
    });

    it('should deny Plugin subject without affecting Core subject availability', async () => {
      // Plugin subject: quota exhausted
      billingRepo.getCapabilityBySubject.mockResolvedValueOnce({
        subject: 'plugin.imageGen',
        type: 'metered',
        status: 'approved',
      });
      unifiedUsage.consume.mockRejectedValueOnce(
        new UnifiedQuotaExceededError('org-1', 'user-1', 'plugin.imageGen', 1, 0)
      );

      await expect(
        service.requireAndConsume('org-1', 'user-1', 'plugin.imageGen', 1)
      ).rejects.toThrow(UnifiedQuotaExceededError);

      // Core subject: still available
      billingRepo.getCapabilityBySubject.mockResolvedValueOnce({
        subject: 'core.media',
        type: 'metered',
        status: 'approved',
      });
      unifiedUsage.consume.mockResolvedValueOnce({
        consumed: 1,
        deductedFrom: [{ quotaId: 'tq-core-1', amount: 1, priority: 1, scope: 'tenant' }],
      });

      const coreResult = await service.requireAndConsume('org-1', 'user-1', 'core.media', 1);
      expect(coreResult.consumed).toBe(1);
    });
  });
});
