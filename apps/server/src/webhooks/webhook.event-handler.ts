/**
 * Webhook Event Handler
 *
 * Listens to EventBus and writes to webhook outbox for reliable delivery.
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../events/event-bus.js';
import { WebhookRepository } from './webhook.repository.js';
import type { NotificationCreatedEvent } from '../events/event-types.js';

@Injectable()
export class WebhookEventHandler implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly repository: WebhookRepository
  ) {}

  onModuleInit() {
    // Subscribe to domain events
    this.eventBus.on('notification.created', (event) =>
      this.handleNotificationCreated(event)
    );

    // TODO: Add more event subscriptions as needed
    // this.eventBus.on('user.created', (event) => this.handleUserCreated(event));
  }

  /**
   * Handle notification.created event
   */
  private async handleNotificationCreated(
    event: NotificationCreatedEvent
  ): Promise<void> {
    try {
      const eventType = 'notification.created';
      const organizationId = event.notification.organizationId;

      // Generate event ID for deduplication
      const eventId = event.notification.id;

      // Find subscribed endpoints
      const endpoints = await this.repository.findSubscribedEndpoints(
        organizationId,
        eventType
      );

      if (endpoints.length === 0) {
        return; // No subscribers
      }

      // Insert outbox entries for each endpoint
      for (const endpoint of endpoints) {
        const dedupeKey = `${eventId}:${endpoint.id}`;

        // Insert into outbox (idempotent via unique constraint)
        await this.repository.insertOutbox({
          organizationId,
          endpointId: endpoint.id,
          eventType,
          payload: event as unknown as Record<string, unknown>,
          dedupeKey,
        });

        // Also create delivery record in pending state
        await this.repository.createDelivery({
          organizationId,
          endpointId: endpoint.id,
          eventType,
          payload: event as unknown as Record<string, unknown>,
          status: 'pending',
          dedupeKey,
        });
      }
    } catch (error) {
      // Log error but don't throw (don't break EventBus)
      console.error('[WebhookEventHandler] Failed to process event:', error);
    }
  }

  /**
   * Generate event ID from payload
   */
  private generateEventId(payload: Record<string, unknown>): string {
    // Try to extract ID from common fields
    if ('id' in payload && typeof payload['id'] === 'string') {
      return payload['id'];
    }

    // Fallback: hash the payload
    const payloadStr = JSON.stringify(payload);
    const hash = require('crypto')
      .createHash('sha256')
      .update(payloadStr)
      .digest('hex');
    return `hash:${hash.substring(0, 16)}`;
  }

  /**
   * Handle generic event (future extension)
   */
  async handleGenericEvent(
    eventType: string,
    organizationId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      const eventId = this.generateEventId(payload);

      const endpoints = await this.repository.findSubscribedEndpoints(
        organizationId,
        eventType
      );

      for (const endpoint of endpoints) {
        const dedupeKey = `${eventId}:${endpoint.id}`;

        await this.repository.insertOutbox({
          organizationId,
          endpointId: endpoint.id,
          eventType,
          payload,
          dedupeKey,
        });

        await this.repository.createDelivery({
          organizationId,
          endpointId: endpoint.id,
          eventType,
          payload,
          status: 'pending',
          dedupeKey,
        });
      }
    } catch (error) {
      console.error('[WebhookEventHandler] Failed to handle event:', error);
    }
  }
}
