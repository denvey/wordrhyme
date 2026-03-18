import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditService } from './audit.service.js';

const DEFAULT_RETENTION_DAYS = 90;

/**
 * Retention policies by entity type
 * Can be extended to have different retention for different entity types
 */
const RETENTION_POLICIES: Record<string, number> = {
  default: DEFAULT_RETENTION_DAYS,
  // Add custom retention per entity type if needed:
  // setting: 180,
  // feature_flag: 90,
  // user: 365,
};

interface CleanupResult {
  entityType: string;
  archivedCount: number;
  retentionDays: number;
  durationMs: number;
}

/**
 * Scheduled task for cleaning up old audit events based on retention policies.
 *
 * Runs daily at 4 AM server time (1 hour after notification cleanup).
 */
@Injectable()
export class AuditCleanupTask {
  private readonly logger = new Logger(AuditCleanupTask.name);

  constructor(private readonly auditService: AuditService) {}

  /**
   * Run cleanup job daily at 4 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleCleanup() {
    this.logger.log('Starting audit events cleanup job...');
    const startTime = Date.now();

    try {
      const results = await this.cleanupByEntityType();

      const totalArchived = results.reduce((sum, r) => sum + r.archivedCount, 0);
      const durationMs = Date.now() - startTime;

      this.logger.log(
        `Audit cleanup completed in ${durationMs}ms. Total archived: ${totalArchived}`
      );

      // Log per-entity-type breakdown
      for (const result of results) {
        if (result.archivedCount > 0) {
          this.logger.log(
            `  [${result.entityType}] archived ${result.archivedCount} ` +
              `(retention: ${result.retentionDays} days, ${result.durationMs}ms)`
          );
        }
      }

      return results;
    } catch (error) {
      this.logger.error('Audit cleanup job failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup audit events by entity type with individual retention policies
   */
  private async cleanupByEntityType(): Promise<CleanupResult[]> {
    const results: CleanupResult[] = [];

    // Get unique entity types from stats
    const stats = await this.auditService.getCountByEntityType();
    const entityTypes = stats.map((s) => s.entityType);

    // Always include 'default' for any unlisted entity types
    const typesToClean = [...new Set([...entityTypes, 'default'])];

    for (const entityType of typesToClean) {
      const typeStart = Date.now();
      const retentionDays =
        RETENTION_POLICIES[entityType] ?? RETENTION_POLICIES['default'] ?? DEFAULT_RETENTION_DAYS;

      // For 'default', clean all entity types not in specific policies
      const archiveResult =
        entityType === 'default'
          ? await this.auditService.archive({ retentionDays })
          : await this.auditService.archive({
              retentionDays,
              ...(entityType ? { entityType } : {}),
            });

      results.push({
        entityType,
        archivedCount: archiveResult.archivedCount,
        retentionDays,
        durationMs: Date.now() - typeStart,
      });
    }

    return results;
  }

  /**
   * Manual trigger for testing or ad-hoc cleanup
   */
  async runManualCleanup(
    retentionDays = DEFAULT_RETENTION_DAYS,
    entityType?: string
  ): Promise<number> {
    this.logger.log(
      `Manual audit cleanup triggered (retention: ${retentionDays} days${entityType ? `, type: ${entityType}` : ''})`
    );
    const result = await this.auditService.archive({
      retentionDays,
      ...(entityType ? { entityType } : {}),
    });
    return result.archivedCount;
  }
}
