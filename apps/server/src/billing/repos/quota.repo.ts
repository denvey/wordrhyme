/**
 * Quota Repository
 *
 * Data access layer for user quotas and usage records.
 * Handles quota bucket queries with proper sorting for waterfall deduction.
 */

import { Injectable, Inject } from '@nestjs/common';
import { eq, and, gt, or, isNull, desc, asc, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  userQuotas,
  wallets,
  usageRecords,
  type UserQuota,
  type InsertUserQuota,
  type Wallet,
  type UsageRecord,
  type InsertUsageRecord,
} from '../../db/schema/billing';

@Injectable()
export class QuotaRepository {
  constructor(@Inject('DATABASE') private readonly db: Database) {}

  // ============================================================================
  // User Quotas
  // ============================================================================

  /**
   * Create a new quota bucket for a user
   */
  async createQuota(data: InsertUserQuota): Promise<UserQuota> {
    const [quota] = await this.db
      .insert(userQuotas)
      .values(data)
      .returning();
    return quota!;
  }

  /**
   * Get all active quota buckets for a user and feature
   * Sorted by priority DESC, expiresAt ASC (for waterfall deduction)
   */
  async getActiveQuotas(
    userId: string,
    featureKey: string
  ): Promise<UserQuota[]> {
    const now = new Date();

    return this.db
      .select()
      .from(userQuotas)
      .where(
        and(
          eq(userQuotas.userId, userId),
          eq(userQuotas.featureKey, featureKey),
          gt(userQuotas.balance, 0),
          or(
            isNull(userQuotas.expiresAt),
            gt(userQuotas.expiresAt, now)
          )
        )
      )
      .orderBy(
        desc(userQuotas.priority),
        asc(sql`COALESCE(${userQuotas.expiresAt}, '9999-12-31'::timestamp)`)
      );
  }

  /**
   * Get all quota buckets for a user (including exhausted/expired)
   */
  async getAllUserQuotas(userId: string): Promise<UserQuota[]> {
    return this.db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.userId, userId))
      .orderBy(desc(userQuotas.priority), desc(userQuotas.createdAt));
  }

  /**
   * Get quota buckets by feature key for a user
   */
  async getUserQuotasByFeature(
    userId: string,
    featureKey: string
  ): Promise<UserQuota[]> {
    return this.db
      .select()
      .from(userQuotas)
      .where(
        and(
          eq(userQuotas.userId, userId),
          eq(userQuotas.featureKey, featureKey)
        )
      )
      .orderBy(desc(userQuotas.priority), desc(userQuotas.createdAt));
  }

  /**
   * Deduct balance from a quota bucket
   * Returns the updated quota or undefined if not found
   */
  async deductBalance(
    quotaId: string,
    amount: number
  ): Promise<UserQuota | undefined> {
    const [quota] = await this.db
      .update(userQuotas)
      .set({
        balance: sql`${userQuotas.balance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userQuotas.id, quotaId),
          gt(userQuotas.balance, 0)
        )
      )
      .returning();
    return quota;
  }

  /**
   * Get a quota by source (for idempotency checks)
   */
  async getQuotaBySource(
    userId: string,
    featureKey: string,
    sourceType: string,
    sourceId: string
  ): Promise<UserQuota | undefined> {
    const [quota] = await this.db
      .select()
      .from(userQuotas)
      .where(
        and(
          eq(userQuotas.userId, userId),
          eq(userQuotas.featureKey, featureKey),
          eq(userQuotas.sourceType, sourceType as UserQuota['sourceType']),
          eq(userQuotas.sourceId, sourceId)
        )
      )
      .limit(1);
    return quota;
  }

  /**
   * Get total available balance for a user and feature
   */
  async getTotalBalance(userId: string, featureKey: string): Promise<number> {
    const quotas = await this.getActiveQuotas(userId, featureKey);
    return quotas.reduce((sum, q) => sum + q.balance, 0);
  }

  // ============================================================================
  // Wallets
  // ============================================================================

  /**
   * Get or create a wallet for a user
   */
  async getOrCreateWallet(userId: string, currency = 'usd'): Promise<Wallet> {
    const [existing] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);

    if (existing) return existing;

    const [wallet] = await this.db
      .insert(wallets)
      .values({ userId, currency, balanceCents: 0 })
      .onConflictDoNothing()
      .returning();

    // Handle race condition - if insert failed, fetch again
    if (!wallet) {
      const [fetched] = await this.db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1);
      return fetched!;
    }

    return wallet;
  }

  /**
   * Get wallet balance
   */
  async getWallet(userId: string): Promise<Wallet | undefined> {
    const [wallet] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);
    return wallet;
  }

  /**
   * Add funds to wallet
   */
  async addToWallet(userId: string, amountCents: number): Promise<Wallet> {
    const wallet = await this.getOrCreateWallet(userId);

    const [updated] = await this.db
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} + ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, userId))
      .returning();

    return updated ?? wallet;
  }

  /**
   * Deduct from wallet (for overage charges)
   * Returns updated wallet or throws if insufficient funds
   */
  async deductFromWallet(
    userId: string,
    amountCents: number
  ): Promise<Wallet | undefined> {
    const [wallet] = await this.db
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} - ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(wallets.userId, userId),
          sql`${wallets.balanceCents} >= ${amountCents}`
        )
      )
      .returning();

    return wallet;
  }

  // ============================================================================
  // Usage Records (Immutable Audit Log)
  // ============================================================================

  /**
   * Create a usage record (append-only)
   */
  async createUsageRecord(data: InsertUsageRecord): Promise<UsageRecord> {
    const [record] = await this.db
      .insert(usageRecords)
      .values(data)
      .returning();
    return record!;
  }

  /**
   * Get usage records for a user
   */
  async getUserUsageRecords(
    userId: string,
    options?: {
      featureKey?: string;
      since?: Date;
      until?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<UsageRecord[]> {
    const conditions = [eq(usageRecords.userId, userId)];

    if (options?.featureKey) {
      conditions.push(eq(usageRecords.featureKey, options.featureKey));
    }
    if (options?.since) {
      conditions.push(gt(usageRecords.occurredAt, options.since));
    }
    if (options?.until) {
      conditions.push(sql`${usageRecords.occurredAt} <= ${options.until}`);
    }

    let query = this.db
      .select()
      .from(usageRecords)
      .where(and(...conditions))
      .orderBy(desc(usageRecords.occurredAt));

    if (options?.limit) {
      query = query.limit(options.limit) as typeof query;
    }
    if (options?.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    return query;
  }

  /**
   * Get total usage for a user and feature in a time window
   */
  async getTotalUsage(
    userId: string,
    featureKey: string,
    since: Date,
    until: Date = new Date()
  ): Promise<number> {
    const [result] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${usageRecords.amount}), 0)`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.userId, userId),
          eq(usageRecords.featureKey, featureKey),
          gt(usageRecords.occurredAt, since),
          sql`${usageRecords.occurredAt} <= ${until}`
        )
      );

    return result?.total ?? 0;
  }
}
