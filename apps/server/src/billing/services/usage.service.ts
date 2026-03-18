/**
 * Usage Service
 *
 * Handles quota consumption with waterfall deduction logic.
 * This is the core engine for the "Smart Deduction" feature.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { eq, and, gt, or, isNull, desc, asc, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { QuotaRepository } from '../repos/quota.repo';
import { EventBus } from '../../events/event-bus';
import {
  userQuotas,
  wallets,
  usageRecords,
  planItems,
} from '@wordrhyme/db';
import type { QuotaConsumedEvent, QuotaExhaustedEvent } from '../events/billing.events';

/**
 * Parameters for consuming quota
 */
export interface ConsumeQuotaInput {
  userId: string;
  subject: string;
  amount: number;
  /** Whether to allow overage charges from wallet */
  allowOverage?: boolean;
  /** Metadata for the usage record */
  metadata?: Record<string, unknown>;
}

/**
 * Result of quota consumption
 */
export interface ConsumeQuotaResult {
  /** Total amount consumed */
  consumed: number;
  /** Details of which buckets were deducted */
  deductedFrom: Array<{
    quotaId: string;
    amount: number;
    priority: number;
  }>;
  /** Amount charged from wallet as overage (if any) */
  overageChargedCents?: number;
  /** Remaining amount that could not be consumed (if any) */
  remainingUnconsumed?: number;
}

/**
 * Error thrown when quota is exhausted
 *
 * @deprecated Use {@link UnifiedQuotaExceededError} from `unified-usage.service` instead.
 */
export class QuotaExceededError extends Error {
  constructor(
    public readonly userId: string,
    public readonly subject: string,
    public readonly requested: number,
    public readonly available: number
  ) {
    super(
      `Quota exceeded for ${subject}: requested ${requested}, available ${available}`
    );
    this.name = 'QuotaExceededError';
  }
}

/**
 * Error thrown when wallet has insufficient funds for overage
 */
export class InsufficientFundsError extends Error {
  constructor(
    public readonly userId: string,
    public readonly required: number,
    public readonly available: number
  ) {
    super(
      `Insufficient wallet funds: required ${required} cents, available ${available} cents`
    );
    this.name = 'InsufficientFundsError';
  }
}

/**
 * @deprecated Use {@link UnifiedUsageService} instead.
 * UnifiedUsageService supports tenant+user waterfall deduction and integrates
 * with the EntitlementService facade. This class will be removed in a future version.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @Inject('DATABASE') private readonly db: Database,
    private readonly quotaRepo: QuotaRepository,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Consume quota using waterfall deduction
   *
   * Algorithm:
   * 1. Fetch all active quota buckets for the user and feature
   * 2. Sort by priority DESC, then expiresAt ASC (expiring soon first)
   * 3. Deduct from buckets in order until request is satisfied
   * 4. If quota exhausted and allowOverage=true, charge wallet
   * 5. Record the usage event (immutable audit log)
   *
   * All operations are wrapped in a transaction for atomicity.
   */
  async consume(input: ConsumeQuotaInput): Promise<ConsumeQuotaResult> {
    const {
      userId,
      subject,
      amount,
      allowOverage = false,
      metadata,
    } = input;

    const result = await this.db.transaction(async (tx) => {
      const now = new Date();

      // Set transaction isolation level for consistency
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);

      // 1. Fetch active quota buckets with proper sorting and ROW LOCK
      // Priority DESC (higher priority first)
      // ExpiresAt ASC (expiring sooner first, nulls last)
      // FOR UPDATE prevents concurrent modifications
      const buckets = await tx
        .select()
        .from(userQuotas)
        .where(
          and(
            eq(userQuotas.userId, userId),
            eq(userQuotas.subject, subject),
            gt(userQuotas.balance, 0),
            or(isNull(userQuotas.expiresAt), gt(userQuotas.expiresAt, now))
          )
        )
        .orderBy(
          desc(userQuotas.priority),
          asc(sql`COALESCE(${userQuotas.expiresAt}, '9999-12-31'::timestamp)`)
        )
        .for('update'); // Row-level lock to prevent race conditions

      // 2. Waterfall deduction
      let remaining = amount;
      const deductedFrom: Array<{
        quotaId: string;
        amount: number;
        priority: number;
      }> = [];

      for (const bucket of buckets) {
        if (remaining <= 0) break;

        const deductAmount = Math.min(remaining, bucket.balance);

        // Deduct from this bucket with optimistic lock verification
        const [updated] = await tx
          .update(userQuotas)
          .set({
            balance: sql`${userQuotas.balance} - ${deductAmount}`,
            updatedAt: now,
          })
          .where(
            and(
              eq(userQuotas.id, bucket.id),
              // Optimistic lock: verify balance matches what we read
              eq(userQuotas.balance, bucket.balance)
            )
          )
          .returning();

        // If update failed, another transaction modified this bucket
        if (!updated) {
          throw new Error(
            `Concurrent modification detected for quota bucket ${bucket.id}. Please retry.`
          );
        }

        deductedFrom.push({
          quotaId: bucket.id,
          amount: deductAmount,
          priority: bucket.priority,
        });

        remaining -= deductAmount;

        this.logger.debug(
          `[User:${userId}] Deducted ${deductAmount} from bucket ${bucket.id} (priority: ${bucket.priority})`
        );
      }

      // 3. Handle remaining amount (overage)
      let overageChargedCents: number | undefined;

      if (remaining > 0) {
        if (!allowOverage) {
          // Emit exhausted event
          const exhaustedEvent: QuotaExhaustedEvent = {
            userId,
            subject,
            remainingAmount: remaining,
            overageAttempted: false,
            exhaustedAt: now,
          };
          this.eventBus.emit('billing.quota.exhausted' as any, exhaustedEvent);

          throw new QuotaExceededError(
            userId,
            subject,
            amount,
            amount - remaining
          );
        }

        // Try to get overage price for this feature
        const overagePrice = await this.getOveragePrice(tx, subject);

        if (overagePrice === null) {
          // No overage allowed for this feature
          const exhaustedEvent: QuotaExhaustedEvent = {
            userId,
            subject,
            remainingAmount: remaining,
            overageAttempted: true,
            exhaustedAt: now,
          };
          this.eventBus.emit('billing.quota.exhausted' as any, exhaustedEvent);

          throw new QuotaExceededError(
            userId,
            subject,
            amount,
            amount - remaining
          );
        }

        // Calculate overage charge
        overageChargedCents = remaining * overagePrice;

        // Deduct from wallet
        const walletResult = await tx
          .update(wallets)
          .set({
            balanceCents: sql`${wallets.balanceCents} - ${overageChargedCents}`,
            updatedAt: now,
          })
          .where(
            and(
              eq(wallets.userId, userId),
              sql`${wallets.balanceCents} >= ${overageChargedCents}`
            )
          )
          .returning();

        if (walletResult.length === 0) {
          // Wallet doesn't exist or insufficient funds
          const wallet = await tx
            .select()
            .from(wallets)
            .where(eq(wallets.userId, userId))
            .limit(1);

          const available = wallet[0]?.balanceCents ?? 0;

          throw new InsufficientFundsError(
            userId,
            overageChargedCents,
            available
          );
        }

        this.logger.log(
          `Charged ${overageChargedCents} cents from wallet for ${remaining} ${subject} overage`
        );

        remaining = 0;
      }

      // 4. Record usage (immutable audit log)
      await tx.insert(usageRecords).values({
        userId,
        subject,
        amount,
        quotaIds: deductedFrom.map((d) => d.quotaId),
        overageChargedCents: overageChargedCents ?? null,
        occurredAt: now,
        metadata: metadata ?? null,
      });

      // Build result object, only including defined values
      const resultObj: ConsumeQuotaResult = {
        consumed: amount - remaining,
        deductedFrom,
      };
      if (overageChargedCents !== undefined) resultObj.overageChargedCents = overageChargedCents;
      if (remaining > 0) resultObj.remainingUnconsumed = remaining;

      return resultObj;
    });

    // Emit consumed event (outside transaction)
    const consumedEvent: QuotaConsumedEvent = {
      userId,
      subject,
      amount: result.consumed,
      deductedFrom: result.deductedFrom.map((d) => ({
        quotaId: d.quotaId,
        amount: d.amount,
      })),
      consumedAt: new Date(),
      ...(result.overageChargedCents !== undefined && { overageChargedCents: result.overageChargedCents }),
    };

    this.eventBus.emit('billing.quota.consumed' as any, consumedEvent);

    this.logger.log(
      `Consumed ${result.consumed} ${subject} for user ${userId}`
    );

    return result;
  }

  /**
   * Get overage price for a feature (from plan items)
   * Returns null if overage is not allowed
   */
  private async getOveragePrice(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    subject: string
  ): Promise<number | null> {
    // Find a plan item that defines overage price for this feature
    const [item] = await tx
      .select({ overagePriceCents: planItems.overagePriceCents })
      .from(planItems)
      .where(
        and(
          eq(planItems.subject, subject),
          gt(planItems.overagePriceCents, 0)
        )
      )
      .limit(1);

    return item?.overagePriceCents ?? null;
  }

  /**
   * Get usage history for a user
   */
  async getUsageHistory(
    userId: string,
    options?: {
      subject?: string;
      since?: Date;
      until?: Date;
      limit?: number;
      offset?: number;
    }
  ) {
    return this.quotaRepo.getUserUsageRecords(userId, options);
  }

  /**
   * Get total usage for a user in a time window
   */
  async getTotalUsage(
    userId: string,
    subject: string,
    since: Date,
    until: Date = new Date()
  ): Promise<number> {
    return this.quotaRepo.getTotalUsage(userId, subject, since, until);
  }
}
