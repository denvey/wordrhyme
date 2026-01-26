/**
 * Webhook Queue Handler
 *
 * BullMQ worker that processes webhook delivery jobs.
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { QueueService } from '../queue/queue.service.js';
import { WebhookRepository } from './webhook.repository.js';
import { WebhookDispatcher } from './webhook.dispatcher.js';
import type { Job } from 'bullmq';

interface WebhookJobData {
  outboxId: string;
  organizationId: string;
  endpointId: string;
  eventType: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

@Injectable()
export class WebhookQueueHandler implements OnModuleInit {
  constructor(
    private readonly queueService: QueueService,
    private readonly repository: WebhookRepository,
    private readonly dispatcher: WebhookDispatcher
  ) {}

  onModuleInit() {
    // Register BullMQ job handler
    this.queueService.registerHandler(
      'core_webhook_dispatch',
      this.handleJob.bind(this)
    );

    console.log('[WebhookQueueHandler] Registered handler for core_webhook_dispatch');
  }

  /**
   * Handle webhook delivery job
   */
  private async handleJob(
    data: WebhookJobData,
    job: Job<WebhookJobData>
  ): Promise<void> {
    const { outboxId, organizationId, endpointId, eventType, payload, dedupeKey } = data;

    console.log(
      `[WebhookQueueHandler] Processing job ${job.id} (attempt ${job.attemptsMade + 1})`
    );

    // Find delivery record
    const delivery = await this.repository.findDeliveryByDedupeKey(dedupeKey);

    if (!delivery) {
      console.error(
        `[WebhookQueueHandler] Delivery record not found for dedupe key: ${dedupeKey}`
      );
      throw new Error('Delivery record not found');
    }

    // Check if already succeeded (idempotency check)
    if (delivery.status === 'success') {
      console.log(
        `[WebhookQueueHandler] Delivery ${delivery.id} already succeeded, skipping`
      );
      // Delete outbox entry since delivery already completed
      await this.repository.deleteOutbox(outboxId);
      return;
    }

    // Find endpoint
    const endpoint = await this.repository.findEndpoint(organizationId, endpointId);

    if (!endpoint) {
      console.error(
        `[WebhookQueueHandler] Endpoint not found: ${endpointId}`
      );
      // Mark as failed (endpoint deleted)
      await this.repository.updateDelivery(delivery.id, {
        status: 'failed',
        attempts: delivery.attempts + 1,
        lastAttemptAt: new Date(),
        error: 'Endpoint not found (deleted)',
      });
      // Delete outbox entry (terminal failure)
      await this.repository.deleteOutbox(outboxId);
      return;
    }

    // Check if endpoint is enabled
    if (!endpoint.enabled) {
      console.log(
        `[WebhookQueueHandler] Endpoint ${endpointId} is disabled, skipping`
      );
      await this.repository.updateDelivery(delivery.id, {
        status: 'failed',
        attempts: delivery.attempts + 1,
        lastAttemptAt: new Date(),
        error: 'Endpoint is disabled',
      });
      // Delete outbox entry (terminal failure)
      await this.repository.deleteOutbox(outboxId);
      return;
    }

    // Execute HTTP POST
    const result = await this.dispatcher.dispatch(
      endpoint,
      eventType,
      payload,
      delivery.id
    );

    // Update delivery record
    await this.repository.updateDelivery(delivery.id, {
      status: result.status,
      attempts: delivery.attempts + 1,
      lastAttemptAt: new Date(),
      responseCode: result.responseCode,
      error: result.error,
    });

    // Log result
    console.log(
      `[WebhookQueueHandler] Delivery ${delivery.id} ${result.status} (${result.responseCode || 'N/A'}) in ${result.latencyMs}ms`
    );

    // Handle completion or retry
    if (result.success) {
      // Success: delete outbox entry
      await this.repository.deleteOutbox(outboxId);
      console.log(`[WebhookQueueHandler] Deleted outbox entry ${outboxId}`);
    } else if (this.dispatcher.isRetryable(result)) {
      // Retryable error: keep outbox entry and throw to trigger BullMQ retry
      throw new Error(result.error || 'Webhook delivery failed');
    } else {
      // Non-retryable error: delete outbox entry (terminal failure)
      await this.repository.deleteOutbox(outboxId);
      console.log(
        `[WebhookQueueHandler] Non-retryable error for delivery ${delivery.id}, deleted outbox entry ${outboxId}`
      );
    }
  }
}
