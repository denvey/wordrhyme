/**
 * Subscription Service
 *
 * Handles subscription lifecycle: create, activate, cancel, upgrade/downgrade.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { planSubscriptions } from '@wordrhyme/db';
import { SubscriptionRepository } from '../repos/subscription.repo';
import { TenantQuotaRepository } from '../repos/tenant-quota.repo';
import { BillingRepository } from '../repos/billing.repo';
import { PaymentService } from './payment.service';
import { EntitlementService } from './entitlement.service';
import { EventBus } from '../../events/event-bus';
import type {
  PlanSubscription,
} from '@wordrhyme/db';
import type {
  SubscriptionCreatedEvent,
  SubscriptionCanceledEvent,
} from '../events/billing.events';

/**
 * Input for creating a subscription
 */
export interface CreateSubscriptionInput {
  organizationId: string;
  planId: string;
  gateway: string;
  trialDays?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Result of creating a subscription
 */
export interface CreateSubscriptionResult {
  subscription: PlanSubscription;
  paymentRequired: boolean;
  clientSecret?: string;
  payUrl?: string;
}

/**
 * Input for canceling a subscription
 */
export interface CancelSubscriptionInput {
  subscriptionId: string;
  reason?: string;
  immediate?: boolean;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @Inject('DATABASE') private readonly db: Database,
    private readonly subscriptionRepo: SubscriptionRepository,
    private readonly tenantQuotaRepo: TenantQuotaRepository,
    private readonly billingRepo: BillingRepository,
    private readonly paymentService: PaymentService,
    private readonly entitlementService: EntitlementService,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Create a new subscription
   *
   * Flow:
   * 1. Validate plan exists and is active
   * 2. Check for existing active subscription
   * 3. Create subscription record (trialing or pending payment)
   * 4. If payment required, create payment intent
   * 5. Emit subscription.created event
   */
  async create(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    const { organizationId, planId, gateway, trialDays, metadata } = input;

    // 1. Validate plan
    const plan = await this.billingRepo.getPlanById(planId);
    if (!plan || plan.isActive !== 1) {
      throw new Error(`Plan ${planId} not found or inactive`);
    }

    // 2. Check for existing active subscription to same plan
    const existing = await this.subscriptionRepo.getActiveByTenant(organizationId);
    const duplicate = existing.find((s) => s.planId === planId);
    if (duplicate) {
      throw new Error(`Tenant ${organizationId} already has an active subscription to plan ${planId}`);
    }

    // 3. Calculate period dates
    const now = new Date();
    const hasTrial = trialDays && trialDays > 0;
    const trialEnd = hasTrial
      ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
      : undefined;

    const periodStart = hasTrial ? trialEnd! : now;
    const periodEnd = this.calculatePeriodEnd(periodStart, plan.interval, plan.intervalCount);

    // 4. Create subscription record
    const subscription = await this.subscriptionRepo.create({
      organizationId,
      planId,
      status: hasTrial ? 'trialing' : 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      billingCycleAnchor: periodStart.getDate(),
      trialStart: hasTrial ? now : undefined,
      trialEnd: trialEnd,
      gateway,
      metadata,
    });

    this.logger.log(
      `Created subscription ${subscription.id} for tenant ${organizationId}, plan ${planId}`
    );

    // 5. Provision quotas if active (not trial) or trial with quotas
    if (subscription.status === 'active' || hasTrial) {
      await this.provisionQuotas(organizationId, planId, periodEnd);
      await this.entitlementService.invalidateForOrg(organizationId);
    }

    // 6. Emit event
    const event: SubscriptionCreatedEvent = {
      subscriptionId: subscription.id,
      organizationId,
      planId,
      status: subscription.status,
      createdAt: now,
    };
    this.eventBus.emit('subscription.created' as any, event);

    // 7. If payment required (not free plan, not trial), create payment intent
    const paymentRequired = plan.priceCents > 0 && !hasTrial;
    let clientSecret: string | undefined;
    let payUrl: string | undefined;

    if (paymentRequired) {
      const paymentResult = await this.paymentService.createPaymentIntent({
        userId: organizationId, // Using organizationId as userId for tenant-level billing
        amountCents: plan.priceCents,
        currency: plan.currency,
        sourceType: 'membership',
        sourceId: subscription.id,
        mode: plan.interval === 'one_time' ? 'payment' : 'subscription',
        gateway,
        metadata: { subscriptionId: subscription.id, planId },
      });

      clientSecret = paymentResult.clientSecret;
      payUrl = paymentResult.payUrl;

      // Update subscription with initial transaction
      await this.db
        .update(planSubscriptions)
        .set({ initialTransactionId: paymentResult.transactionId })
        .where(eq(planSubscriptions.id, subscription.id));
    }

    const result: CreateSubscriptionResult = {
      subscription,
      paymentRequired,
    };
    if (clientSecret) result.clientSecret = clientSecret;
    if (payUrl) result.payUrl = payUrl;

    return result;
  }

  /**
   * Activate a subscription after payment success
   */
  async activate(subscriptionId: string): Promise<PlanSubscription> {
    const subscription = await this.subscriptionRepo.getById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    if (subscription.status === 'active') {
      return subscription;
    }

    const updated = await this.subscriptionRepo.updateStatus(subscriptionId, 'active');
    if (!updated) {
      throw new Error(`Failed to activate subscription ${subscriptionId}`);
    }

    // Provision quotas if not already done
    await this.provisionQuotas(
      subscription.organizationId,
      subscription.planId,
      subscription.currentPeriodEnd
    );
    await this.entitlementService.invalidateForOrg(subscription.organizationId);

    this.logger.log(`Activated subscription ${subscriptionId}`);

    this.eventBus.emit('subscription.activated' as any, {
      subscriptionId,
      organizationId: subscription.organizationId,
    });

    return updated;
  }

  /**
   * Cancel a subscription
   */
  async cancel(input: CancelSubscriptionInput): Promise<PlanSubscription> {
    const { subscriptionId, reason, immediate } = input;

    const subscription = await this.subscriptionRepo.getById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    if (subscription.status === 'canceled' || subscription.status === 'expired') {
      throw new Error(`Subscription ${subscriptionId} is already ${subscription.status}`);
    }

    const now = new Date();

    if (immediate) {
      // Immediate cancellation - expire now
      const updated = await this.subscriptionRepo.updateStatus(
        subscriptionId,
        'expired',
        reason
          ? { canceledAt: now, cancelReason: reason }
          : { canceledAt: now }
      );

      // Remove quotas
      await this.removeQuotas(subscription.organizationId, subscription.planId);
      await this.entitlementService.invalidateForOrg(subscription.organizationId);

      this.logger.log(`Immediately canceled subscription ${subscriptionId}`);

      const event: SubscriptionCanceledEvent = {
        subscriptionId,
        organizationId: subscription.organizationId,
        expiresAt: now,
        canceledAt: now,
      };
      if (reason) event.reason = reason;
      this.eventBus.emit('subscription.canceled' as any, event);

      return updated!;
    } else {
      // Cancel at period end
      const updated = await this.subscriptionRepo.updateStatus(
        subscriptionId,
        'canceled',
        reason
          ? { canceledAt: now, cancelReason: reason, cancelAtPeriodEnd: 1 }
          : { canceledAt: now, cancelAtPeriodEnd: 1 }
      );

      this.logger.log(
        `Scheduled cancellation for subscription ${subscriptionId} at ${subscription.currentPeriodEnd}`
      );

      const event: SubscriptionCanceledEvent = {
        subscriptionId,
        organizationId: subscription.organizationId,
        expiresAt: subscription.currentPeriodEnd,
        canceledAt: now,
      };
      if (reason) event.reason = reason;
      this.eventBus.emit('subscription.canceled' as any, event);

      return updated!;
    }
  }

  /**
   * Get active subscriptions for a tenant
   */
  async getActiveByTenant(organizationId: string): Promise<PlanSubscription[]> {
    return this.subscriptionRepo.getActiveByTenant(organizationId);
  }

  /**
   * Get all subscriptions for a tenant
   */
  async getAllByTenant(organizationId: string): Promise<PlanSubscription[]> {
    return this.subscriptionRepo.getAllByTenant(organizationId);
  }

  /**
   * Get subscription by ID
   */
  async getById(id: string): Promise<PlanSubscription | null> {
    return this.subscriptionRepo.getById(id);
  }

  /**
   * Schedule a plan change (upgrade/downgrade)
   */
  async schedulePlanChange(
    subscriptionId: string,
    newPlanId: string,
    immediate = false
  ): Promise<PlanSubscription> {
    const subscription = await this.subscriptionRepo.getById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      throw new Error(`Cannot change plan for subscription in ${subscription.status} status`);
    }

    const newPlan = await this.billingRepo.getPlanById(newPlanId);
    if (!newPlan || newPlan.isActive !== 1) {
      throw new Error(`Plan ${newPlanId} not found or inactive`);
    }

    if (immediate) {
      // Immediate change - update plan and re-provision quotas
      const updated = await this.subscriptionRepo.updateWithVersion(
        subscriptionId,
        subscription.version,
        { planId: newPlanId }
      );

      if (!updated) {
        throw new Error(`Failed to update subscription ${subscriptionId} - concurrent modification`);
      }

      // Re-provision quotas for new plan
      await this.removeQuotas(subscription.organizationId, subscription.planId);
      await this.provisionQuotas(
        subscription.organizationId,
        newPlanId,
        subscription.currentPeriodEnd
      );
      await this.entitlementService.invalidateForOrg(subscription.organizationId);

      this.logger.log(
        `Immediately changed plan for subscription ${subscriptionId} from ${subscription.planId} to ${newPlanId}`
      );

      this.eventBus.emit('subscription.plan_changed' as any, {
        subscriptionId,
        fromPlanId: subscription.planId,
        toPlanId: newPlanId,
      });

      return updated;
    } else {
      // Schedule change for period end
      const updated = await this.subscriptionRepo.schedulePlanChange(
        subscriptionId,
        newPlanId,
        subscription.currentPeriodEnd
      );

      this.logger.log(
        `Scheduled plan change for subscription ${subscriptionId} to ${newPlanId} at ${subscription.currentPeriodEnd}`
      );

      return updated!;
    }
  }

  /**
   * Provision quotas for a subscription
   */
  private async provisionQuotas(
    organizationId: string,
    planId: string,
    expiresAt: Date
  ): Promise<void> {
    const planItems = await this.billingRepo.getPlanItems(planId);

    for (const item of planItems) {
      if (item.type !== 'metered' || !item.amount) continue;
      if (item.quotaScope !== 'tenant') continue; // Only provision tenant-scope quotas

      await this.tenantQuotaRepo.upsertBySource({
        organizationId,
        subject: item.subject,
        balance: item.amount,
        priority: item.priority,
        expiresAt: item.resetMode === 'period' ? expiresAt : undefined,
        sourceType: 'membership',
        sourceId: `plan_${planId}`,
        metadata: { planId, itemId: item.id },
      });

      this.logger.debug(
        `Provisioned ${item.amount} ${item.subject} quota for tenant ${organizationId}`
      );
    }
  }

  /**
   * Remove quotas for a plan
   */
  private async removeQuotas(organizationId: string, planId: string): Promise<void> {
    const planItems = await this.billingRepo.getPlanItems(planId);

    for (const item of planItems) {
      if (item.quotaScope !== 'tenant') continue;

      await this.tenantQuotaRepo.deleteBySource(
        organizationId,
        item.subject,
        'membership',
        `plan_${planId}`
      );
    }

    this.logger.debug(`Removed quotas for plan ${planId} from tenant ${organizationId}`);
  }

  /**
   * Calculate period end date based on interval
   */
  private calculatePeriodEnd(
    start: Date,
    interval: string,
    intervalCount: number
  ): Date {
    const end = new Date(start);

    switch (interval) {
      case 'month':
        end.setMonth(end.getMonth() + intervalCount);
        break;
      case 'year':
        end.setFullYear(end.getFullYear() + intervalCount);
        break;
      case 'one_time':
        // One-time purchases don't expire
        end.setFullYear(end.getFullYear() + 100);
        break;
      default:
        end.setMonth(end.getMonth() + intervalCount);
    }

    return end;
  }
}
