import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuditArchiveTask } from './audit-archive.task.js';
import { AuditEventEmitter } from './audit-event-emitter.js';

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
 */
@Module({
  providers: [AuditService, AuditArchiveTask, AuditEventEmitter],
  exports: [AuditService, AuditEventEmitter],
})
export class AuditModule {}
