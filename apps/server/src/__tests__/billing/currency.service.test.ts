/**
 * CurrencyService Unit Tests
 *
 * Tests for the currency service that manages organization currencies.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CurrencyService } from '../../billing/services/currency.service';

// Mock currency data
const mockCurrencyUSD = {
  id: 'currency-usd',
  organizationId: 'org-123',
  code: 'USD',
  nameI18n: { 'en-US': 'US Dollar', 'zh-CN': '美元' },
  symbol: '$',
  decimalDigits: 2,
  isEnabled: 1,
  isBase: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCurrencyCNY = {
  id: 'currency-cny',
  organizationId: 'org-123',
  code: 'CNY',
  nameI18n: { 'en-US': 'Chinese Yuan', 'zh-CN': '人民币' },
  symbol: '¥',
  decimalDigits: 2,
  isEnabled: 1,
  isBase: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock database - chainable query builder
function createMockDb() {
  const chain: Record<string, any> = {};

  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue([]);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.transaction = vi.fn();

  // Default: select queries resolve to empty array (then is for await)
  chain.then = undefined; // will be set per test

  return chain;
}

const mockExchangeRateRepo = {
  getCurrentRate: vi.fn(),
};

describe('CurrencyService', () => {
  let service: CurrencyService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    service = new CurrencyService(mockDb as any, mockExchangeRateRepo as any);
  });

  // ============================================================================
  // Query Methods
  // ============================================================================

  describe('getById()', () => {
    it('should return currency by id', async () => {
      mockDb.limit.mockResolvedValue([mockCurrencyUSD]);

      const result = await service.getById('currency-usd');

      expect(result).toEqual(mockCurrencyUSD);
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await service.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getBaseCurrency()', () => {
    it('should return base currency', async () => {
      mockDb.limit.mockResolvedValue([mockCurrencyUSD]);

      const result = await service.getBaseCurrency('org-123');

      expect(result).toEqual(mockCurrencyUSD);
    });
  });

  describe('getEnabledWithRates()', () => {
    it('should return currencies with their exchange rates', async () => {
      // First call: getEnabledByOrganization, second call: getBaseCurrency
      mockDb.orderBy.mockResolvedValueOnce([mockCurrencyUSD, mockCurrencyCNY]);
      mockDb.limit.mockResolvedValueOnce([mockCurrencyUSD]);
      mockExchangeRateRepo.getCurrentRate.mockResolvedValue({ rate: '7.25' });

      const result = await service.getEnabledWithRates('org-123');

      expect(result).toHaveLength(2);
      expect(result[0].currentRate).toBe('1'); // Base currency
      expect(result[1].currentRate).toBe('7.25'); // CNY rate
    });

    it('should handle missing exchange rates', async () => {
      mockDb.orderBy.mockResolvedValueOnce([mockCurrencyUSD, mockCurrencyCNY]);
      mockDb.limit.mockResolvedValueOnce([mockCurrencyUSD]);
      mockExchangeRateRepo.getCurrentRate.mockResolvedValue(null);

      const result = await service.getEnabledWithRates('org-123');

      expect(result[1].currentRate).toBeUndefined();
    });
  });

  // ============================================================================
  // Create Currency
  // ============================================================================

  describe('create()', () => {
    it('should reject duplicate currency code', async () => {
      // getByCode returns existing
      mockDb.limit.mockResolvedValue([mockCurrencyUSD]);

      await expect(
        service.create({
          organizationId: 'org-123',
          code: 'USD',
          nameI18n: { 'en-US': 'US Dollar' },
          symbol: '$',
        })
      ).rejects.toThrow('Currency USD already exists');
    });
  });

  // ============================================================================
  // Update Currency
  // ============================================================================

  describe('update()', () => {
    it('should throw if currency not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(service.update('invalid-id', { symbol: '$' })).rejects.toThrow(
        'Currency invalid-id not found'
      );
    });

    it('should reject disabling base currency', async () => {
      mockDb.limit.mockResolvedValue([mockCurrencyUSD]);

      await expect(
        service.update('currency-usd', { isEnabled: false })
      ).rejects.toThrow('Cannot disable base currency');
    });
  });

  // ============================================================================
  // Toggle Enabled
  // ============================================================================

  describe('toggleEnabled()', () => {
    it('should reject disabling base currency', async () => {
      mockDb.limit.mockResolvedValue([mockCurrencyUSD]);

      await expect(service.toggleEnabled('currency-usd', false)).rejects.toThrow(
        'Cannot disable base currency'
      );
    });
  });

  // ============================================================================
  // Set Base Currency
  // ============================================================================

  describe('setBaseCurrency()', () => {
    it('should return immediately if already base', async () => {
      mockDb.limit.mockResolvedValue([mockCurrencyUSD]);

      const result = await service.setBaseCurrency('org-123', 'currency-usd');

      expect(result).toEqual(mockCurrencyUSD);
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should reject if currency belongs to different organization', async () => {
      mockDb.limit.mockResolvedValue([{ ...mockCurrencyCNY, organizationId: 'org-other' }]);

      await expect(
        service.setBaseCurrency('org-123', 'currency-cny')
      ).rejects.toThrow('Currency does not belong to this organization');
    });
  });

  // ============================================================================
  // Delete Currency
  // ============================================================================

  describe('delete()', () => {
    it('should reject deleting base currency', async () => {
      mockDb.limit.mockResolvedValue([mockCurrencyUSD]);

      await expect(service.delete('currency-usd')).rejects.toThrow(
        'Cannot delete base currency'
      );
    });

    it('should throw if currency not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(service.delete('nonexistent')).rejects.toThrow(
        'Currency nonexistent not found'
      );
    });
  });
});
