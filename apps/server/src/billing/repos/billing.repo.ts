/**
 * Billing Repository
 *
 * Data access layer for billing-related tables.
 * Handles transactions, plans, and related queries.
 */

import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  plans,
  planItems,
  planSubscriptions,
  capabilities,
  transactions,
  type Plan,
  type InsertPlan,
  type PlanItem,
  type InsertPlanItem,
  type Capability,
  type InsertCapability,
  type CapabilityStatus,
  type Transaction,
  type InsertTransaction,
  type TransactionStatus,
} from '../../db/schema/billing';

@Injectable()
export class BillingRepository {
  constructor(@Inject('DATABASE') private readonly db: Database) {}

  // ============================================================================
  // Plans
  // ============================================================================

  async createPlan(data: InsertPlan): Promise<Plan> {
    const [plan] = await this.db
      .insert(plans)
      .values(data)
      .returning();
    return plan!;
  }

  async getPlanById(id: string): Promise<Plan | undefined> {
    const [plan] = await this.db
      .select()
      .from(plans)
      .where(eq(plans.id, id))
      .limit(1);
    return plan;
  }

  async getActivePlans(): Promise<Plan[]> {
    return this.db
      .select()
      .from(plans)
      .where(eq(plans.isActive, 1))
      .orderBy(desc(plans.createdAt));
  }

  async getAllPlans(): Promise<Plan[]> {
    return this.db
      .select()
      .from(plans)
      .orderBy(desc(plans.createdAt));
  }

  async updatePlan(
    id: string,
    data: Partial<Omit<InsertPlan, 'id'>>
  ): Promise<Plan | undefined> {
    const [plan] = await this.db
      .update(plans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    return plan;
  }

  async softDeletePlan(id: string): Promise<Plan | undefined> {
    const [plan] = await this.db
      .update(plans)
      .set({ isActive: 0, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    return plan;
  }

  async hasActiveSubscriptions(planId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(planSubscriptions)
      .where(
        and(
          eq(planSubscriptions.planId, planId),
          inArray(planSubscriptions.status, ['active', 'trialing', 'past_due'])
        )
      );
    return (row?.count ?? 0) > 0;
  }

  // ============================================================================
  // Capabilities
  // ============================================================================

  async upsertCapability(data: InsertCapability): Promise<Capability> {
    const [cap] = await this.db
      .insert(capabilities)
      .values(data)
      .onConflictDoUpdate({
        target: [capabilities.subject],
        set: {
          type: data.type,
          unit: data.unit,
          description: data.description,
        },
      })
      .returning();
    return cap!;
  }

  async getCapabilityBySubject(subject: string): Promise<Capability | undefined> {
    const [cap] = await this.db
      .select()
      .from(capabilities)
      .where(eq(capabilities.subject, subject))
      .limit(1);
    return cap;
  }

  async listCapabilities(options?: {
    status?: CapabilityStatus;
    source?: 'core' | 'plugin';
  }): Promise<Capability[]> {
    const conditions = [];
    if (options?.status) conditions.push(eq(capabilities.status, options.status));
    if (options?.source) conditions.push(eq(capabilities.source, options.source));

    return this.db
      .select()
      .from(capabilities)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(capabilities.source, capabilities.subject);
  }

  async updateCapabilityStatus(
    subject: string,
    status: CapabilityStatus
  ): Promise<Capability | undefined> {
    const [cap] = await this.db
      .update(capabilities)
      .set({ status })
      .where(eq(capabilities.subject, subject))
      .returning();
    return cap;
  }

  async isCapabilityReferencedByPlanItem(subject: string): Promise<boolean> {
    const [row] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(planItems)
      .where(eq(planItems.subject, subject));
    return (row?.count ?? 0) > 0;
  }

  async deleteCapability(subject: string): Promise<boolean> {
    const result = await this.db
      .delete(capabilities)
      .where(eq(capabilities.subject, subject))
      .returning();
    return result.length > 0;
  }

  async seedCoreCapabilities(coreCapabilities: Array<{
    subject: string;
    type: 'boolean' | 'metered';
    unit?: string;
    description?: string;
  }>): Promise<void> {
    for (const cap of coreCapabilities) {
      await this.db
        .insert(capabilities)
        .values({
          subject: cap.subject,
          type: cap.type,
          unit: cap.unit ?? null,
          description: cap.description ?? null,
          source: 'core',
          pluginId: null,
          status: 'approved',
        })
        .onConflictDoNothing();
    }
  }

  async registerPluginCapability(data: {
    subject: string;
    type: 'boolean' | 'metered';
    unit?: string;
    description?: string;
    pluginId: string;
  }): Promise<void> {
    await this.db
      .insert(capabilities)
      .values({
        subject: data.subject,
        type: data.type,
        unit: data.unit ?? null,
        description: data.description ?? null,
        source: 'plugin',
        pluginId: data.pluginId,
        status: 'pending',
      })
      .onConflictDoNothing();
  }


  /**
   * Check if a tenant has an active subscription that includes a boolean capability.
   * Uses a single SQL query joining plan_subscriptions → plan_items.
   * Includes 'canceled' subscriptions that haven't reached period end yet
   * (cancelAtPeriodEnd = true, but period not expired).
   */
  async hasBooleanEntitlement(
    organizationId: string,
    subject: string
  ): Promise<boolean> {
    const now = new Date();
    const [row] = await this.db
      .select({ found: sql<number>`1` })
      .from(planSubscriptions)
      .innerJoin(planItems, eq(planItems.planId, planSubscriptions.planId))
      .where(
        and(
          eq(planSubscriptions.organizationId, organizationId),
          eq(planItems.subject, subject),
          eq(planItems.type, 'boolean'),
          sql`(
            ${planSubscriptions.status} IN ('active', 'trialing')
            OR (
              ${planSubscriptions.status} = 'canceled'
              AND ${planSubscriptions.cancelAtPeriodEnd} = 1
              AND ${planSubscriptions.currentPeriodEnd} > ${now}
            )
          )`
        )
      )
      .limit(1);
    return !!row;
  }

  // ============================================================================
  // Plan Items
  // ============================================================================

  async createPlanItem(data: InsertPlanItem): Promise<PlanItem> {
    const [item] = await this.db
      .insert(planItems)
      .values(data)
      .returning();
    return item!;
  }

  async getPlanItems(planId: string): Promise<PlanItem[]> {
    return this.db
      .select()
      .from(planItems)
      .where(eq(planItems.planId, planId))
      .orderBy(desc(planItems.priority));
  }

  async getPlanWithItems(planId: string): Promise<{
    plan: Plan;
    items: PlanItem[];
  } | null> {
    const plan = await this.getPlanById(planId);
    if (!plan) return null;

    const items = await this.getPlanItems(planId);
    return { plan, items };
  }

  async updatePlanItem(
    id: string,
    data: Partial<Omit<InsertPlanItem, 'id'>>
  ): Promise<PlanItem | undefined> {
    const [item] = await this.db
      .update(planItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(planItems.id, id))
      .returning();
    return item;
  }

  async deletePlanItem(id: string): Promise<boolean> {
    const result = await this.db
      .delete(planItems)
      .where(eq(planItems.id, id))
      .returning();
    return result.length > 0;
  }

  // ============================================================================
  // Transactions
  // ============================================================================

  async createTransaction(data: InsertTransaction): Promise<Transaction> {
    const [tx] = await this.db
      .insert(transactions)
      .values(data)
      .returning();
    return tx!;
  }

  async getTransactionById(id: string): Promise<Transaction | undefined> {
    const [tx] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);
    return tx;
  }

  async getTransactionByExternalId(
    externalId: string
  ): Promise<Transaction | undefined> {
    const [tx] = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.externalId, externalId))
      .limit(1);
    return tx;
  }

  async updateTransactionStatus(
    id: string,
    status: TransactionStatus,
    extra?: { paidAt?: Date; metadata?: Record<string, unknown> }
  ): Promise<Transaction | undefined> {
    const [tx] = await this.db
      .update(transactions)
      .set({
        status,
        updatedAt: new Date(),
        ...(extra?.paidAt && { paidAt: extra.paidAt }),
        ...(extra?.metadata && {
          metadata: sql`COALESCE(${transactions.metadata}, '{}'::jsonb) || ${JSON.stringify(extra.metadata)}::jsonb`,
        }),
      })
      .where(eq(transactions.id, id))
      .returning();
    return tx;
  }

  async getUserTransactions(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Transaction[]> {
    let query = this.db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt));

    if (options?.limit) {
      query = query.limit(options.limit) as typeof query;
    }
    if (options?.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    return query;
  }

  async getTransactionsBySource(
    sourceType: string,
    sourceId: string
  ): Promise<Transaction[]> {
    return this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.sourceType, sourceType as Transaction['sourceType']),
          eq(transactions.sourceId, sourceId)
        )
      )
      .orderBy(desc(transactions.createdAt));
  }
}
