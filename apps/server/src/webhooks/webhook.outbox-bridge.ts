/**
 * Webhook Outbox Bridge
 *
 * Polls webhook_outbox table and enqueues jobs to BullMQ.
 * Runs as a background worker with configurable interval.
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { WebhookRepository } from './webhook.repository.js';
import { QueueService } from '../queue/queue.service.js';

@Injectable()
export class WebhookOutboxBridge implements OnModuleInit {
  private isProcessing = false;
  private batchSize = 100;

  constructor(
    private readonly repository: WebhookRepository,
    private readonly queueService: QueueService
  ) {}

  onModuleInit() {
    console.log('[WebhookOutboxBridge] Initialized');
  }

  /**
   * Poll outbox every 1 second
   *
   * Uses @Interval decorator from @nestjs/schedule
   */
  @Interval(1000)
  async pollOutbox(): Promise<void> {
    // Skip if already processing
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      await this.processBatch();
    } catch (error) {
      console.error('[WebhookOutboxBridge] Error processing batch:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a batch of outbox entries
   */
  private async processBatch(): Promise<void> {
    // Poll available entries (with distributed locking)
    const entries = await this.repository.pollOutbox(this.batchSize);

    if (entries.length === 0) {
      return;
    }

    console.log(
      `[WebhookOutboxBridge] Processing ${entries.length} outbox entries`
    );

    for (const entry of entries) {
      try {
        // Enqueue to BullMQ with dedupe key as jobId
        await this.queueService.enqueue(
          'core_webhook_dispatch',
          {
            outboxId: entry.id, // Pass outbox ID for deletion after completion
            organizationId: entry.organizationId,
            endpointId: entry.endpointId,
            eventType: entry.eventType,
            payload: entry.payload,
            dedupeKey: entry.dedupeKey,
          },
          {
            jobId: entry.dedupeKey, // Use dedupe key for idempotency
            priority: 'normal',
          }
        );

        console.log(
          `[WebhookOutboxBridge] Enqueued outbox entry ${entry.id}`
        );
      } catch (error) {
        console.error(
          `[WebhookOutboxBridge] Failed to enqueue outbox entry ${entry.id}:`,
          error
        );
      }
    }

    // Note: Outbox entries are NOT deleted here to prevent data loss
    // They will be deleted by the queue handler after successful delivery
  }

  /**
   * Manual trigger for processing (useful for testing)
   */
  async triggerProcessing(): Promise<void> {
    if (this.isProcessing) {
      throw new Error('Already processing');
    }

    await this.processBatch();
  }
}
