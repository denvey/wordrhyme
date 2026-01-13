/**
 * Quota Service
 *
 * Manages user quota grants and lifecycle.
 * Called by payment success handlers to provision entitlements.
 */

import { Injectable, Logger } from '@nestjs/common';
import { QuotaRepository } from '../repos/quota.repo';
import { EventBus } from '../../events/event-bus';
import type { QuotaSourceType } from '../../db/schema/billing';
import type { QuotaGrantedEvent } from '../events/billing.events';

/**
 * Parameters for granting quota
 */
export interface GrantQuotaInput {
  userId: string;
  featureKey: string;
  amount: number;
  priority: number;
  expiresAt?: Date | null;
  sourceType: QuotaSourceType;
  sourceId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Quota bucket summary for display
 */
export interface QuotaBucketSummary {
  id: string;
  featureKey: string;
  balance: number;
  priority: number;
  expiresAt: Date | null;
  sourceType: QuotaSourceType;
  sourceId: string;
}

/**
 * User quota overview
 */
export interface UserQuotaOverview {
  featureKey: string;
  totalBalance: number;
  buckets: QuotaBucketSummary[];
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(
    private readonly quotaRepo: QuotaRepository,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Grant quota to a user
   *
   * This is called after successful payment to provision entitlements.
   * Idempotent - will not create duplicate grants for the same source.
   */
  async grant(input: GrantQuotaInput): Promise<void> {
    const {
      userId,
      featureKey,
      amount,
      priority,
      expiresAt,
      sourceType,
      sourceId,
      metadata,
    } = input;

    // Idempotency check - don't create duplicate grants
    const existing = await this.quotaRepo.getQuotaBySource(
      userId,
      featureKey,
      sourceType,
      sourceId
    );

    if (existing) {
      this.logger.log(
        `Quota already exists for ${userId}:${featureKey} from ${sourceType}:${sourceId}, skipping`
      );
      return;
    }

    // Create the quota bucket
    await this.quotaRepo.createQuota({
      userId,
      featureKey,
      balance: amount,
      priority,
      expiresAt: expiresAt ?? undefined,
      sourceType,
      sourceId,
      metadata,
    });

    this.logger.log(
      `Granted ${amount} ${featureKey} to user ${userId} (priority: ${priority}, expires: ${expiresAt ?? 'never'})`
    );

    // Emit quota granted event
    const event: QuotaGrantedEvent = {
      userId,
      featureKey,
      amount,
      priority,
      expiresAt: expiresAt ?? null,
      sourceType,
      sourceId,
      grantedAt: new Date(),
    };

    this.eventBus.emit('billing.quota.granted' as any, event);
  }

  /**
   * Get user's quota overview for a specific feature
   */
  async getFeatureQuota(
    userId: string,
    featureKey: string
  ): Promise<UserQuotaOverview> {
    const buckets = await this.quotaRepo.getUserQuotasByFeature(
      userId,
      featureKey
    );

    const activeBuckets = buckets.filter(
      (b) =>
        b.balance > 0 &&
        (b.expiresAt === null || b.expiresAt > new Date())
    );

    return {
      featureKey,
      totalBalance: activeBuckets.reduce((sum, b) => sum + b.balance, 0),
      buckets: activeBuckets.map((b) => ({
        id: b.id,
        featureKey: b.featureKey,
        balance: b.balance,
        priority: b.priority,
        expiresAt: b.expiresAt,
        sourceType: b.sourceType,
        sourceId: b.sourceId,
      })),
    };
  }

  /**
   * Get all quota overviews for a user
   */
  async getAllUserQuotas(userId: string): Promise<UserQuotaOverview[]> {
    const allQuotas = await this.quotaRepo.getAllUserQuotas(userId);

    // Group by feature key
    const byFeature = new Map<string, typeof allQuotas>();

    for (const quota of allQuotas) {
      const existing = byFeature.get(quota.featureKey) ?? [];
      existing.push(quota);
      byFeature.set(quota.featureKey, existing);
    }

    const overviews: UserQuotaOverview[] = [];

    for (const [featureKey, buckets] of byFeature) {
      const activeBuckets = buckets.filter(
        (b) =>
          b.balance > 0 &&
          (b.expiresAt === null || b.expiresAt > new Date())
      );

      overviews.push({
        featureKey,
        totalBalance: activeBuckets.reduce((sum, b) => sum + b.balance, 0),
        buckets: activeBuckets.map((b) => ({
          id: b.id,
          featureKey: b.featureKey,
          balance: b.balance,
          priority: b.priority,
          expiresAt: b.expiresAt,
          sourceType: b.sourceType,
          sourceId: b.sourceId,
        })),
      });
    }

    return overviews;
  }

  /**
   * Check if user has sufficient quota
   */
  async hasQuota(
    userId: string,
    featureKey: string,
    amount: number
  ): Promise<boolean> {
    const total = await this.quotaRepo.getTotalBalance(userId, featureKey);
    return total >= amount;
  }

  /**
   * Get total available balance for a feature
   */
  async getTotalBalance(userId: string, featureKey: string): Promise<number> {
    return this.quotaRepo.getTotalBalance(userId, featureKey);
  }
}
