/**
 * Renewal Service
 *
 * Handles subscription renewal:
 * 1. Period extension
 * 2. Payment processing for recurring subscriptions
 * 3. Quota reset based on strategy (hard/soft/capped)
 * 4. Scheduled plan changes
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import type { Database } from '../../db/client';
import { SubscriptionRepository } from '../repos/subscription.repo';
import { TenantQuotaRepository } from '../repos/tenant-quota.repo';
import { BillingRepository } from '../repos/billing.repo';
import { PaymentService } from './payment.service';
import { EntitlementService } from './entitlement.service';
import { EventBus } from '../../events/event-bus';
import type { PlanSubscription, ResetStrategy } from '@wordrhyme/db';
import type { SubscriptionRenewedEvent } from '../events/billing.events';

/**
 * Result of a renewal operation
 */
export interface RenewalResult {
  subscription: PlanSubscription;
  renewed: boolean;
  paymentRequired: boolean;
  paymentSucceeded?: boolean;
  transactionId?: string;
  quotasReset: number;
  planChanged: boolean;
  newPlanId?: string;
}

@Injectable()
export class RenewalService {
  private readonly logger = new Logger(RenewalService.name);

  constructor(
    @Inject('DATABASE') _db: Database,
    private readonly subscriptionRepo: SubscriptionRepository,
    private readonly tenantQuotaRepo: TenantQuotaRepository,
    private readonly billingRepo: BillingRepository,
    private readonly paymentService: PaymentService,
    private readonly entitlementService: EntitlementService,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Process renewal for a subscription
   *
   * Flow:
   * 1. Validate subscription is eligible for renewal
   * 2. Apply scheduled plan change if any
   * 3. Calculate new period dates
   * 4. Process payment (if required)
   * 5. Extend subscription period
   * 6. Reset quotas based on strategy
   * 7. Emit renewal event
   */
  async processRenewal(subscriptionId: string): Promise<RenewalResult> {
    const subscription = await this.subscriptionRepo.getById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    // 1. Validate eligibility
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      throw new Error(
        `Subscription ${subscriptionId} is not eligible for renewal (status: ${subscription.status})`
      );
    }

    // Check if canceled at period end
    if (subscription.cancelAtPeriodEnd === 1) {
      // Expire the subscription instead of renewing
      await this.subscriptionRepo.updateStatus(subscriptionId, 'expired');

      // Remove membership quotas for the expired plan
      await this.removeQuotas(subscription.organizationId, subscription.planId);
      await this.entitlementService.invalidateForOrg(subscription.organizationId);
      this.logger.log(`Subscription ${subscriptionId} expired due to cancel_at_period_end`);

      this.eventBus.emit('subscription.expired' as any, {
        subscriptionId,
        organizationId: subscription.organizationId,
        expiredAt: new Date(),
      });

      return {
        subscription: { ...subscription, status: 'expired' },
        renewed: false,
        paymentRequired: false,
        quotasReset: 0,
        planChanged: false,
      };
    }

    let currentPlanId = subscription.planId;
    let planChanged = false;

    // 2. Apply scheduled plan change if ready
    if (
      subscription.scheduledPlanId &&
      subscription.scheduledChangeAt &&
      subscription.scheduledChangeAt <= new Date()
    ) {
      const updated = await this.subscriptionRepo.applyPlanChange(
        subscriptionId,
        subscription.version
      );
      if (updated) {
        currentPlanId = updated.planId;
        planChanged = true;
        this.logger.log(
          `Applied scheduled plan change for ${subscriptionId}: ${subscription.planId} -> ${currentPlanId}`
        );
      }
    }

    // Get the plan
    const plan = await this.billingRepo.getPlanById(currentPlanId);
    if (!plan) {
      throw new Error(`Plan ${currentPlanId} not found`);
    }

    // 3. Calculate new period
    const now = new Date();
    const newPeriodStart = subscription.currentPeriodEnd;
    const newPeriodEnd = this.calculatePeriodEnd(
      newPeriodStart,
      plan.interval,
      plan.intervalCount
    );

    // 4. Process payment if required
    const paymentRequired = plan.priceCents > 0;
    let paymentSucceeded: boolean | undefined;
    let transactionId: string | undefined;

    if (paymentRequired) {
      try {
        const paymentResult = await this.paymentService.createPaymentIntent({
          userId: subscription.organizationId,
          amountCents: plan.priceCents,
          currency: plan.currency,
          sourceType: 'membership',
          sourceId: subscriptionId,
          mode: 'subscription',
          gateway: subscription.gateway ?? 'stripe',
          metadata: {
            subscriptionId,
            planId: currentPlanId,
            renewalCount: subscription.renewalCount + 1,
          },
        });

        transactionId = paymentResult.transactionId;
        paymentSucceeded = true;

        this.logger.log(
          `Payment processed for renewal: ${transactionId}, ${plan.priceCents} cents`
        );
      } catch (error) {
        paymentSucceeded = false;
        this.logger.error(`Payment failed for renewal of ${subscriptionId}:`, error);

        // Mark subscription as past_due
        await this.subscriptionRepo.updateStatus(subscriptionId, 'past_due');

        this.eventBus.emit('subscription.payment_failed' as any, {
          subscriptionId,
          organizationId: subscription.organizationId,
          attemptedAt: now,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        const failedResult: RenewalResult = {
          subscription: { ...subscription, status: 'past_due' },
          renewed: false,
          paymentRequired: true,
          paymentSucceeded: false,
          quotasReset: 0,
          planChanged,
        };
        if (planChanged) failedResult.newPlanId = currentPlanId;

        return failedResult;
      }
    }

    // 5. Extend subscription period
    const updatedSubscription = await this.subscriptionRepo.extendPeriod(
      subscriptionId,
      subscription.version + (planChanged ? 1 : 0),
      newPeriodStart,
      newPeriodEnd,
      transactionId
    );

    if (!updatedSubscription) {
      throw new Error(`Failed to extend period for subscription ${subscriptionId}`);
    }

    // 6. Reset quotas based on strategy
    const quotasReset = await this.resetQuotas(
      subscription.organizationId,
      currentPlanId,
      newPeriodEnd
    );
    await this.entitlementService.invalidateForOrg(subscription.organizationId);

    // Emit quota reset event
    if (quotasReset > 0) {
      this.eventBus.emit('billing.quota.reset' as any, {
        organizationId: subscription.organizationId,
        planId: currentPlanId,
        quotasReset,
        resetAt: new Date(),
      });
    }

    this.logger.log(
      `Renewed subscription ${subscriptionId}: period ${newPeriodStart.toISOString()} - ${newPeriodEnd.toISOString()}, ${quotasReset} quotas reset`
    );

    // 7. Emit renewal event
    const event: SubscriptionRenewedEvent = {
      subscriptionId,
      organizationId: subscription.organizationId,
      planId: currentPlanId,
      periodStart: newPeriodStart,
      periodEnd: newPeriodEnd,
      renewalCount: updatedSubscription.renewalCount,
    };
    if (transactionId) event.transactionId = transactionId;

    this.eventBus.emit('subscription.renewed' as any, event);

    const result: RenewalResult = {
      subscription: updatedSubscription,
      renewed: true,
      paymentRequired,
      quotasReset,
      planChanged,
    };
    if (paymentSucceeded !== undefined) result.paymentSucceeded = paymentSucceeded;
    if (transactionId) result.transactionId = transactionId;
    if (planChanged) result.newPlanId = currentPlanId;

    return result;
  }

  /**
   * Find and process all subscriptions due for renewal
   */
  async processAllDueRenewals(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    errors: Array<{ subscriptionId: string; error: string }>;
  }> {
    const now = new Date();
    const dueSubscriptions = await this.subscriptionRepo.findExpiring(now);

    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ subscriptionId: string; error: string }> = [];

    for (const subscription of dueSubscriptions) {
      try {
        const result = await this.processRenewal(subscription.id);
        if (result.renewed) {
          succeeded++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        errors.push({
          subscriptionId: subscription.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        this.logger.error(`Failed to process renewal for ${subscription.id}:`, error);
      }
    }

    this.logger.log(
      `Processed ${dueSubscriptions.length} due renewals: ${succeeded} succeeded, ${failed} failed`
    );

    return {
      processed: dueSubscriptions.length,
      succeeded,
      failed,
      errors,
    };
  }

  /**
   * Reset quotas based on plan item strategies
   */
  private async resetQuotas(
    organizationId: string,
    planId: string,
    newExpiresAt: Date
  ): Promise<number> {
    const planItems = await this.billingRepo.getPlanItems(planId);
    let resetCount = 0;

    for (const item of planItems) {
      if (item.type !== 'metered' || !item.amount) continue;
      if (item.quotaScope !== 'tenant') continue;
      if (item.resetMode !== 'period') continue;

      const strategy = (item.resetStrategy ?? 'hard') as ResetStrategy;
      const sourceId = `plan_${planId}`;

      // Get current quotas for this item
      const currentQuotas = await this.tenantQuotaRepo.getByTenantAndSubject(
        organizationId,
        item.subject
      );

      const currentBalance = currentQuotas
        .filter((q) => q.sourceId === sourceId)
        .reduce((sum, q) => sum + q.balance, 0);

      let newBalance: number;

      switch (strategy) {
        case 'hard':
          // Full reset to plan amount
          newBalance = item.amount;
          break;

        case 'soft':
          // Accumulate: add plan amount to remaining balance
          newBalance = currentBalance + item.amount;
          break;

        case 'capped':
          // Accumulate with cap
          const cap = item.resetCap ?? item.amount * 2;
          newBalance = Math.min(currentBalance + item.amount, cap);
          break;

        default:
          newBalance = item.amount;
      }

      // Upsert the quota
      await this.tenantQuotaRepo.upsertBySource({
        organizationId,
        subject: item.subject,
        balance: newBalance,
        priority: item.priority,
        expiresAt: newExpiresAt,
        sourceType: 'membership',
        sourceId,
        metadata: { planId, itemId: item.id, strategy, previousBalance: currentBalance },
      });

      this.logger.debug(
        `Reset quota ${item.subject} for tenant ${organizationId}: ${currentBalance} -> ${newBalance} (${strategy})`
      );

      resetCount++;
    }

    return resetCount;
  }

  /**
   * Remove quotas for a plan (called when subscription expires)
   */
  private async removeQuotas(organizationId: string, planId: string): Promise<void> {
    const items = await this.billingRepo.getPlanItems(planId);

    for (const item of items) {
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
        end.setFullYear(end.getFullYear() + 100);
        break;
      default:
        end.setMonth(end.getMonth() + intervalCount);
    }

    return end;
  }
}
