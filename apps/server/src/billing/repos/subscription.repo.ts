/**
 * Subscription Repository
 *
 * Data access layer for plan subscriptions.
 */

import { Injectable, Inject } from '@nestjs/common';
import { eq, and, or, sql, desc, lte } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  planSubscriptions,
  type PlanSubscription,
  type InsertPlanSubscription,
  type SubscriptionStatus,
} from '@wordrhyme/db';

@Injectable()
export class SubscriptionRepository {
  constructor(@Inject('DATABASE') private readonly db: Database) {}

  /**
   * Create a new subscription
   */
  async create(data: InsertPlanSubscription): Promise<PlanSubscription> {
    const [subscription] = await this.db
      .insert(planSubscriptions)
      .values(data)
      .returning();
    return subscription!;
  }

  /**
   * Get subscription by ID
   */
  async getById(id: string): Promise<PlanSubscription | null> {
    const [subscription] = await this.db
      .select()
      .from(planSubscriptions)
      .where(eq(planSubscriptions.id, id))
      .limit(1);
    return subscription ?? null;
  }

  /**
   * Get subscription by ID with row lock (for updates)
   */
  async getByIdForUpdate(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    id: string
  ): Promise<PlanSubscription | null> {
    const [subscription] = await tx
      .select()
      .from(planSubscriptions)
      .where(eq(planSubscriptions.id, id))
      .for('update');
    return subscription ?? null;
  }

  /**
   * Get active subscriptions for a tenant
   */
  async getActiveByTenant(organizationId: string): Promise<PlanSubscription[]> {
    return this.db
      .select()
      .from(planSubscriptions)
      .where(
        and(
          eq(planSubscriptions.organizationId, organizationId),
          or(
            eq(planSubscriptions.status, 'active'),
            eq(planSubscriptions.status, 'trialing')
          )
        )
      );
  }

  /**
   * Get all subscriptions for a tenant (including inactive)
   */
  async getAllByTenant(organizationId: string): Promise<PlanSubscription[]> {
    return this.db
      .select()
      .from(planSubscriptions)
      .where(eq(planSubscriptions.organizationId, organizationId))
      .orderBy(desc(planSubscriptions.createdAt));
  }

  /**
   * Get subscription by external ID
   */
  async getByExternalId(externalId: string): Promise<PlanSubscription | null> {
    const [subscription] = await this.db
      .select()
      .from(planSubscriptions)
      .where(eq(planSubscriptions.externalSubscriptionId, externalId))
      .limit(1);
    return subscription ?? null;
  }

  /**
   * Update subscription status
   */
  async updateStatus(
    id: string,
    status: SubscriptionStatus,
    extra?: Partial<{
      canceledAt: Date;
      cancelReason: string;
      cancelAtPeriodEnd: number;
      metadata: Record<string, unknown>;
    }>
  ): Promise<PlanSubscription | null> {
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (extra?.canceledAt !== undefined) updateData['canceledAt'] = extra.canceledAt;
    if (extra?.cancelReason !== undefined) updateData['cancelReason'] = extra.cancelReason;
    if (extra?.cancelAtPeriodEnd !== undefined) updateData['cancelAtPeriodEnd'] = extra.cancelAtPeriodEnd;
    if (extra?.metadata !== undefined) updateData['metadata'] = extra.metadata;

    const [updated] = await this.db
      .update(planSubscriptions)
      .set(updateData)
      .where(eq(planSubscriptions.id, id))
      .returning();
    return updated ?? null;
  }

  /**
   * Update subscription with optimistic locking
   */
  async updateWithVersion(
    id: string,
    expectedVersion: number,
    data: Partial<Omit<PlanSubscription, 'id' | 'createdAt'>>
  ): Promise<PlanSubscription | null> {
    const [updated] = await this.db
      .update(planSubscriptions)
      .set({
        ...data,
        version: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(planSubscriptions.id, id),
          eq(planSubscriptions.version, expectedVersion)
        )
      )
      .returning();
    return updated ?? null;
  }

  /**
   * Extend subscription period (for renewal)
   */
  async extendPeriod(
    id: string,
    expectedVersion: number,
    newPeriodStart: Date,
    newPeriodEnd: Date,
    transactionId?: string
  ): Promise<PlanSubscription | null> {
    const updateData: Record<string, unknown> = {
      currentPeriodStart: newPeriodStart,
      currentPeriodEnd: newPeriodEnd,
      renewalCount: sql`${planSubscriptions.renewalCount} + 1`,
      lastRenewalAt: new Date(),
      version: expectedVersion + 1,
      updatedAt: new Date(),
    };

    if (transactionId) {
      updateData['latestTransactionId'] = transactionId;
    }

    const [updated] = await this.db
      .update(planSubscriptions)
      .set(updateData)
      .where(
        and(
          eq(planSubscriptions.id, id),
          eq(planSubscriptions.version, expectedVersion)
        )
      )
      .returning();
    return updated ?? null;
  }

  /**
   * Schedule a plan change
   */
  async schedulePlanChange(
    id: string,
    newPlanId: string,
    changeAt: Date
  ): Promise<PlanSubscription | null> {
    const [updated] = await this.db
      .update(planSubscriptions)
      .set({
        scheduledPlanId: newPlanId,
        scheduledChangeAt: changeAt,
        updatedAt: new Date(),
      })
      .where(eq(planSubscriptions.id, id))
      .returning();
    return updated ?? null;
  }

  /**
   * Apply scheduled plan change
   */
  async applyPlanChange(
    id: string,
    expectedVersion: number
  ): Promise<PlanSubscription | null> {
    // First get the subscription to read scheduledPlanId
    const subscription = await this.getById(id);
    if (!subscription?.scheduledPlanId) return null;

    const [updated] = await this.db
      .update(planSubscriptions)
      .set({
        planId: subscription.scheduledPlanId,
        scheduledPlanId: null,
        scheduledChangeAt: null,
        version: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(planSubscriptions.id, id),
          eq(planSubscriptions.version, expectedVersion)
        )
      )
      .returning();
    return updated ?? null;
  }

  /**
   * Find subscriptions expiring before a given date
   */
  async findExpiring(before: Date): Promise<PlanSubscription[]> {
    return this.db
      .select()
      .from(planSubscriptions)
      .where(
        and(
          eq(planSubscriptions.status, 'active'),
          lte(planSubscriptions.currentPeriodEnd, before)
        )
      );
  }

  /**
   * Find subscriptions with scheduled plan changes ready to apply
   */
  async findReadyForPlanChange(before: Date): Promise<PlanSubscription[]> {
    return this.db
      .select()
      .from(planSubscriptions)
      .where(
        and(
          eq(planSubscriptions.status, 'active'),
          sql`${planSubscriptions.scheduledPlanId} IS NOT NULL`,
          lte(planSubscriptions.scheduledChangeAt, before)
        )
      );
  }
}
