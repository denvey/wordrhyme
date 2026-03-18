/**
 * QuotaService Unit Tests
 *
 * Tests for the quota service that manages user quota grants.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuotaService } from '../../billing/services/quota.service.js';

// Mock quota data
const mockQuotaBucket = {
  id: 'quota-123',
  userId: 'user-123',
  subject: 'api.requests',
  balance: 1000,
  priority: 1,
  expiresAt: null,
  sourceType: 'membership' as const,
  sourceId: 'plan-basic',
};

// Mock QuotaRepository
const mockQuotaRepo = {
  getQuotaBySource: vi.fn(),
  createQuota: vi.fn(),
  getUserQuotasBySubject: vi.fn(),
  getAllUserQuotas: vi.fn(),
  getTotalBalance: vi.fn(),
};

// Mock EventBus
const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

describe('QuotaService', () => {
  let quotaService: QuotaService;

  beforeEach(() => {
    vi.clearAllMocks();
    quotaService = new QuotaService(mockQuotaRepo as any, mockEventBus as any);
  });

  describe('grant()', () => {
    const grantInput = {
      userId: 'user-123',
      subject: 'api.requests',
      amount: 1000,
      priority: 1,
      expiresAt: null,
      sourceType: 'membership' as const,
      sourceId: 'plan-basic',
    };

    it('should create new quota grant', async () => {
      mockQuotaRepo.getQuotaBySource.mockResolvedValue(null);
      mockQuotaRepo.createQuota.mockResolvedValue(mockQuotaBucket);

      await quotaService.grant(grantInput);

      expect(mockQuotaRepo.getQuotaBySource).toHaveBeenCalledWith(
        'user-123',
        'api.requests',
        'membership',
        'plan-basic'
      );
      expect(mockQuotaRepo.createQuota).toHaveBeenCalledWith({
        userId: 'user-123',
        subject: 'api.requests',
        balance: 1000,
        priority: 1,
        expiresAt: undefined,
        sourceType: 'membership',
        sourceId: 'plan-basic',
        metadata: undefined,
      });
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'billing.quota.granted',
        expect.objectContaining({
          userId: 'user-123',
          subject: 'api.requests',
          amount: 1000,
        })
      );
    });

    it('should be idempotent - skip if quota already exists', async () => {
      mockQuotaRepo.getQuotaBySource.mockResolvedValue(mockQuotaBucket);

      await quotaService.grant(grantInput);

      expect(mockQuotaRepo.createQuota).not.toHaveBeenCalled();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should handle quota with expiration date', async () => {
      const futureDate = new Date('2030-01-01');
      mockQuotaRepo.getQuotaBySource.mockResolvedValue(null);

      await quotaService.grant({
        ...grantInput,
        expiresAt: futureDate,
      });

      expect(mockQuotaRepo.createQuota).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: futureDate,
        })
      );
    });

    it('should include metadata in grant', async () => {
      mockQuotaRepo.getQuotaBySource.mockResolvedValue(null);
      const metadata = { planName: 'Basic', tierLevel: 1 };

      await quotaService.grant({
        ...grantInput,
        metadata,
      });

      expect(mockQuotaRepo.createQuota).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata,
        })
      );
    });
  });

  describe('getFeatureQuota()', () => {
    it('should return quota overview with active buckets', async () => {
      const buckets = [
        { ...mockQuotaBucket, balance: 500 },
        { ...mockQuotaBucket, id: 'quota-456', balance: 300, priority: 2, sourceId: 'addon-1' },
      ];
      mockQuotaRepo.getUserQuotasBySubject.mockResolvedValue(buckets);

      const result = await quotaService.getFeatureQuota('user-123', 'api.requests');

      expect(result.subject).toBe('api.requests');
      expect(result.totalBalance).toBe(800); // 500 + 300
      expect(result.buckets).toHaveLength(2);
    });

    it('should filter out zero-balance buckets', async () => {
      const buckets = [
        { ...mockQuotaBucket, balance: 500 },
        { ...mockQuotaBucket, id: 'quota-empty', balance: 0 },
      ];
      mockQuotaRepo.getUserQuotasBySubject.mockResolvedValue(buckets);

      const result = await quotaService.getFeatureQuota('user-123', 'api.requests');

      expect(result.totalBalance).toBe(500);
      expect(result.buckets).toHaveLength(1);
    });

    it('should filter out expired buckets', async () => {
      const pastDate = new Date('2020-01-01');
      const buckets = [
        { ...mockQuotaBucket, balance: 500 },
        { ...mockQuotaBucket, id: 'quota-expired', balance: 200, expiresAt: pastDate },
      ];
      mockQuotaRepo.getUserQuotasBySubject.mockResolvedValue(buckets);

      const result = await quotaService.getFeatureQuota('user-123', 'api.requests');

      expect(result.totalBalance).toBe(500);
      expect(result.buckets).toHaveLength(1);
    });

    it('should return empty overview when no buckets', async () => {
      mockQuotaRepo.getUserQuotasBySubject.mockResolvedValue([]);

      const result = await quotaService.getFeatureQuota('user-123', 'api.requests');

      expect(result.totalBalance).toBe(0);
      expect(result.buckets).toHaveLength(0);
    });
  });

  describe('getAllUserQuotas()', () => {
    it('should group quotas by feature key', async () => {
      const allQuotas = [
        { ...mockQuotaBucket, subject: 'api.requests', balance: 500 },
        { ...mockQuotaBucket, id: 'q2', subject: 'api.requests', balance: 300 },
        { ...mockQuotaBucket, id: 'q3', subject: 'storage.bytes', balance: 1000000 },
      ];
      mockQuotaRepo.getAllUserQuotas.mockResolvedValue(allQuotas);

      const result = await quotaService.getAllUserQuotas('user-123');

      expect(result).toHaveLength(2); // Two feature keys
      const apiOverview = result.find((o) => o.subject === 'api.requests');
      const storageOverview = result.find((o) => o.subject === 'storage.bytes');

      expect(apiOverview?.totalBalance).toBe(800);
      expect(apiOverview?.buckets).toHaveLength(2);
      expect(storageOverview?.totalBalance).toBe(1000000);
      expect(storageOverview?.buckets).toHaveLength(1);
    });

    it('should handle user with no quotas', async () => {
      mockQuotaRepo.getAllUserQuotas.mockResolvedValue([]);

      const result = await quotaService.getAllUserQuotas('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('hasQuota()', () => {
    it('should return true when balance is sufficient', async () => {
      mockQuotaRepo.getTotalBalance.mockResolvedValue(1000);

      const result = await quotaService.hasQuota('user-123', 'api.requests', 500);

      expect(result).toBe(true);
    });

    it('should return true when balance equals required amount', async () => {
      mockQuotaRepo.getTotalBalance.mockResolvedValue(1000);

      const result = await quotaService.hasQuota('user-123', 'api.requests', 1000);

      expect(result).toBe(true);
    });

    it('should return false when balance is insufficient', async () => {
      mockQuotaRepo.getTotalBalance.mockResolvedValue(500);

      const result = await quotaService.hasQuota('user-123', 'api.requests', 1000);

      expect(result).toBe(false);
    });

    it('should return false when no quota exists', async () => {
      mockQuotaRepo.getTotalBalance.mockResolvedValue(0);

      const result = await quotaService.hasQuota('user-123', 'api.requests', 100);

      expect(result).toBe(false);
    });
  });

  describe('getTotalBalance()', () => {
    it('should return total balance from repository', async () => {
      mockQuotaRepo.getTotalBalance.mockResolvedValue(5000);

      const result = await quotaService.getTotalBalance('user-123', 'api.requests');

      expect(mockQuotaRepo.getTotalBalance).toHaveBeenCalledWith('user-123', 'api.requests');
      expect(result).toBe(5000);
    });

    it('should return 0 for non-existent quota', async () => {
      mockQuotaRepo.getTotalBalance.mockResolvedValue(0);

      const result = await quotaService.getTotalBalance('user-123', 'unknown.feature');

      expect(result).toBe(0);
    });
  });
});
