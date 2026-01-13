/**
 * Subscription Renewal Task
 *
 * Scheduled task that processes subscription renewals.
 * Runs hourly to find and process subscriptions due for renewal.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RenewalService } from '../services/renewal.service';

@Injectable()
export class SubscriptionRenewalTask {
  private readonly logger = new Logger(SubscriptionRenewalTask.name);
  private isRunning = false;

  constructor(private readonly renewalService: RenewalService) {}

  /**
   * Process subscription renewals every hour
   *
   * This task:
   * 1. Finds all subscriptions past their current period end
   * 2. Processes renewal (payment + period extension + quota reset)
   * 3. Handles failures gracefully (marks as past_due)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async processRenewals() {
    // Prevent concurrent runs
    if (this.isRunning) {
      this.logger.warn('Renewal task already running, skipping this cycle');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.log('Starting subscription renewal processing...');

      const result = await this.renewalService.processAllDueRenewals();

      const duration = Date.now() - startTime;
      this.logger.log(
        `Renewal processing completed in ${duration}ms: ` +
          `${result.processed} processed, ${result.succeeded} succeeded, ${result.failed} failed`
      );

      if (result.errors.length > 0) {
        this.logger.warn(
          `Renewal errors: ${result.errors.map((e) => `${e.subscriptionId}: ${e.error}`).join(', ')}`
        );
      }
    } catch (error) {
      this.logger.error('Subscription renewal task failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manual trigger for testing or admin use
   */
  async triggerManually(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    errors: Array<{ subscriptionId: string; error: string }>;
  }> {
    this.logger.log('Manual renewal trigger requested');
    return this.renewalService.processAllDueRenewals();
  }
}
