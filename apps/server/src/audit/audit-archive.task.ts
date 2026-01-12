import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditService } from './audit.service.js';

/**
 * Audit Archive Task
 *
 * Scheduled task to archive old audit events.
 * Runs daily at 3 AM to move records older than retention period to archive table.
 */
@Injectable()
export class AuditArchiveTask {
  private readonly logger = new Logger(AuditArchiveTask.name);

  constructor(private readonly auditService: AuditService) {}

  /**
   * Archive old audit events daily at 3 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleArchive(): Promise<void> {
    this.logger.log('Starting daily audit archive task...');

    try {
      const result = await this.auditService.archive({
        retentionDays: 90,
        batchSize: 1000,
      });

      this.logger.log(
        `Audit archive completed: ${result.archivedCount} records archived (cutoff: ${result.cutoffDate.toISOString()})`
      );
    } catch (error) {
      this.logger.error(`Audit archive task failed: ${error}`);
      // Error already emitted by AuditService
    }
  }

  /**
   * Manual trigger for archive (useful for testing/ops)
   */
  async triggerArchive(options?: {
    retentionDays?: number;
    entityType?: string;
    dryRun?: boolean;
  }): Promise<{ archivedCount: number; dryRun: boolean }> {
    return this.auditService.archive(options);
  }
}
