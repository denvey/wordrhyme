/**
 * Webhook Repository
 *
 * Data access layer for webhook system using Drizzle ORM.
 */
import { Injectable } from '@nestjs/common';
import { eq, and, desc, lte, inArray, or, isNull, sql, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  webhookEndpoints,
  webhookDeliveries,
  webhookOutbox,
  type WebhookEndpoint,
  type InsertWebhookEndpoint,
  type WebhookDelivery,
  type InsertWebhookDelivery,
  type WebhookOutbox,
  type InsertWebhookOutbox,
} from '../db/schema/webhooks.js';

@Injectable()
export class WebhookRepository {
  // ===== Webhook Endpoints =====

  /**
   * Create a new webhook endpoint
   */
  async createEndpoint(data: InsertWebhookEndpoint): Promise<WebhookEndpoint> {
    const [endpoint] = await db
      .insert(webhookEndpoints)
      .values(data)
      .returning();

    return endpoint!;
  }

  /**
   * Find all endpoints for a tenant
   */
  async findEndpoints(organizationId: string): Promise<WebhookEndpoint[]> {
    return db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.organizationId, organizationId))
      .orderBy(desc(webhookEndpoints.createdAt));
  }

  /**
   * Find endpoint by ID (with tenant check)
   */
  async findEndpoint(
    organizationId: string,
    id: string
  ): Promise<WebhookEndpoint | undefined> {
    const [endpoint] = await db
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.id, id),
          eq(webhookEndpoints.organizationId, organizationId)
        )
      )
      .limit(1);

    return endpoint;
  }

  /**
   * Find endpoints subscribed to a specific event type
   */
  async findSubscribedEndpoints(
    organizationId: string,
    eventType: string
  ): Promise<WebhookEndpoint[]> {
    const allEndpoints = await db
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.organizationId, organizationId),
          eq(webhookEndpoints.enabled, true)
        )
      );

    // Filter by event subscription (array contains)
    return allEndpoints.filter((endpoint) =>
      endpoint.events.includes(eventType)
    );
  }

  /**
   * Update endpoint
   */
  async updateEndpoint(
    organizationId: string,
    id: string,
    data: Partial<InsertWebhookEndpoint>
  ): Promise<WebhookEndpoint | undefined> {
    const [updated] = await db
      .update(webhookEndpoints)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(webhookEndpoints.id, id),
          eq(webhookEndpoints.organizationId, organizationId)
        )
      )
      .returning();

    return updated;
  }

  /**
   * Delete endpoint
   */
  async deleteEndpoint(organizationId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.id, id),
          eq(webhookEndpoints.organizationId, organizationId)
        )
      )
      .returning();

    return result.length > 0;
  }

  // ===== Webhook Deliveries =====

  /**
   * Create a delivery record
   */
  async createDelivery(
    data: InsertWebhookDelivery
  ): Promise<WebhookDelivery> {
    const [delivery] = await db
      .insert(webhookDeliveries)
      .values(data)
      .returning();

    return delivery!;
  }

  /**
   * Find delivery by ID
   */
  async findDelivery(id: string): Promise<WebhookDelivery | undefined> {
    const [delivery] = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, id))
      .limit(1);

    return delivery;
  }

  /**
   * Find delivery by dedupe key
   */
  async findDeliveryByDedupeKey(
    dedupeKey: string
  ): Promise<WebhookDelivery | undefined> {
    const [delivery] = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.dedupeKey, dedupeKey))
      .limit(1);

    return delivery;
  }

  /**
   * Query deliveries for an endpoint (with pagination)
   */
  async queryDeliveries(
    organizationId: string,
    endpointId: string,
    options: {
      status?: 'pending' | 'success' | 'failed';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    const { status, limit = 50, offset = 0 } = options;

    const conditions = [
      eq(webhookDeliveries.organizationId, organizationId),
      eq(webhookDeliveries.endpointId, endpointId),
    ];

    if (status) {
      conditions.push(eq(webhookDeliveries.status, status));
    }

    const [deliveries, countResult] = await Promise.all([
      db
        .select()
        .from(webhookDeliveries)
        .where(and(...conditions))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(webhookDeliveries)
        .where(and(...conditions)),
    ]);

    return {
      deliveries,
      total: Number(countResult[0]?.count ?? 0),
    };
  }

  /**
   * Update delivery status
   */
  async updateDelivery(
    id: string,
    data: Partial<InsertWebhookDelivery>
  ): Promise<WebhookDelivery | undefined> {
    const [updated] = await db
      .update(webhookDeliveries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(webhookDeliveries.id, id))
      .returning();

    return updated;
  }

  // ===== Webhook Outbox =====

  /**
   * Insert outbox entry (idempotent via dedupe_key unique constraint)
   */
  async insertOutbox(data: InsertWebhookOutbox): Promise<boolean> {
    try {
      await db.insert(webhookOutbox).values(data);
      return true;
    } catch (error: unknown) {
      // Unique constraint violation on dedupe_key (already exists)
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === '23505'
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Poll outbox for available entries (with advisory locking)
   */
  async pollOutbox(batchSize: number = 100): Promise<WebhookOutbox[]> {
    const lockToken = crypto.randomUUID();
    const now = new Date();
    const lockExpiry = new Date(Date.now() - 30_000); // 30 seconds ago

    // Atomically select and lock available entries using UPDATE...RETURNING
    // Note: PostgreSQL UPDATE doesn't support LIMIT directly
    // The WHERE clause naturally limits results to available unlocked entries
    const entries = await db
      .update(webhookOutbox)
      .set({
        lockedAt: now,
        lockToken,
      })
      .where(
        and(
          lte(webhookOutbox.availableAt, now),
          // Not locked OR lock expired
          or(
            isNull(webhookOutbox.lockedAt),
            lte(webhookOutbox.lockedAt, lockExpiry)
          )
        )
      )
      .returning();

    return entries.slice(0, batchSize);
  }

  /**
   * Delete outbox entry after processing
   */
  async deleteOutbox(id: string): Promise<void> {
    await db.delete(webhookOutbox).where(eq(webhookOutbox.id, id));
  }

  /**
   * Delete multiple outbox entries
   */
  async deleteOutboxBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(webhookOutbox).where(inArray(webhookOutbox.id, ids));
  }
}
