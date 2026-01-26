import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, gte, lte, sql, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  auditEvents,
  auditEventsArchive,
  type AuditEvent,
  type AuditEventInput,
  type AuditQueryFilters,
} from '../db/schema/definitions.js';
import { requestContextStorage, type ActorType } from '../context/async-local-storage';
import { AuditEventEmitter } from './audit-event-emitter.js';

/**
 * Audit write failure event
 */
export interface AuditWriteFailedEvent {
  type: 'audit_write_failed';
  event: AuditEventInput | AuditEventInput[];
  error: Error;
  timestamp: Date;
}

/**
 * Audit archive failure event
 */
export interface AuditArchiveFailedEvent {
  type: 'audit_archive_failed';
  error: Error;
  expectedCount: number;
  actualCount: number;
  timestamp: Date;
}

/**
 * Archive operation options
 */
export interface ArchiveOptions {
  /** Number of days to retain in main table (default: 90) */
  retentionDays?: number;
  /** Maximum records to archive per batch (default: 1000) */
  batchSize?: number;
  /** Optional - only archive specific entity types */
  entityType?: string;
  /** Dry run - only count, don't actually archive (default: false) */
  dryRun?: boolean;
}

/**
 * Archive operation result
 */
export interface ArchiveResult {
  archivedCount: number;
  dryRun: boolean;
  cutoffDate: Date;
}

/**
 * Audit Service
 *
 * Generic audit logging service for tracking entity changes.
 * Automatically populates actor context from AsyncLocalStorage.
 *
 * IMPORTANT: This service follows the "Three Iron Rules":
 * 1. APPEND-ONLY: No update or delete operations on audit tables
 * 2. NO SILENT FAILURES: Write failures trigger alerts
 * 3. CORE-MEDIATED: All writes go through this service
 *
 * Usage:
 * ```typescript
 * await auditService.log({
 *   entityType: 'setting',
 *   entityId: setting.id,
 *   organizationId: 'tenant-123',
 *   action: 'update',
 *   changes: { old: { value: 'foo' }, new: { value: 'bar' } },
 *   metadata: { key: 'email.smtp.host', encrypted: false },
 * });
 * ```
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly eventEmitter: AuditEventEmitter) {}

  /**
   * Log an audit event
   *
   * Actor context (actorId, actorType, actorIp, userAgent, traceId, requestId, sessionId)
   * is automatically populated from AsyncLocalStorage if available.
   *
   * @throws Error if audit write fails (after emitting alert)
   */
  async log(event: AuditEventInput): Promise<void> {
    const ctx = requestContextStorage.getStore();

    try {
      await db.insert(auditEvents).values({
        entityType: event.entityType,
        entityId: event.entityId,
        organizationId: event.organizationId,
        action: event.action,
        changes: event.changes,
        metadata: event.metadata,
        // Auto-populate from context
        actorId: ctx?.userId ?? ctx?.apiTokenId ?? 'system',
        actorType: this.resolveActorType(ctx?.actorType, ctx?.userId, ctx?.apiTokenId),
        actorIp: ctx?.ip,
        userAgent: ctx?.userAgent,
        traceId: ctx?.traceId,
        requestId: ctx?.requestId,
        sessionId: ctx?.sessionId,
      });
    } catch (error) {
      // Emit failure event for alerting
      this.emitWriteFailure(event, error as Error);

      // Log the error
      this.logger.error(`AUDIT WRITE FAILED: ${error}`, {
        event,
        error,
      });

      // Re-throw to signal failure to caller
      throw new Error(`Audit write failed: ${(error as Error).message}`);
    }
  }

  /**
   * Log multiple audit events in a batch
   *
   * @throws Error if audit write fails (after emitting alert)
   */
  async logBatch(events: AuditEventInput[]): Promise<void> {
    if (events.length === 0) return;

    const ctx = requestContextStorage.getStore();
    const actorId = ctx?.userId ?? ctx?.apiTokenId ?? 'system';
    const actorType = this.resolveActorType(ctx?.actorType, ctx?.userId, ctx?.apiTokenId);

    try {
      await db.insert(auditEvents).values(
        events.map((event) => ({
          entityType: event.entityType,
          entityId: event.entityId,
          organizationId: event.organizationId,
          action: event.action,
          changes: event.changes,
          metadata: event.metadata,
          actorId,
          actorType,
          actorIp: ctx?.ip,
          userAgent: ctx?.userAgent,
          traceId: ctx?.traceId,
          requestId: ctx?.requestId,
          sessionId: ctx?.sessionId,
        }))
      );
    } catch (error) {
      // Emit failure event for alerting
      this.emitWriteFailure(events, error as Error);

      this.logger.error(`AUDIT BATCH WRITE FAILED: ${error}`, {
        count: events.length,
        error,
      });

      throw new Error(`Audit batch write failed: ${(error as Error).message}`);
    }
  }

  /**
   * Query audit events with filters
   */
  async query(filters: AuditQueryFilters): Promise<AuditEvent[]> {
    const conditions = [];

    if (filters.entityType) {
      conditions.push(eq(auditEvents.entityType, filters.entityType));
    }
    if (filters.entityId) {
      conditions.push(eq(auditEvents.entityId, filters.entityId));
    }
    if (filters.organizationId) {
      conditions.push(eq(auditEvents.organizationId, filters.organizationId));
    }
    if (filters.actorId) {
      conditions.push(eq(auditEvents.actorId, filters.actorId));
    }
    if (filters.action) {
      conditions.push(eq(auditEvents.action, filters.action));
    }
    if (filters.startTime) {
      conditions.push(gte(auditEvents.createdAt, filters.startTime));
    }
    if (filters.endTime) {
      conditions.push(lte(auditEvents.createdAt, filters.endTime));
    }

    const query = db
      .select()
      .from(auditEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditEvents.createdAt))
      .limit(filters.limit ?? 100)
      .offset(filters.offset ?? 0);

    return query;
  }

  /**
   * Get a single audit event by ID
   */
  async getById(id: string): Promise<AuditEvent | undefined> {
    const result = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.id, id))
      .limit(1);

    return result[0];
  }

  /**
   * Get audit history for a specific entity
   */
  async getEntityHistory(
    entityType: string,
    entityId: string,
    limit = 50
  ): Promise<AuditEvent[]> {
    return this.query({
      entityType,
      entityId,
      limit,
    });
  }

  /**
   * Get recent audit events for a tenant
   */
  async getTenantActivity(
    organizationId: string,
    options?: { limit?: number; entityType?: string }
  ): Promise<AuditEvent[]> {
    const entityType = options?.entityType;
    return this.query({
      organizationId,
      ...(entityType ? { entityType } : {}),
      limit: options?.limit ?? 100,
    });
  }

  /**
   * Archive old audit events to archive table
   *
   * This replaces the old cleanup() method. Instead of deleting records,
   * we move them to an archive table for compliance and historical queries.
   *
   * The operation is performed in batches to avoid locking issues.
   *
   * @param options Archive options
   * @returns Number of archived records
   */
  async archive(options: ArchiveOptions = {}): Promise<ArchiveResult> {
    const {
      retentionDays = 90,
      batchSize = 1000,
      entityType,
      dryRun = false,
    } = options;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Build conditions
    const conditions = [lte(auditEvents.createdAt, cutoffDate)];
    if (entityType) {
      conditions.push(eq(auditEvents.entityType, entityType));
    }

    if (dryRun) {
      // Just count records that would be archived
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditEvents)
        .where(and(...conditions));

      return {
        archivedCount: countResult[0]?.count ?? 0,
        dryRun: true,
        cutoffDate,
      };
    }

    let totalArchived = 0;
    let hasMore = true;

    while (hasMore) {
      // Select batch of records to archive
      const recordsToArchive = await db
        .select()
        .from(auditEvents)
        .where(and(...conditions))
        .limit(batchSize);

      if (recordsToArchive.length === 0) {
        hasMore = false;
        break;
      }

      const recordIds = recordsToArchive.map((r) => r.id);

      try {
        // Use transaction to ensure atomicity
        await db.transaction(async (tx) => {
          // Insert into archive table
          await tx.insert(auditEventsArchive).values(
            recordsToArchive.map((record) => ({
              ...record,
              archivedAt: new Date(),
            }))
          );

          // Delete from main table
          const deleteResult = await tx
            .delete(auditEvents)
            .where(inArray(auditEvents.id, recordIds))
            .returning({ id: auditEvents.id });

          // Verify counts match
          if (deleteResult.length !== recordsToArchive.length) {
            throw new Error(
              `Archive count mismatch: expected ${recordsToArchive.length}, deleted ${deleteResult.length}`
            );
          }
        });

        totalArchived += recordsToArchive.length;

        this.logger.log(
          `Archived ${recordsToArchive.length} audit events (total: ${totalArchived})`
        );
      } catch (error) {
        // Emit failure event
        this.eventEmitter.emit('audit.archive.failed', {
          type: 'audit_archive_failed',
          error: error as Error,
          expectedCount: recordsToArchive.length,
          actualCount: 0,
          timestamp: new Date(),
        } satisfies AuditArchiveFailedEvent);

        this.logger.error(`AUDIT ARCHIVE FAILED: ${error}`);
        throw error;
      }

      // Check if we've processed fewer than batch size (last batch)
      if (recordsToArchive.length < batchSize) {
        hasMore = false;
      }
    }

    this.logger.log(
      `Archive complete: ${totalArchived} audit events older than ${retentionDays} days${entityType ? ` for entity type: ${entityType}` : ''}`
    );

    return {
      archivedCount: totalArchived,
      dryRun: false,
      cutoffDate,
    };
  }

  /**
   * Get audit event count by entity type (for monitoring)
   */
  async getCountByEntityType(): Promise<{ entityType: string; count: number }[]> {
    const result = await db
      .select({
        entityType: auditEvents.entityType,
        count: sql<number>`count(*)::int`,
      })
      .from(auditEvents)
      .groupBy(auditEvents.entityType);

    return result;
  }

  /**
   * Get total audit event count (for monitoring)
   */
  async getTotalCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditEvents);

    return result[0]?.count ?? 0;
  }

  /**
   * Resolve actor type based on context
   */
  private resolveActorType(
    explicitType: ActorType | undefined,
    userId: string | undefined,
    apiTokenId: string | undefined
  ): ActorType {
    if (explicitType) return explicitType;
    if (apiTokenId) return 'api-token';
    if (userId) return 'user';
    return 'system';
  }

  /**
   * Emit audit write failure event for alerting
   */
  private emitWriteFailure(
    event: AuditEventInput | AuditEventInput[],
    error: Error
  ): void {
    this.eventEmitter.emit('audit.write.failed', {
      type: 'audit_write_failed',
      event,
      error,
      timestamp: new Date(),
    } satisfies AuditWriteFailedEvent);
  }
}
