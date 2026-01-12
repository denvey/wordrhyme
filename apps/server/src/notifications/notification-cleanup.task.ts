import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { db } from '../db/index.js';
import { notifications } from '../db/schema/index.js';
import { RETENTION_POLICIES, type NotificationCategory } from '../db/schema/notifications.js';
import { and, eq, lt, inArray } from 'drizzle-orm';

const BATCH_SIZE = 1000;

interface CleanupResult {
  category: NotificationCategory;
  readDeleted: number;
  unreadDeleted: number;
  totalDeleted: number;
  batches: number;
  durationMs: number;
}

/**
 * Scheduled task for cleaning up old notifications based on retention policies.
 *
 * Runs daily at 3 AM server time.
 * Implements batch deletion to avoid long-running transactions.
 */
@Injectable()
export class NotificationCleanupTask {
  private readonly logger = new Logger(NotificationCleanupTask.name);

  /**
   * Run cleanup job daily at 3 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup() {
    this.logger.log('Starting notification cleanup job...');
    const startTime = Date.now();

    try {
      const results = await this.cleanupWithBatching();

      const totalDeleted = results.reduce((sum, r) => sum + r.totalDeleted, 0);
      const totalBatches = results.reduce((sum, r) => sum + r.batches, 0);
      const durationMs = Date.now() - startTime;

      this.logger.log(
        `Notification cleanup completed in ${durationMs}ms. ` +
          `Total deleted: ${totalDeleted}, Batches: ${totalBatches}`
      );

      // Log per-category breakdown
      for (const result of results) {
        if (result.totalDeleted > 0) {
          this.logger.log(
            `  [${result.category}] deleted ${result.totalDeleted} ` +
              `(read: ${result.readDeleted}, unread: ${result.unreadDeleted}) ` +
              `in ${result.batches} batches, ${result.durationMs}ms`
          );
        }
      }

      return results;
    } catch (error) {
      this.logger.error('Notification cleanup job failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup notifications with batch deletion to avoid long transactions
   */
  private async cleanupWithBatching(): Promise<CleanupResult[]> {
    const now = new Date();
    const results: CleanupResult[] = [];

    for (const policy of RETENTION_POLICIES) {
      const categoryStart = Date.now();

      if (policy.retentionDays === 'forever') {
        results.push({
          category: policy.category,
          readDeleted: 0,
          unreadDeleted: 0,
          totalDeleted: 0,
          batches: 0,
          durationMs: 0,
        });
        continue;
      }

      const cutoffDate = new Date(now);
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

      // Extra 7-day grace period for unread notifications
      const unreadCutoffDate = new Date(now);
      unreadCutoffDate.setDate(
        unreadCutoffDate.getDate() - policy.retentionDays - 7
      );

      let readDeleted = 0;
      let unreadDeleted = 0;
      let batches = 0;

      // Batch delete read notifications
      let hasMore = true;
      while (hasMore) {
        const idsToDelete = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.category, policy.category),
              eq(notifications.read, true),
              lt(notifications.createdAt, cutoffDate)
            )
          )
          .limit(BATCH_SIZE);

        if (idsToDelete.length === 0) {
          hasMore = false;
          break;
        }

        await db.delete(notifications).where(
          inArray(
            notifications.id,
            idsToDelete.map((r) => r.id)
          )
        );

        readDeleted += idsToDelete.length;
        batches++;

        if (idsToDelete.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      // Batch delete unread notifications past extended retention
      hasMore = true;
      while (hasMore) {
        const idsToDelete = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.category, policy.category),
              eq(notifications.read, false),
              lt(notifications.createdAt, unreadCutoffDate)
            )
          )
          .limit(BATCH_SIZE);

        if (idsToDelete.length === 0) {
          hasMore = false;
          break;
        }

        await db.delete(notifications).where(
          inArray(
            notifications.id,
            idsToDelete.map((r) => r.id)
          )
        );

        unreadDeleted += idsToDelete.length;
        batches++;

        if (idsToDelete.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      results.push({
        category: policy.category,
        readDeleted,
        unreadDeleted,
        totalDeleted: readDeleted + unreadDeleted,
        batches,
        durationMs: Date.now() - categoryStart,
      });
    }

    return results;
  }

  /**
   * Manual trigger for testing or ad-hoc cleanup
   */
  async runManualCleanup(): Promise<CleanupResult[]> {
    this.logger.log('Manual notification cleanup triggered');
    return this.handleCleanup();
  }
}
