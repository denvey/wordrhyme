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

  async create(data: InsertTenantQuota): Promise<TenantQuota> {
    const [quota] = await this.db
      .insert(tenantQuotas)
      .values(data)
      .returning();
    return quota!;
  }

  async upsertBySource(data: InsertTenantQuota): Promise<TenantQuota> {
    const [quota] = await this.db
      .insert(tenantQuotas)
      .values(data)
      .onConflictDoUpdate({
        target: [
          tenantQuotas.organizationId,
          tenantQuotas.subject,
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

  async getByTenant(organizationId: string): Promise<TenantQuota[]> {
    return this.db
      .select()
      .from(tenantQuotas)
      .where(eq(tenantQuotas.organizationId, organizationId));
  }

  async getByTenantAndSubject(
    organizationId: string,
    subject: string
  ): Promise<TenantQuota[]> {
    return this.db
      .select()
      .from(tenantQuotas)
      .where(
        and(
          eq(tenantQuotas.organizationId, organizationId),
          eq(tenantQuotas.subject, subject)
        )
      );
  }

  async getActiveForDeduction(
    organizationId: string,
    subject: string
  ): Promise<TenantQuota[]> {
    const now = new Date();
    return this.db
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
      );
  }

  async getActiveForDeductionWithLock(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    organizationId: string,
    subject: string
  ): Promise<TenantQuota[]> {
    const now = new Date();
    return tx
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
  }

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
          eq(tenantQuotas.balance, expectedBalance)
        )
      )
      .returning();
    return updated ?? null;
  }

  async getTotalBalance(organizationId: string, subject: string): Promise<number> {
    const now = new Date();
    const result = await this.db
      .select({ total: sql<number>`COALESCE(SUM(${tenantQuotas.balance}), 0)` })
      .from(tenantQuotas)
      .where(
        and(
          eq(tenantQuotas.organizationId, organizationId),
          eq(tenantQuotas.subject, subject),
          gt(tenantQuotas.balance, 0),
          or(isNull(tenantQuotas.expiresAt), gt(tenantQuotas.expiresAt, now))
        )
      );
    return result[0]?.total ?? 0;
  }

  async deleteBySource(
    organizationId: string,
    subject: string,
    sourceType: QuotaSourceType,
    sourceIdPattern?: string
  ): Promise<number> {
    let condition = and(
      eq(tenantQuotas.organizationId, organizationId),
      eq(tenantQuotas.subject, subject),
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

  async deleteByTenantAndSubject(
    organizationId: string,
    subject: string
  ): Promise<number> {
    const result = await this.db
      .delete(tenantQuotas)
      .where(
        and(
          eq(tenantQuotas.organizationId, organizationId),
          eq(tenantQuotas.subject, subject)
        )
      )
      .returning();
    return result.length;
  }

  async getQuotaSummary(
    organizationId: string
  ): Promise<Array<{ subject: string; totalBalance: number }>> {
    const now = new Date();
    return this.db
      .select({
        subject: tenantQuotas.subject,
        totalBalance: sql<number>`COALESCE(SUM(${tenantQuotas.balance}), 0)`,
      })
      .from(tenantQuotas)
      .where(
        and(
          eq(tenantQuotas.organizationId, organizationId),
          gt(tenantQuotas.balance, 0),
          or(isNull(tenantQuotas.expiresAt), gt(tenantQuotas.expiresAt, now))
        )
      )
      .groupBy(tenantQuotas.subject);
  }
}
