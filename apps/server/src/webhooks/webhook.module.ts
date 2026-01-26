/**
 * Webhook Module
 *
 * NestJS module for webhook system.
 */
import { Module } from '@nestjs/common';
import { EventBus } from '../events/index';
import { QueueModule } from '../queue/queue.module';
import { WebhookRepository } from './webhook.repository';
import { WebhookService } from './webhook.service';
import { WebhookDispatcher } from './webhook.dispatcher';
import { WebhookEventHandler } from './webhook.event-handler';
import { WebhookOutboxBridge } from './webhook.outbox-bridge';
import { WebhookQueueHandler } from './webhook.queue-handler';
import { setWebhookService } from './webhook.router';

@Module({
  imports: [QueueModule],
  providers: [
    EventBus,
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
