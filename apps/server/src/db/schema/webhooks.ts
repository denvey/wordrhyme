/**
 * Webhook System - Database Schema
 *
 * Implements transactional outbox pattern for reliable webhook delivery.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

/**
 * Webhook Endpoints Table
 *
 * Stores user-configured webhook endpoints with subscription settings.
 */
export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id').notNull(),
    url: text('url').notNull(),
    secret: text('secret').notNull(), // HMAC signing secret
    events: text('events')
      .array()
      .notNull()
      .$defaultFn(() => []),
    enabled: boolean('enabled').notNull().default(true),
    retryPolicy: jsonb('retry_policy')
      .notNull()
      .$type<{
        attempts: number;
        backoffMs: number;
        maxBackoffMs?: number | undefined;
      }>()
      .default({ attempts: 5, backoffMs: 1000 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_webhook_endpoints_tenant').on(table.tenantId),
    enabledIdx: index('idx_webhook_endpoints_enabled').on(
      table.tenantId,
      table.enabled
    ),
    tenantUrlUnique: uniqueIndex('uq_webhook_endpoints_tenant_url').on(
      table.tenantId,
      table.url
    ),
  })
);

/**
 * Webhook Deliveries Table
 *
 * Records every webhook delivery attempt with results.
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id').notNull(),
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    status: text('status')
      .notNull()
      .$type<'pending' | 'success' | 'failed'>()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    responseCode: integer('response_code'),
    error: text('error'),
    dedupeKey: text('dedupe_key').notNull(), // eventId:endpointId
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    endpointIdx: index('idx_webhook_deliveries_endpoint').on(
      table.endpointId
    ),
    tenantStatusIdx: index('idx_webhook_deliveries_tenant_status').on(
      table.tenantId,
      table.status
    ),
    dedupeUnique: uniqueIndex('idx_webhook_deliveries_dedupe').on(
      table.dedupeKey
    ),
    createdIdx: index('idx_webhook_deliveries_created').on(table.createdAt),
  })
);

/**
 * Webhook Outbox Table
 *
 * Transactional outbox for reliable event delivery.
 * Events are written here first, then processed by a background worker.
 */
export const webhookOutbox = pgTable(
  'webhook_outbox',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id').notNull(),
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    dedupeKey: text('dedupe_key').notNull(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockToken: text('lock_token'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    availableIdx: index('idx_webhook_outbox_available').on(table.availableAt),
    dedupeUnique: uniqueIndex('idx_webhook_outbox_dedupe').on(
      table.dedupeKey
    ),
    tenantIdx: index('idx_webhook_outbox_tenant').on(table.tenantId),
  })
);

/**
 * Zod Schemas (auto-generated from Drizzle)
 */
export const insertWebhookEndpointSchema = createInsertSchema(webhookEndpoints, {
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  retryPolicy: z.object({
    attempts: z.number().min(0).max(10),
    backoffMs: z.number().min(100).max(60000),
    maxBackoffMs: z.number().optional(),
  }),
});

export const selectWebhookEndpointSchema = createSelectSchema(webhookEndpoints);

export const insertWebhookDeliverySchema = createInsertSchema(webhookDeliveries);
export const selectWebhookDeliverySchema = createSelectSchema(webhookDeliveries);

export const insertWebhookOutboxSchema = createInsertSchema(webhookOutbox);
export const selectWebhookOutboxSchema = createSelectSchema(webhookOutbox);

/**
 * TypeScript Types
 */
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type InsertWebhookEndpoint = typeof webhookEndpoints.$inferInsert;

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = typeof webhookDeliveries.$inferInsert;

export type WebhookOutbox = typeof webhookOutbox.$inferSelect;
export type InsertWebhookOutbox = typeof webhookOutbox.$inferInsert;

export type RetryPolicy = {
  attempts: number;
  backoffMs: number;
  maxBackoffMs?: number;
};
