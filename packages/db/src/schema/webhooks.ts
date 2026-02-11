/**
 * Webhooks Database Schema
 *
 * Drizzle ORM table definitions for webhook system.
 * Implements transactional outbox pattern for reliable delivery.
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
import { createInsertSchema } from 'drizzle-zod';
import { organization } from './auth';

// ============================================================
// Types
// ============================================================

export type WebhookStatus = 'pending' | 'success' | 'failed';

export interface RetryPolicy {
  attempts: number;
  backoffMs: number;
  maxBackoffMs?: number;
}

// ============================================================
// Webhook Endpoints Table
// ============================================================

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
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    secret: text('secret').notNull(),
    events: text('events')
      .array()
      .notNull()
      .$defaultFn(() => []),
    enabled: boolean('enabled').notNull().default(true),
    retryPolicy: jsonb('retry_policy')
      .notNull()
      .$type<RetryPolicy>()
      .default({ attempts: 5, backoffMs: 1000 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_webhook_endpoints_tenant').on(table.organizationId),
    index('idx_webhook_endpoints_enabled').on(table.organizationId, table.enabled),
    uniqueIndex('uq_webhook_endpoints_tenant_url').on(table.organizationId, table.url),
  ],
);

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;

// ============================================================
// Webhook Deliveries Table
// ============================================================

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
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // FK to webhookEndpoints table
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    status: text('status').notNull().$type<WebhookStatus>().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    responseCode: integer('response_code'),
    error: text('error'),
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_webhook_deliveries_endpoint').on(table.endpointId),
    index('idx_webhook_deliveries_tenant_status').on(table.organizationId, table.status),
    uniqueIndex('idx_webhook_deliveries_dedupe').on(table.dedupeKey),
    index('idx_webhook_deliveries_created').on(table.createdAt),
  ],
);

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;

// ============================================================
// Webhook Outbox Table
// ============================================================

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
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // FK to webhookEndpoints table
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    dedupeKey: text('dedupe_key').notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockToken: text('lock_token'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_webhook_outbox_available').on(table.availableAt),
    uniqueIndex('idx_webhook_outbox_dedupe').on(table.dedupeKey),
    index('idx_webhook_outbox_tenant').on(table.organizationId),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const webhookEndpointSchema = createInsertSchema(webhookEndpoints);
export const webhookDeliverySchema = createInsertSchema(webhookDeliveries);
export const webhookOutboxSchema = createInsertSchema(webhookOutbox);

// ============================================================
// Inferred Types
// ============================================================

export type WebhookOutbox = typeof webhookOutbox.$inferSelect;
