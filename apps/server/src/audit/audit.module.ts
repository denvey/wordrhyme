import { Module, OnModuleInit } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditArchiveTask } from './audit-archive.task';
import { AuditEventEmitter } from './audit-event-emitter';
import { AuditWorker } from './audit.worker';
import { QueueModule } from '../queue/queue.module';
import { QueueService } from '../queue/queue.service';
import { setAuditQueueService } from './audit-flush';

/**
 * Audit Module
 *
 * Provides generic audit logging services for the application.
 * Includes scheduled tasks for audit log archiving (replaces cleanup).
 *
 * The module follows the "Three Iron Rules":
 * 1. APPEND-ONLY: No update or delete on audit tables (except archive)
 * 2. NO SILENT FAILURES: Write failures trigger alerts
 * 3. CORE-MEDIATED: All writes go through AuditService
 *
 * Uses "In-Memory Buffer + BullMQ Flush" pattern:
 * - DB operations collect audit entries to buffer (zero IO)
 * - tRPC middleware enqueues buffer to BullMQ after success
 * - AuditWorker processes queue and writes to database
 */
@Module({
  imports: [QueueModule],
  providers: [AuditService, AuditArchiveTask, AuditEventEmitter, AuditWorker],
  exports: [AuditService, AuditEventEmitter],
})
export class AuditModule implements OnModuleInit {
  constructor(private readonly queueService: QueueService) {}

  onModuleInit() {
    // Inject queue service into audit-flush for fire-and-forget enqueuing
    setAuditQueueService({
      enqueue: (name, data) => this.queueService.enqueue(name, data),
    });

    console.log('[AuditModule] Queue service injected into audit-flush');
  }
}
