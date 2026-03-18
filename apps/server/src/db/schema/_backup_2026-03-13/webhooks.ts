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
import { createSelectSchema } from 'drizzle-zod';
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
    organizationId: text('organization_id').notNull(),
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
    organizationIdx: index('idx_webhook_endpoints_tenant').on(table.organizationId),
    enabledIdx: index('idx_webhook_endpoints_enabled').on(
      table.organizationId,
      table.enabled
    ),
    tenantUrlUnique: uniqueIndex('uq_webhook_endpoints_tenant_url').on(
      table.organizationId,
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
    organizationId: text('organization_id').notNull(),
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
      table.organizationId,
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
    organizationId: text('organization_id').notNull(),
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
    organizationIdx: index('idx_webhook_outbox_tenant').on(table.organizationId),
  })
);

/**
 * Zod Schemas (auto-generated from Drizzle)
 */
const retryPolicySchema = z.object({
  attempts: z.number().min(0).max(10),
  backoffMs: z.number().min(100).max(60000),
  maxBackoffMs: z.number().optional(),
});

const jsonPayloadSchema = z.record(z.unknown());

export const insertWebhookEndpointSchema = z.object({
  id: z.string().optional(),
  organizationId: z.string().min(1),
  url: z.string().url(),
  secret: z.string().min(1),
  events: z.array(z.string()).min(1),
  enabled: z.boolean().optional(),
  retryPolicy: retryPolicySchema,
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectWebhookEndpointSchema = createSelectSchema(webhookEndpoints);

export const insertWebhookDeliverySchema = z.object({
  id: z.string().optional(),
  organizationId: z.string().min(1),
  endpointId: z.string().min(1),
  eventType: z.string().min(1),
  payload: jsonPayloadSchema,
  status: z.enum(['pending', 'success', 'failed']).optional(),
  attempts: z.number().int().min(0).optional(),
  lastAttemptAt: z.date().nullable().optional(),
  responseCode: z.number().int().nullable().optional(),
  error: z.string().nullable().optional(),
  dedupeKey: z.string().min(1),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});
export const selectWebhookDeliverySchema = createSelectSchema(webhookDeliveries);

export const insertWebhookOutboxSchema = z.object({
  id: z.string().optional(),
  organizationId: z.string().min(1),
  endpointId: z.string().min(1),
  eventType: z.string().min(1),
  payload: jsonPayloadSchema,
  dedupeKey: z.string().min(1),
  availableAt: z.date().optional(),
  lockedAt: z.date().nullable().optional(),
  lockToken: z.string().nullable().optional(),
  createdAt: z.date().optional(),
});
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
