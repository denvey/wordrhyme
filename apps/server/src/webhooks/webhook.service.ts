/**
 * Webhook Service
 *
 * Core business logic for webhook endpoint management.
 */
import { Injectable } from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { WebhookRepository } from './webhook.repository.js';
import { webhookHMAC } from './webhook.hmac.js';
import {
  type CreateWebhookInput,
  type UpdateWebhookInput,
  type TestWebhookInput,
  type QueryDeliveriesInput,
  type WebhookEndpointResponse,
  type DeliveriesQueryResponse,
} from './dto/webhook.dto.js';
import type { RetryPolicy } from '../db/schema/webhooks.js';

@Injectable()
export class WebhookService {
  constructor(private readonly repository: WebhookRepository) {}

  /**
   * Create a new webhook endpoint
   */
  async create(
    tenantId: string,
    _userId: string,
    input: CreateWebhookInput
  ): Promise<WebhookEndpointResponse> {
    // Validate URL (additional checks beyond Zod)
    if (input.url.includes('localhost') || input.url.includes('127.0.0.1')) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Localhost URLs are not allowed in production',
      });
    }

    // Generate secret
    const secret = webhookHMAC.generateSecret();

    // Default retry policy
    const retryPolicy = input.retryPolicy ?? {
      attempts: 5,
      backoffMs: 1000,
      maxBackoffMs: 30000 as number | undefined,
    };

    const endpoint = await this.repository.createEndpoint({
      tenantId,
      url: input.url,
      secret,
      events: input.events,
      enabled: input.enabled ?? true,
      retryPolicy,
    });

    return this.toResponse(endpoint);
  }

  /**
   * List all webhook endpoints for a tenant
   */
  async list(tenantId: string): Promise<WebhookEndpointResponse[]> {
    const endpoints = await this.repository.findEndpoints(tenantId);
    return endpoints.map((e) => this.toResponse(e));
  }

  /**
   * Get a single webhook endpoint
   */
  async get(tenantId: string, id: string): Promise<WebhookEndpointResponse> {
    const endpoint = await this.repository.findEndpoint(tenantId, id);

    if (!endpoint) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Webhook endpoint not found',
      });
    }

    return this.toResponse(endpoint);
  }

  /**
   * Update webhook endpoint
   */
  async update(
    tenantId: string,
    input: UpdateWebhookInput
  ): Promise<WebhookEndpointResponse> {
    const existing = await this.repository.findEndpoint(tenantId, input.id);

    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Webhook endpoint not found',
      });
    }

    const updateData: Partial<{
      url: string;
      events: string[];
      enabled: boolean;
      retryPolicy: RetryPolicy;
      secret: string;
    }> = {};

    if (input.url) {
      updateData.url = input.url;
    }
    if (input.events) {
      updateData.events = input.events;
    }
    if (input.enabled !== undefined) {
      updateData.enabled = input.enabled;
    }
    if (input.retryPolicy) {
      updateData.retryPolicy = input.retryPolicy as RetryPolicy;
    }
    if (input.rotateSecret) {
      updateData.secret = webhookHMAC.generateSecret();
    }

    const updated = await this.repository.updateEndpoint(
      tenantId,
      input.id,
      updateData
    );

    if (!updated) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update webhook endpoint',
      });
    }

    return this.toResponse(updated);
  }

  /**
   * Delete webhook endpoint
   */
  async delete(tenantId: string, id: string): Promise<{ success: boolean }> {
    const success = await this.repository.deleteEndpoint(tenantId, id);

    if (!success) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Webhook endpoint not found',
      });
    }

    return { success: true };
  }

  /**
   * Test webhook endpoint by sending a synthetic event
   */
  async test(
    tenantId: string,
    input: TestWebhookInput
  ): Promise<{ deliveryId: string }> {
    const endpoint = await this.repository.findEndpoint(tenantId, input.id);

    if (!endpoint) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Webhook endpoint not found',
      });
    }

    if (!endpoint.enabled) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot test disabled webhook endpoint',
      });
    }

    // Create synthetic test payload
    const testPayload = input.payload || {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook delivery',
    };

    // Generate dedupe key for test event
    const dedupeKey = `test:${endpoint.id}:${Date.now()}`;

    // Create delivery record
    const delivery = await this.repository.createDelivery({
      tenantId,
      endpointId: endpoint.id,
      eventType: 'webhook.test',
      payload: testPayload,
      status: 'pending',
      dedupeKey,
    });

    // Insert into outbox for processing
    await this.repository.insertOutbox({
      tenantId,
      endpointId: endpoint.id,
      eventType: 'webhook.test',
      payload: testPayload,
      dedupeKey,
    });

    return { deliveryId: delivery.id };
  }

  /**
   * Query delivery history for an endpoint
   */
  async deliveries(
    tenantId: string,
    input: QueryDeliveriesInput
  ): Promise<DeliveriesQueryResponse> {
    const { id, status, page, pageSize } = input;

    // Verify endpoint belongs to tenant
    const endpoint = await this.repository.findEndpoint(tenantId, id);
    if (!endpoint) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Webhook endpoint not found',
      });
    }

    const offset = (page - 1) * pageSize;

    const queryOptions: {
      limit: number;
      offset: number;
      status?: 'pending' | 'success' | 'failed';
    } = {
      limit: pageSize,
      offset,
    };

    if (status) {
      queryOptions.status = status;
    }

    const { deliveries, total } = await this.repository.queryDeliveries(
      tenantId,
      id,
      queryOptions
    );

    return {
      deliveries: deliveries.map((d) => ({
        id: d.id,
        endpointId: d.endpointId,
        eventType: d.eventType,
        payload: d.payload,
        status: d.status,
        attempts: d.attempts,
        lastAttemptAt: d.lastAttemptAt,
        responseCode: d.responseCode,
        error: d.error,
        createdAt: d.createdAt,
      })),
      total,
      page,
      pageSize,
      hasMore: offset + deliveries.length < total,
    };
  }

  /**
   * Convert database model to response DTO
   */
  private toResponse(endpoint: {
    id: string;
    url: string;
    secret: string;
    events: string[];
    enabled: boolean;
    retryPolicy: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): WebhookEndpointResponse {
    const retryPolicy = endpoint.retryPolicy as RetryPolicy;
    return {
      id: endpoint.id,
      url: endpoint.url,
      secretPreview: this.generateSecretPreview(endpoint.secret),
      events: endpoint.events,
      enabled: endpoint.enabled,
      retryPolicy: {
        attempts: retryPolicy.attempts ?? 5,
        backoffMs: retryPolicy.backoffMs ?? 1000,
        maxBackoffMs: retryPolicy.maxBackoffMs,
      },
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    };
  }

  /**
   * Generate secret preview (e.g., "whsec_****abc")
   */
  private generateSecretPreview(secret: string): string {
    if (secret.length <= 10) {
      return '****';
    }
    const prefix = secret.substring(0, 6);
    const suffix = secret.substring(secret.length - 3);
    return `${prefix}****${suffix}`;
  }
}
