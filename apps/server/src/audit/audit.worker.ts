/**
 * Audit Worker - BullMQ worker that processes audit flush jobs
 *
 * Handles 'core_audit_flush' jobs from the queue and writes
 * audit entries to the database in batch.
 *
 * @see docs/architecture/AUDIT_GOVERNANCE.md
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { QueueService } from '../queue/queue.service';
import { db } from '../db/client';
import { auditEvents } from '@wordrhyme/db';
import { redactSensitiveFields } from './audit-config';
import type { Job } from 'bullmq';
import type { AuditJobData } from './audit-flush';
import type { AuditEventActorType } from '@wordrhyme/db';

@Injectable()
export class AuditWorker implements OnModuleInit {
  constructor(private readonly queueService: QueueService) {}

  onModuleInit() {
    // Register BullMQ job handler
    this.queueService.registerHandler(
      'core_audit_flush',
      this.handleJob.bind(this)
    );

    console.log('[AuditWorker] Registered handler for core_audit_flush');
  }

  /**
   * Handle audit flush job
   *
   * Batch writes all audit entries to the database.
   */
  private async handleJob(
    data: AuditJobData,
    job: Job<AuditJobData>
  ): Promise<void> {
    const { entries, organizationId, actorId, actorType, actorIp, timestamp } = data;

    if (entries.length === 0) {
      console.debug(`[AuditWorker] Job ${job.id} has no entries, skipping`);
      return;
    }

    console.debug(
      `[AuditWorker] Processing job ${job.id} with ${entries.length} entries`
    );

    try {
      // Transform entries to audit_events format
      const auditEntries = entries.map((entry) => ({
        entityType: entry.entityType,
        entityId: entry.entityId,
        organizationId,
        action: entry.action,
        changes: {
          old: redactSensitiveFields(entry.changes.old),
          new: redactSensitiveFields(entry.changes.new),
        },
        metadata: {
          layer: entry.layer,
          level: entry.level,
          ...entry.metadata,
        },
        actorId,
        actorType: actorType as AuditEventActorType,
        ...(actorIp ? { actorIp } : {}),
        // BullMQ serializes Date to ISO string, convert back to Date object
        // Validate timestamp to prevent Invalid Date
        createdAt: timestamp ? new Date(timestamp) : new Date(),
      }));

      // Batch insert using raw db (bypass proxy)
      await db.insert(auditEvents).values(auditEntries);

      console.log(
        `[AuditWorker] Successfully flushed ${auditEntries.length} audit logs (job ${job.id})`
      );
    } catch (error) {
      console.error(`[AuditWorker] Failed to flush audit logs (job ${job.id}):`, error);
      // Re-throw for BullMQ retry logic
      throw error;
    }
  }
}
