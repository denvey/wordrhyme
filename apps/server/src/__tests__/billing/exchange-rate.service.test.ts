/**
 * ExchangeRateService Unit Tests
 *
 * Tests for the exchange rate service that handles currency conversion
 * with Banker's Rounding (half-to-even).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExchangeRateService } from '../../billing/services/exchange-rate.service';

// Mock data
const mockRateUSDtoCNY = {
  id: 'rate-1',
  organizationId: 'org-123',
  baseCurrency: 'USD',
  targetCurrency: 'CNY',
  rate: '7.25',
  source: 'manual',
  effectiveAt: new Date('2024-01-01'),
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRateUSDtoJPY = {
  id: 'rate-2',
  organizationId: 'org-123',
  baseCurrency: 'USD',
  targetCurrency: 'JPY',
  rate: '149.50',
  source: 'manual',
  effectiveAt: new Date('2024-01-01'),
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCurrencyUSD = {
  id: 'currency-usd',
  organizationId: 'org-123',
  code: 'USD',
  symbol: '$',
  decimalDigits: 2,
  isEnabled: 1,
  isBase: 1,
};

const mockCurrencyCNY = {
  id: 'currency-cny',
  organizationId: 'org-123',
  code: 'CNY',
  symbol: '¥',
  decimalDigits: 2,
  isEnabled: 1,
  isBase: 0,
};

const mockCurrencyJPY = {
  id: 'currency-jpy',
  organizationId: 'org-123',
  code: 'JPY',
  symbol: '¥',
  decimalDigits: 0,
  isEnabled: 1,
  isBase: 0,
};

// Mock repositories
const mockRateRepo = {
  getCurrentRate: vi.fn(),
  getRateAt: vi.fn(),
  getAllCurrentRates: vi.fn(),
  getRateHistory: vi.fn(),
  setRate: vi.fn(),
  bulkSetRates: vi.fn(),
};

const mockCurrencyService = {
  getByCode: vi.fn(),
  getBaseCurrency: vi.fn(),
};

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExchangeRateService(mockRateRepo as any, mockCurrencyService as any);
  });

  // ============================================================================
  // Query Methods
  // ============================================================================

  describe('getCurrentRate()', () => {
    it('should return current rate for currency pair', async () => {
      mockRateRepo.getCurrentRate.mockResolvedValue(mockRateUSDtoCNY);

      const result = await service.getCurrentRate('org-123', 'USD', 'CNY');

      expect(mockRateRepo.getCurrentRate).toHaveBeenCalledWith('org-123', 'USD', 'CNY');
      expect(result?.rate).toBe('7.25');
    });

    it('should return null for non-existent rate', async () => {
      mockRateRepo.getCurrentRate.mockResolvedValue(null);

      const result = await service.getCurrentRate('org-123', 'USD', 'EUR');

      expect(result).toBeNull();
    });
  });

  describe('getAllCurrentRates()', () => {
    it('should return all current rates for organization', async () => {
      mockRateRepo.getAllCurrentRates.mockResolvedValue([mockRateUSDtoCNY, mockRateUSDtoJPY]);

      const result = await service.getAllCurrentRates('org-123');

      expect(result).toHaveLength(2);
    });
  });

  // ============================================================================
  // Set Rate
  // ============================================================================

  describe('setRate()', () => {
    it('should set exchange rate successfully', async () => {
      mockCurrencyService.getByCode.mockImplementation((_, code) => {
        if (code === 'USD') return Promise.resolve(mockCurrencyUSD);
        if (code === 'CNY') return Promise.resolve(mockCurrencyCNY);
        return Promise.resolve(null);
      });
      mockRateRepo.setRate.mockResolvedValue(mockRateUSDtoCNY);

      const result = await service.setRate({
        organizationId: 'org-123',
        baseCurrency: 'USD',
        targetCurrency: 'CNY',
        rate: '7.25',
      });

      expect(result.rate).toBe('7.25');
    });

    it('should reject zero rate', async () => {
      await expect(
        service.setRate({
          organizationId: 'org-123',
          baseCurrency: 'USD',
          targetCurrency: 'CNY',
          rate: '0',
        })
      ).rejects.toThrow('Exchange rate must be positive');
    });

    it('should reject negative rate', async () => {
      await expect(
        service.setRate({
          organizationId: 'org-123',
          baseCurrency: 'USD',
          targetCurrency: 'CNY',
          rate: '-1.5',
        })
      ).rejects.toThrow('Exchange rate must be positive');
    });

    it('should reject if base currency not found', async () => {
      mockCurrencyService.getByCode.mockResolvedValue(null);

      await expect(
        service.setRate({
          organizationId: 'org-123',
          baseCurrency: 'XXX',
          targetCurrency: 'CNY',
          rate: '7.25',
        })
      ).rejects.toThrow('Base currency XXX not found');
    });

    it('should reject if currency is disabled', async () => {
      mockCurrencyService.getByCode.mockImplementation((_, code) => {
        if (code === 'USD') return Promise.resolve(mockCurrencyUSD);
        if (code === 'CNY') return Promise.resolve({ ...mockCurrencyCNY, isEnabled: 0 });
        return Promise.resolve(null);
      });

      await expect(
        service.setRate({
          organizationId: 'org-123',
          baseCurrency: 'USD',
          targetCurrency: 'CNY',
          rate: '7.25',
        })
      ).rejects.toThrow('Target currency CNY is disabled');
    });
  });

  // ============================================================================
  // Bulk Import
  // ============================================================================

  describe('bulkImportRates()', () => {
    it('should import multiple rates', async () => {
      mockRateRepo.bulkSetRates.mockResolvedValue([mockRateUSDtoCNY, mockRateUSDtoJPY]);

      const result = await service.bulkImportRates({
        organizationId: 'org-123',
        rates: [
          { baseCurrency: 'USD', targetCurrency: 'CNY', rate: '7.25' },
          { baseCurrency: 'USD', targetCurrency: 'JPY', rate: '149.50' },
        ],
      });

      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty input', async () => {
      const result = await service.bulkImportRates({
        organizationId: 'org-123',
        rates: [],
      });

      expect(result).toEqual([]);
    });

    it('should reject if any rate is invalid', async () => {
      await expect(
        service.bulkImportRates({
          organizationId: 'org-123',
          rates: [
            { baseCurrency: 'USD', targetCurrency: 'CNY', rate: '7.25' },
            { baseCurrency: 'USD', targetCurrency: 'JPY', rate: '-1' },
          ],
        })
      ).rejects.toThrow('Invalid rate for USD/JPY');
    });
  });

  // ============================================================================
  // Currency Conversion
  // ============================================================================

  describe('convert()', () => {
    beforeEach(() => {
      mockCurrencyService.getBaseCurrency.mockResolvedValue(mockCurrencyUSD);
    });

    it('should return same amount for same currency', async () => {
      const result = await service.convert('org-123', 'USD', 'USD', 1999);

      expect(result.toAmountCents).toBe(1999);
      expect(result.rate).toBe('1');
    });

    it('should convert using direct rate', async () => {
      mockRateRepo.getCurrentRate.mockResolvedValue(mockRateUSDtoCNY);

      const result = await service.convert('org-123', 'USD', 'CNY', 1000);

      // 1000 * 7.25 = 7250
      expect(result.toAmountCents).toBe(7250);
      expect(result.fromCurrency).toBe('USD');
      expect(result.toCurrency).toBe('CNY');
    });

    it('should convert using inverse rate', async () => {
      // No direct rate USD->CNY
      mockRateRepo.getCurrentRate.mockImplementation((_, base, target) => {
        if (base === 'CNY' && target === 'USD') {
          return Promise.resolve({
            ...mockRateUSDtoCNY,
            baseCurrency: 'CNY',
            targetCurrency: 'USD',
            rate: '0.13793103448', // 1/7.25
          });
        }
        return Promise.resolve(null);
      });

      const result = await service.convert('org-123', 'USD', 'CNY', 1000);

      // 1000 / 0.13793103448 ≈ 7250
      expect(result.toAmountCents).toBeCloseTo(7250, -1);
    });

    it('should use triangulation through base currency', async () => {
      // No direct CNY->JPY rate, but have USD->CNY and USD->JPY
      mockRateRepo.getCurrentRate.mockImplementation((_, base, target) => {
        if (base === 'USD' && target === 'CNY') {
          return Promise.resolve(mockRateUSDtoCNY); // 7.25
        }
        if (base === 'USD' && target === 'JPY') {
          return Promise.resolve(mockRateUSDtoJPY); // 149.50
        }
        return Promise.resolve(null);
      });

      const result = await service.convert('org-123', 'CNY', 'JPY', 725);

      // Cross rate: 149.50 / 7.25 ≈ 20.62
      // 725 * 20.62 ≈ 14950
      expect(result.toAmountCents).toBeCloseTo(14950, -1);
    });

    it('should throw if no rate available', async () => {
      mockRateRepo.getCurrentRate.mockResolvedValue(null);

      await expect(service.convert('org-123', 'USD', 'EUR', 1000)).rejects.toThrow(
        'No exchange rate available for USD/EUR'
      );
    });
  });

  describe('convertAt()', () => {
    it('should convert using historical rate', async () => {
      const historicalDate = new Date('2024-01-15');
      mockRateRepo.getRateAt.mockResolvedValue(mockRateUSDtoCNY);

      const result = await service.convertAt('org-123', 'USD', 'CNY', 1000, historicalDate);

      expect(mockRateRepo.getRateAt).toHaveBeenCalledWith(
        'org-123',
        'USD',
        'CNY',
        historicalDate
      );
      expect(result.toAmountCents).toBe(7250);
    });

    it('should return same amount for same currency', async () => {
      const result = await service.convertAt(
        'org-123',
        'USD',
        'USD',
        1000,
        new Date()
      );

      expect(result.toAmountCents).toBe(1000);
      expect(mockRateRepo.getRateAt).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Banker's Rounding Tests
  // ============================================================================

  describe("Banker's Rounding (half-to-even)", () => {
    beforeEach(() => {
      mockCurrencyService.getBaseCurrency.mockResolvedValue(mockCurrencyUSD);
    });

    it('should round 0.5 to nearest even (0)', async () => {
      // Amount that results in exactly X.5
      // 100 * 1.005 = 100.5 → rounds to 100 (even)
      mockRateRepo.getCurrentRate.mockResolvedValue({
        ...mockRateUSDtoCNY,
        rate: '1.005',
      });

      const result = await service.convert('org-123', 'USD', 'CNY', 100);
      expect(result.toAmountCents).toBe(100); // or 101, depends on Decimal.js implementation
    });

    it('should round 1.5 to nearest even (2)', async () => {
      // 100 * 1.015 = 101.5 → rounds to 102 (even)
      mockRateRepo.getCurrentRate.mockResolvedValue({
        ...mockRateUSDtoCNY,
        rate: '1.015',
      });

      const result = await service.convert('org-123', 'USD', 'CNY', 100);
      expect(result.toAmountCents).toBe(102);
    });

    it('should round 2.5 to nearest even (2)', async () => {
      // 100 * 1.025 = 102.5 → rounds to 102 (even)
      mockRateRepo.getCurrentRate.mockResolvedValue({
        ...mockRateUSDtoCNY,
        rate: '1.025',
      });

      const result = await service.convert('org-123', 'USD', 'CNY', 100);
      expect(result.toAmountCents).toBe(102);
    });

    it('should round 3.5 to nearest even (4)', async () => {
      // 100 * 1.035 = 103.5 → rounds to 104 (even)
      mockRateRepo.getCurrentRate.mockResolvedValue({
        ...mockRateUSDtoCNY,
        rate: '1.035',
      });

      const result = await service.convert('org-123', 'USD', 'CNY', 100);
      expect(result.toAmountCents).toBe(104);
    });

    it('should round normally for non-.5 decimals', async () => {
      // 100 * 1.024 = 102.4 → rounds to 102
      mockRateRepo.getCurrentRate.mockResolvedValue({
        ...mockRateUSDtoCNY,
        rate: '1.024',
      });

      const result = await service.convert('org-123', 'USD', 'CNY', 100);
      expect(result.toAmountCents).toBe(102);
    });

    it('should preserve zero', async () => {
      mockRateRepo.getCurrentRate.mockResolvedValue(mockRateUSDtoCNY);

      const result = await service.convert('org-123', 'USD', 'CNY', 0);
      expect(result.toAmountCents).toBe(0);
    });

    it('should maintain positivity for positive amounts', async () => {
      mockRateRepo.getCurrentRate.mockResolvedValue(mockRateUSDtoCNY);

      const result = await service.convert('org-123', 'USD', 'CNY', 1);
      expect(result.toAmountCents).toBeGreaterThan(0);
    });
  });
});
