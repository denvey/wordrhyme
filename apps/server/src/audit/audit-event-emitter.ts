import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * Audit Event Emitter
 *
 * Simple event emitter for audit-related events.
 * Used for alerting and monitoring audit failures.
 *
 * Events:
 * - 'audit.write.failed': Emitted when audit write fails
 * - 'audit.archive.failed': Emitted when archive operation fails
 */
@Injectable()
export class AuditEventEmitter extends EventEmitter {
  constructor() {
    super();
    // Set max listeners to avoid memory leak warnings
    this.setMaxListeners(20);
  }
}
