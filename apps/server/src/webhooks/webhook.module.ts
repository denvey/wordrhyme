/**
 * Webhook Module
 *
 * NestJS module for webhook system.
 */
import { Module } from '@nestjs/common';
import { WebhookRepository } from './webhook.repository.js';
import { WebhookService } from './webhook.service.js';
import { WebhookDispatcher } from './webhook.dispatcher.js';
import { WebhookEventHandler } from './webhook.event-handler.js';
import { WebhookOutboxBridge } from './webhook.outbox-bridge.js';
import { WebhookQueueHandler } from './webhook.queue-handler.js';
import { setWebhookService } from './webhook.router.js';

@Module({
  providers: [
    WebhookRepository,
    WebhookService,
    WebhookDispatcher,
    WebhookEventHandler,
    WebhookOutboxBridge,
    WebhookQueueHandler,
  ],
  exports: [WebhookService],
})
export class WebhookModule {
  constructor(webhookService: WebhookService) {
    // Register service for tRPC router
    setWebhookService(webhookService);
  }
}
