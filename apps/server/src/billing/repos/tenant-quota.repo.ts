/**
 * Tenant Quota Repository
 *
 * Data access layer for tenant shared quota pools.
 */

import { Injectable, Inject } from '@nestjs/common';
import { eq, and, gt, or, isNull, desc, asc, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  tenantQuotas,
  type TenantQuota,
  type InsertTenantQuota,
  type QuotaSourceType,
} from '../../db/schema/billing';

@Injectable()
export class TenantQuotaRepository {
  constructor(@Inject('DATABASE') private readonly db: Database) {}

  /**
   * Create a new tenant quota bucket
   */
  async create(data: InsertTenantQuota): Promise<TenantQuota> {
    const [quota] = await this.db
      .insert(tenantQuotas)
      .values(data)
      .returning();
    return quota!;
  }

  /**
   * Create or update quota (upsert by source)
   */
  async upsertBySource(data: InsertTenantQuota): Promise<TenantQuota> {
    const [quota] = await this.db
      .insert(tenantQuotas)
      .values(data)
      .onConflictDoUpdate({
        target: [
          tenantQuotas.tenantId,
          tenantQuotas.featureKey,
          tenantQuotas.sourceType,
          tenantQuotas.sourceId,
        ],
        set: {
          balance: data.balance,
          priority: data.priority,
          expiresAt: data.expiresAt,
          metadata: data.metadata,
          updatedAt: new Date(),
        },
      })
      .returning();
    return quota!;
  }

  /**
   * Get all quotas for a tenant
   */
  async getByTenant(tenantId: string): Promise<TenantQuota[]> {
    return this.db
      .select()
      .from(tenantQuotas)
      .where(eq(tenantQuotas.tenantId, tenantId));
  }

  /**
   * Get quotas for a tenant and feature
   */
  async getByTenantAndFeature(
    tenantId: string,
    featureKey: string
  ): Promise<TenantQuota[]> {
    return this.db
      .select()
      .from(tenantQuotas)
      .where(
        and(
          eq(tenantQuotas.tenantId, tenantId),
          eq(tenantQuotas.featureKey, featureKey)
        )
      );
  }

  /**
   * Get active quota buckets for waterfall deduction
   * Sorted by priority DESC, expiresAt ASC (expiring soon first)
   */
  async getActiveForDeduction(
    tenantId: string,
    featureKey: string
  ): Promise<TenantQuota[]> {
    const now = new Date();
    return this.db
      .select()
      .from(tenantQuotas)
      .where(
        and(
          eq(tenantQuotas.tenantId, tenantId),
          eq(tenantQuotas.featureKey, featureKey),
          gt(tenantQuotas.balance, 0),
          or(isNull(tenantQuotas.expiresAt), gt(tenantQuotas.expiresAt, now))
        )
      )
      .orderBy(
        desc(tenantQuotas.priority),
        asc(sql`COALESCE(${tenantQuotas.expiresAt}, '9999-12-31'::timestamp)`)
      );
  }

  /**
   * Get active quota buckets with row lock (for transaction)
   */
  async getActiveForDeductionWithLock(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    tenantId: string,
    featureKey: string
  ): Promise<TenantQuota[]> {
    const now = new Date();
    return tx
      .select()
      .from(tenantQuotas)
      .where(
        and(
          eq(tenantQuotas.tenantId, tenantId),
          eq(tenantQuotas.featureKey, featureKey),
          gt(tenantQuotas.balance, 0),
          or(isNull(tenantQuotas.expiresAt), gt(tenantQuotas.expiresAt, now))
        )
      )
      .orderBy(
        desc(tenantQuotas.priority),
        asc(sql`COALESCE(${tenantQuotas.expiresAt}, '9999-12-31'::timestamp)`)
      )
      .for('update');
  }

  /**
   * Deduct from a quota bucket
   */
  async deduct(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    id: string,
    amount: number,
    expectedBalance: number
  ): Promise<TenantQuota | null> {
    const [updated] = await tx
      .update(tenantQuotas)
      .set({
        balance: sql`${tenantQuotas.balance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantQuotas.id, id),
          eq(tenantQuotas.balance, expectedBalance) // Optimistic lock
        )
      )
      .returning();
    return updated ?? null;
  }

  /**
   * Get total balance for a feature
   */
  async getTotalBalance(tenantId: string, featureKey: string): Promise<number> {
    const now = new Date();
    const result = await this.db
      .select({ total: sql<number>`COALESCE(SUM(${tenantQuotas.balance}), 0)` })
      .from(tenantQuotas)
      .where(
        and(
          eq(tenantQuotas.tenantId, tenantId),
          eq(tenantQuotas.featureKey, featureKey),
          gt(tenantQuotas.balance, 0),
          or(isNull(tenantQuotas.expiresAt), gt(tenantQuotas.expiresAt, now))
        )
      );
    return result[0]?.total ?? 0;
  }

  /**
   * Delete quotas by source (for renewal reset)
   */
  async deleteBySource(
    tenantId: string,
    featureKey: string,
    sourceType: QuotaSourceType,
    sourceIdPattern?: string
  ): Promise<number> {
    let condition = and(
      eq(tenantQuotas.tenantId, tenantId),
      eq(tenantQuotas.featureKey, featureKey),
      eq(tenantQuotas.sourceType, sourceType)
    );

    if (sourceIdPattern) {
      condition = and(
        condition,
        sql`${tenantQuotas.sourceId} LIKE ${sourceIdPattern}`
      );
    }

    const result = await this.db
      .delete(tenantQuotas)
      .where(condition!)
      .returning();
    return result.length;
  }

  /**
   * Delete all quotas for a tenant and feature
   */
  async deleteByTenantAndFeature(
    tenantId: string,
    featureKey: string
  ): Promise<number> {
    const result = await this.db
      .delete(tenantQuotas)
      .where(
        and(
          eq(tenantQuotas.tenantId, tenantId),
          eq(tenantQuotas.featureKey, featureKey)
        )
      )
      .returning();
    return result.length;
  }

  /**
   * Get quota summary by feature for a tenant
   */
  async getQuotaSummary(
    tenantId: string
  ): Promise<Array<{ featureKey: string; totalBalance: number }>> {
    const now = new Date();
    return this.db
      .select({
        featureKey: tenantQuotas.featureKey,
        totalBalance: sql<number>`COALESCE(SUM(${tenantQuotas.balance}), 0)`,
      })
      .from(tenantQuotas)
      .where(
        and(
          eq(tenantQuotas.tenantId, tenantId),
          gt(tenantQuotas.balance, 0),
          or(isNull(tenantQuotas.expiresAt), gt(tenantQuotas.expiresAt, now))
        )
      )
      .groupBy(tenantQuotas.featureKey);
  }
}
