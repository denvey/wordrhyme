/**
 * Audit Flush Service - Batch write pending audit logs via BullMQ
 *
 * Uses existing QueueService infrastructure for reliable async processing.
 * Called by tRPC middleware after successful response.
 *
 * Flow:
 * 1. tRPC middleware calls scheduleAuditFlush() after successful response
 * 2. Pending logs are enqueued to BullMQ (fire-and-forget)
 * 3. AuditWorker processes the job and writes to database
 *
 * @see docs/architecture/AUDIT_GOVERNANCE.md
 */

import { getAuditContext, getPendingLogs, clearPendingLogs, type PendingAuditEntry } from './audit-context';
import type { AuditEventActorType } from '@wordrhyme/db';

/**
 * Audit job data structure
 */
export interface AuditJobData {
  [key: string]: unknown;
  organizationId: string;
  entries: Array<{
    entityType: string;
    entityId: string;
    action: string;
    changes: {
      old?: Record<string, unknown>;
      new?: Record<string, unknown>;
    };
    layer: 1 | 2;
    level?: string;
    metadata?: Record<string, unknown>;
  }>;
  actorId: string;
  actorType: AuditEventActorType;
  actorIp?: string;
  timestamp: Date;
}

/**
 * Queue service instance (injected at runtime)
 * This avoids circular dependency issues with NestJS DI
 */
let _queueService: {
  enqueue: (name: string, data: AuditJobData) => Promise<string>;
} | null = null;

/**
 * Set queue service instance (called during app initialization)
 */
export function setAuditQueueService(queueService: typeof _queueService): void {
  _queueService = queueService;
}

/**
 * Schedule audit flush via BullMQ queue
 *
 * This is fire-and-forget - errors are logged but don't affect response.
 * The actual database write happens in AuditWorker.
 */
export function scheduleAuditFlush(): void {
  const pendingLogs = getPendingLogs();

  if (pendingLogs.length === 0) {
    return;
  }

  const ctx = getAuditContext();

  // Build job data
  const jobData: AuditJobData = {
    organizationId: ctx.organizationId ?? '',
    entries: pendingLogs.map((entry) => ({
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      changes: entry.changes,
      layer: entry.layer,
      ...(entry.level ? { level: entry.level } : {}),
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
    })),
    actorId: ctx.actorId ?? 'system',
    actorType: ctx.actorId ? 'user' : 'system',
    timestamp: ctx.timestamp,
    ...(ctx.clientIp ? { actorIp: ctx.clientIp } : {}),
  };

  // Enqueue to BullMQ with fallback on failure
  if (_queueService) {
    _queueService.enqueue('core_audit_flush', jobData)
      .then(() => {
        // Successfully enqueued, safe to clear buffer
        clearPendingLogs();
      })
      .catch((error) => {
        console.error('[audit-flush] Failed to enqueue audit job, falling back to direct flush:', error);
        // Fallback: direct write if enqueue fails
        flushDirectly(jobData)
          .then(() => {
            // Successfully flushed directly, safe to clear buffer
            clearPendingLogs();
          })
          .catch((flushError) => {
            console.error('[audit-flush] Direct flush also failed, audit logs lost:', flushError);
            // CRITICAL: Both enqueue and direct flush failed
            // Clear buffer anyway to prevent memory leak, but log the failure
            clearPendingLogs();
            // TODO: Trigger alert/monitoring for audit system failure
          });
      });
  } else {
    // Fallback: direct write if queue not available (development mode)
    console.warn('[audit-flush] Queue service not available, using direct flush');
    flushDirectly(jobData)
      .then(() => {
        clearPendingLogs();
      })
      .catch((error) => {
        console.error('[audit-flush] Direct flush failed:', error);
        clearPendingLogs();
        // TODO: Trigger alert/monitoring
      });
  }
}

/**
 * Direct flush fallback (for development or when queue is unavailable)
 */
async function flushDirectly(jobData: AuditJobData): Promise<void> {
  // Dynamic import to avoid circular dependency
  const { db } = await import('../db/client');
  const { auditEvents } = await import('../db/schema/definitions');
  const { redactSensitiveFields } = await import('./audit-config');

  const auditEntries = jobData.entries.map((entry) => ({
    entityType: entry.entityType,
    entityId: entry.entityId,
    organizationId: jobData.organizationId,
    action: entry.action,
    changes: {
      old: redactSensitiveFields(entry.changes.old),
      new: redactSensitiveFields(entry.changes.new),
    },
    metadata: {
      layer: entry.layer,
      ...(entry.level ? { level: entry.level } : {}),
      ...(entry.metadata ?? {}),
    },
    actorId: jobData.actorId,
    actorType: jobData.actorType,
    ...(jobData.actorIp ? { actorIp: jobData.actorIp } : {}),
  }));

  await db.insert(auditEvents).values(auditEntries);
  console.debug(`[audit-flush] Direct flushed ${auditEntries.length} audit logs`);
}
