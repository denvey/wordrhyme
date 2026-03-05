/**
 * Unified Usage Service
 *
 * Handles quota consumption with dual-dimension waterfall deduction:
 * 1. Tenant shared quotas (higher priority)
 * 2. User personal quotas (lower priority)
 *
 * This is the authoritative consumption engine, replacing the legacy UsageService.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { eq, and, gt, or, isNull, desc, asc, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { TenantQuotaRepository } from '../repos/tenant-quota.repo';
import { QuotaRepository } from '../repos/quota.repo';
import { EventBus } from '../../events/event-bus';
import {
  tenantQuotas,
  userQuotas,
  wallets,
  usageRecords,
  planItems,
} from '../../db/schema/billing';

/**
 * Parameters for consuming quota
 */
export interface UnifiedConsumeInput {
  organizationId: string;
  userId: string;
  subject: string;
  amount: number;
  /** Whether to allow overage charges from wallet */
  allowOverage?: boolean;
  /** Metadata for the usage record */
  metadata?: Record<string, unknown>;
}

/**
 * Deduction breakdown entry
 */
export interface DeductionEntry {
  quotaId: string;
  amount: number;
  priority: number;
  scope: 'tenant' | 'user';
}

/**
 * Result of quota consumption
 */
export interface UnifiedConsumeResult {
  /** Total amount consumed */
  consumed: number;
  /** Details of which buckets were deducted */
  deductedFrom: DeductionEntry[];
  /** Amount charged from wallet as overage (if any) */
  overageChargedCents?: number;
  /** Remaining amount that could not be consumed (if any) */
  remainingUnconsumed?: number;
}

/**
 * Error thrown when quota is exhausted (unified version with organizationId)
 */
export class UnifiedQuotaExceededError extends Error {
  constructor(
    public readonly organizationId: string,
    public readonly userId: string,
    public readonly subject: string,
    public readonly requested: number,
    public readonly available: number
  ) {
    super(
      `Quota exceeded for ${subject}: requested ${requested}, available ${available}`
    );
    this.name = 'UnifiedQuotaExceededError';
  }
}

/**
 * Error thrown when wallet has insufficient funds for overage (unified version)
 */
export class UnifiedInsufficientFundsError extends Error {
  constructor(
    public readonly userId: string,
    public readonly required: number,
    public readonly available: number
  ) {
    super(
      `Insufficient wallet funds: required ${required} cents, available ${available} cents`
    );
    this.name = 'UnifiedInsufficientFundsError';
  }
}

@Injectable()
export class UnifiedUsageService {
  private readonly logger = new Logger(UnifiedUsageService.name);

  constructor(
    @Inject('DATABASE') private readonly db: Database,
    private readonly tenantQuotaRepo: TenantQuotaRepository,
    private readonly quotaRepo: QuotaRepository,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Consume quota using dual-dimension waterfall deduction
   *
   * Algorithm:
   * 1. Set transaction isolation and acquire locks
   * 2. Fetch and deduct from Tenant shared quotas (priority DESC, expiresAt ASC)
   * 3. If remaining, fetch and deduct from User personal quotas
   * 4. If still remaining and allowOverage=true, charge wallet
   * 5. Record the usage event (immutable audit log)
   *
   * All operations are wrapped in a transaction for atomicity.
   */
  async consume(input: UnifiedConsumeInput): Promise<UnifiedConsumeResult> {
    const {
      organizationId,
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

      let remaining = amount;
      const deductedFrom: DeductionEntry[] = [];

      // ========================================
      // Step 1: Deduct from Tenant shared quotas
      // ========================================
      const tenantBuckets = await tx
        .select()
        .from(tenantQuotas)
        .where(
          and(
            eq(tenantQuotas.organizationId, organizationId),
            eq(tenantQuotas.subject, subject),
            gt(tenantQuotas.balance, 0),
            or(isNull(tenantQuotas.expiresAt), gt(tenantQuotas.expiresAt, now))
          )
        )
        .orderBy(
          desc(tenantQuotas.priority),
          asc(sql`COALESCE(${tenantQuotas.expiresAt}, '9999-12-31'::timestamp)`)
        )
        .for('update');

      for (const bucket of tenantBuckets) {
        if (remaining <= 0) break;

        const deductAmount = Math.min(remaining, bucket.balance);

        const [updated] = await tx
          .update(tenantQuotas)
          .set({
            balance: sql`${tenantQuotas.balance} - ${deductAmount}`,
            updatedAt: now,
          })
          .where(
            and(
              eq(tenantQuotas.id, bucket.id),
              eq(tenantQuotas.balance, bucket.balance) // Optimistic lock
            )
          )
          .returning();

        if (!updated) {
          throw new Error(
            `Concurrent modification detected for tenant quota bucket ${bucket.id}. Please retry.`
          );
        }

        deductedFrom.push({
          quotaId: bucket.id,
          amount: deductAmount,
          priority: bucket.priority,
          scope: 'tenant',
        });

        remaining -= deductAmount;

        this.logger.debug(
          `[Tenant:${organizationId}] Deducted ${deductAmount} from tenant bucket ${bucket.id}`
        );
      }

      // ========================================
      // Step 2: Deduct from User personal quotas
      // ========================================
      if (remaining > 0) {
        const userBuckets = await tx
          .select()
          .from(userQuotas)
          .where(
            and(
              eq(userQuotas.userId, userId),
              eq(userQuotas.subject, subject),
              gt(userQuotas.balance, 0),
              or(isNull(userQuotas.expiresAt), gt(userQuotas.expiresAt, now)),
              // Tenant isolation for user quotas
              or(isNull(userQuotas.organizationId), eq(userQuotas.organizationId, organizationId))
            )
          )
          .orderBy(
            desc(userQuotas.priority),
            asc(sql`COALESCE(${userQuotas.expiresAt}, '9999-12-31'::timestamp)`)
          )
          .for('update');

        for (const bucket of userBuckets) {
          if (remaining <= 0) break;

          const deductAmount = Math.min(remaining, bucket.balance);

          const [updated] = await tx
            .update(userQuotas)
            .set({
              balance: sql`${userQuotas.balance} - ${deductAmount}`,
              updatedAt: now,
            })
            .where(
              and(
                eq(userQuotas.id, bucket.id),
                eq(userQuotas.balance, bucket.balance) // Optimistic lock
              )
            )
            .returning();

          if (!updated) {
            throw new Error(
              `Concurrent modification detected for user quota bucket ${bucket.id}. Please retry.`
            );
          }

          deductedFrom.push({
            quotaId: bucket.id,
            amount: deductAmount,
            priority: bucket.priority,
            scope: 'user',
          });

          remaining -= deductAmount;

          this.logger.debug(
            `[User:${userId}] Deducted ${deductAmount} from user bucket ${bucket.id}`
          );
        }
      }

      // ========================================
      // Step 3: Handle overage
      // ========================================
      let overageChargedCents: number | undefined;

      if (remaining > 0) {
        if (!allowOverage) {
          this.eventBus.emit('billing.quota.exhausted' as any, {
            organizationId,
            userId,
            subject,
            remainingAmount: remaining,
            overageAttempted: false,
            exhaustedAt: now,
          });

          throw new UnifiedQuotaExceededError(
            organizationId,
            userId,
            subject,
            amount,
            amount - remaining
          );
        }

        // Try to get overage price for this feature
        const overagePrice = await this.getOveragePrice(tx, subject);

        if (overagePrice === null) {
          this.eventBus.emit('billing.quota.exhausted' as any, {
            organizationId,
            userId,
            subject,
            remainingAmount: remaining,
            overageAttempted: true,
            exhaustedAt: now,
          });

          throw new UnifiedQuotaExceededError(
            organizationId,
            userId,
            subject,
            amount,
            amount - remaining
          );
        }

        // Calculate overage charge
        overageChargedCents = remaining * overagePrice;

        // Deduct from wallet (using userId for wallet - could be organizationId for B2B)
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
          const wallet = await tx
            .select()
            .from(wallets)
            .where(eq(wallets.userId, userId))
            .limit(1);

          const available = wallet[0]?.balanceCents ?? 0;

          throw new UnifiedInsufficientFundsError(userId, overageChargedCents, available);
        }

        this.logger.log(
          `Charged ${overageChargedCents} cents from wallet for ${remaining} ${subject} overage`
        );

        remaining = 0;
      }

      // ========================================
      // Step 4: Record usage (immutable audit log)
      // ========================================
      await tx.insert(usageRecords).values({
        userId,
        subject,
        amount,
        quotaIds: deductedFrom.map((d) => d.quotaId),
        overageChargedCents: overageChargedCents ?? null,
        occurredAt: now,
        metadata: {
          ...metadata,
          organizationId,
          deductionBreakdown: deductedFrom,
        },
      });

      // Build result
      const resultObj: UnifiedConsumeResult = {
        consumed: amount - remaining,
        deductedFrom,
      };
      if (overageChargedCents !== undefined) {
        resultObj.overageChargedCents = overageChargedCents;
      }
      if (remaining > 0) {
        resultObj.remainingUnconsumed = remaining;
      }

      return resultObj;
    });

    // Emit consumed event (outside transaction)
    this.eventBus.emit('billing.quota.consumed' as any, {
      organizationId,
      userId,
      subject,
      amount: result.consumed,
      deductedFrom: result.deductedFrom,
      consumedAt: new Date(),
      ...(result.overageChargedCents !== undefined && {
        overageChargedCents: result.overageChargedCents,
      }),
    });

    this.logger.log(
      `Consumed ${result.consumed} ${subject} for tenant ${organizationId}, user ${userId}`
    );

    return result;
  }

  /**
   * Get overage price for a feature (from plan items)
   */
  private async getOveragePrice(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    subject: string
  ): Promise<number | null> {
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
   * Get combined quota balance for a feature (tenant + user)
   */
  async getCombinedBalance(
    organizationId: string,
    userId: string,
    subject: string
  ): Promise<{ tenant: number; user: number; total: number }> {
    const tenantBalance = await this.tenantQuotaRepo.getTotalBalance(
      organizationId,
      subject
    );

    const userBalance = await this.quotaRepo.getTotalBalance(
      userId,
      subject
    );

    return {
      tenant: tenantBalance,
      user: userBalance,
      total: tenantBalance + userBalance,
    };
  }

  /**
   * Check if user has sufficient quota
   */
  async hasQuota(
    organizationId: string,
    userId: string,
    subject: string,
    required: number
  ): Promise<boolean> {
    const balance = await this.getCombinedBalance(organizationId, userId, subject);
    return balance.total >= required;
  }
}
