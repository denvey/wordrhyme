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

  async createQuota(data: InsertUserQuota): Promise<UserQuota> {
    const [quota] = await this.db
      .insert(userQuotas)
      .values(data)
      .returning();
    return quota!;
  }

  async getActiveQuotas(
    userId: string,
    subject: string
  ): Promise<UserQuota[]> {
    const now = new Date();

    return this.db
      .select()
      .from(userQuotas)
      .where(
        and(
          eq(userQuotas.userId, userId),
          eq(userQuotas.subject, subject),
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

  async getAllUserQuotas(userId: string): Promise<UserQuota[]> {
    return this.db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.userId, userId))
      .orderBy(desc(userQuotas.priority), desc(userQuotas.createdAt));
  }

  async getUserQuotasBySubject(
    userId: string,
    subject: string
  ): Promise<UserQuota[]> {
    return this.db
      .select()
      .from(userQuotas)
      .where(
        and(
          eq(userQuotas.userId, userId),
          eq(userQuotas.subject, subject)
        )
      )
      .orderBy(desc(userQuotas.priority), desc(userQuotas.createdAt));
  }

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

  async getQuotaBySource(
    userId: string,
    subject: string,
    sourceType: string,
    sourceId: string
  ): Promise<UserQuota | undefined> {
    const [quota] = await this.db
      .select()
      .from(userQuotas)
      .where(
        and(
          eq(userQuotas.userId, userId),
          eq(userQuotas.subject, subject),
          eq(userQuotas.sourceType, sourceType as UserQuota['sourceType']),
          eq(userQuotas.sourceId, sourceId)
        )
      )
      .limit(1);
    return quota;
  }

  async getTotalBalance(userId: string, subject: string): Promise<number> {
    const quotas = await this.getActiveQuotas(userId, subject);
    return quotas.reduce((sum, q) => sum + q.balance, 0);
  }

  // ============================================================================
  // Wallets
  // ============================================================================

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

  async getWallet(userId: string): Promise<Wallet | undefined> {
    const [wallet] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);
    return wallet;
  }

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

  async createUsageRecord(data: InsertUsageRecord): Promise<UsageRecord> {
    const [record] = await this.db
      .insert(usageRecords)
      .values(data)
      .returning();
    return record!;
  }

  async getUserUsageRecords(
    userId: string,
    options?: {
      subject?: string;
      since?: Date;
      until?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<UsageRecord[]> {
    const conditions = [eq(usageRecords.userId, userId)];

    if (options?.subject) {
      conditions.push(eq(usageRecords.subject, options.subject));
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

  async getTotalUsage(
    userId: string,
    subject: string,
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
          eq(usageRecords.subject, subject),
          gt(usageRecords.occurredAt, since),
          sql`${usageRecords.occurredAt} <= ${until}`
        )
      );

    return result?.total ?? 0;
  }
}
