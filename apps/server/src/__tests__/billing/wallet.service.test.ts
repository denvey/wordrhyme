/**
 * WalletService Unit Tests
 *
 * Tests for the wallet service that manages user balance for billing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletService, WalletInfo } from '../../billing/services/wallet.service.js';

// Mock wallet data
const mockWallet = {
  userId: 'user-123',
  balanceCents: 5000,
  currency: 'usd',
};

// Mock QuotaRepository
const mockQuotaRepo = {
  getWallet: vi.fn(),
  addToWallet: vi.fn(),
  getOrCreateWallet: vi.fn(),
};

describe('WalletService', () => {
  let walletService: WalletService;

  beforeEach(() => {
    vi.clearAllMocks();
    walletService = new WalletService(mockQuotaRepo as any);
  });

  describe('getBalance()', () => {
    it('should return wallet balance for existing user', async () => {
      mockQuotaRepo.getWallet.mockResolvedValue(mockWallet);

      const result = await walletService.getBalance('user-123');

      expect(mockQuotaRepo.getWallet).toHaveBeenCalledWith('user-123');
      expect(result).toEqual({
        userId: 'user-123',
        balanceCents: 5000,
        currency: 'usd',
      });
    });

    it('should return zero balance for non-existing user', async () => {
      mockQuotaRepo.getWallet.mockResolvedValue(null);

      const result = await walletService.getBalance('new-user');

      expect(result).toEqual({
        userId: 'new-user',
        balanceCents: 0,
        currency: 'usd',
      });
    });
  });

  describe('addFunds()', () => {
    it('should add funds to wallet and return new balance', async () => {
      const updatedWallet = {
        userId: 'user-123',
        balanceCents: 10000, // 5000 + 5000
        currency: 'usd',
      };
      mockQuotaRepo.addToWallet.mockResolvedValue(updatedWallet);

      const result = await walletService.addFunds('user-123', 5000);

      expect(mockQuotaRepo.addToWallet).toHaveBeenCalledWith('user-123', 5000);
      expect(result.balanceCents).toBe(10000);
    });

    it('should handle adding to empty wallet', async () => {
      const newWallet = {
        userId: 'new-user',
        balanceCents: 1000,
        currency: 'usd',
      };
      mockQuotaRepo.addToWallet.mockResolvedValue(newWallet);

      const result = await walletService.addFunds('new-user', 1000);

      expect(result.balanceCents).toBe(1000);
    });
  });

  describe('ensureWallet()', () => {
    it('should return existing wallet', async () => {
      mockQuotaRepo.getOrCreateWallet.mockResolvedValue(mockWallet);

      const result = await walletService.ensureWallet('user-123');

      expect(mockQuotaRepo.getOrCreateWallet).toHaveBeenCalledWith('user-123', 'usd');
      expect(result.userId).toBe('user-123');
    });

    it('should create wallet with custom currency', async () => {
      const eurWallet = {
        userId: 'euro-user',
        balanceCents: 0,
        currency: 'eur',
      };
      mockQuotaRepo.getOrCreateWallet.mockResolvedValue(eurWallet);

      const result = await walletService.ensureWallet('euro-user', 'eur');

      expect(mockQuotaRepo.getOrCreateWallet).toHaveBeenCalledWith('euro-user', 'eur');
      expect(result.currency).toBe('eur');
    });
  });

  describe('hasSufficientBalance()', () => {
    it('should return true when balance is sufficient', async () => {
      mockQuotaRepo.getWallet.mockResolvedValue(mockWallet);

      const result = await walletService.hasSufficientBalance('user-123', 3000);

      expect(result).toBe(true);
    });

    it('should return true when balance equals amount', async () => {
      mockQuotaRepo.getWallet.mockResolvedValue(mockWallet);

      const result = await walletService.hasSufficientBalance('user-123', 5000);

      expect(result).toBe(true);
    });

    it('should return false when balance is insufficient', async () => {
      mockQuotaRepo.getWallet.mockResolvedValue(mockWallet);

      const result = await walletService.hasSufficientBalance('user-123', 10000);

      expect(result).toBe(false);
    });

    it('should return false for non-existing user', async () => {
      mockQuotaRepo.getWallet.mockResolvedValue(null);

      const result = await walletService.hasSufficientBalance('new-user', 100);

      expect(result).toBe(false);
    });
  });
});
