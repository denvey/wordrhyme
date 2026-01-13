/**
 * Wallet Service
 *
 * Manages user wallet balance for overage charges and top-ups.
 */

import { Injectable, Logger } from '@nestjs/common';
import { QuotaRepository } from '../repos/quota.repo';

/**
 * Wallet balance info
 */
export interface WalletInfo {
  userId: string;
  balanceCents: number;
  currency: string;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private readonly quotaRepo: QuotaRepository) {}

  /**
   * Get wallet balance for a user
   */
  async getBalance(userId: string): Promise<WalletInfo> {
    const wallet = await this.quotaRepo.getWallet(userId);

    if (!wallet) {
      return {
        userId,
        balanceCents: 0,
        currency: 'usd',
      };
    }

    return {
      userId: wallet.userId,
      balanceCents: wallet.balanceCents,
      currency: wallet.currency,
    };
  }

  /**
   * Add funds to wallet (after successful top-up payment)
   */
  async addFunds(userId: string, amountCents: number): Promise<WalletInfo> {
    const wallet = await this.quotaRepo.addToWallet(userId, amountCents);

    this.logger.log(
      `Added ${amountCents} cents to wallet for user ${userId}. New balance: ${wallet.balanceCents}`
    );

    return {
      userId: wallet.userId,
      balanceCents: wallet.balanceCents,
      currency: wallet.currency,
    };
  }

  /**
   * Get or create wallet for a user
   */
  async ensureWallet(userId: string, currency = 'usd'): Promise<WalletInfo> {
    const wallet = await this.quotaRepo.getOrCreateWallet(userId, currency);

    return {
      userId: wallet.userId,
      balanceCents: wallet.balanceCents,
      currency: wallet.currency,
    };
  }

  /**
   * Check if user has sufficient balance
   */
  async hasSufficientBalance(
    userId: string,
    amountCents: number
  ): Promise<boolean> {
    const wallet = await this.quotaRepo.getWallet(userId);
    return (wallet?.balanceCents ?? 0) >= amountCents;
  }
}
