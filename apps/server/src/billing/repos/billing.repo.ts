/**
 * Billing Repository
 *
 * Data access layer for billing-related tables.
 * Handles transactions, plans, and related queries.
 */

import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  plans,
  planItems,
  transactions,
  type Plan,
  type InsertPlan,
  type PlanItem,
  type InsertPlanItem,
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

  async deletePlan(id: string): Promise<boolean> {
    const result = await this.db
      .delete(plans)
      .where(eq(plans.id, id))
      .returning();
    return result.length > 0;
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
