import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import type { ActorType } from '../../context/async-local-storage';

/**
 * Audit Events Archive Table
 *
 * Same structure as audit_events, used for cold storage of old records.
 * Records are moved here by the archive() method after retention period.
 */
export const auditEventsArchive = pgTable('audit_events_archive', {
  id: text('id').primaryKey(),

  // Entity identification
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),

  // Multi-tenancy
  organizationId: text('organization_id'),

  // Action
  action: text('action').notNull(),

  // Changes
  changes: jsonb('changes').$type<{
    old?: unknown;
    new?: unknown;
  }>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),

  // Actor
  actorId: text('actor_id').notNull(),
  actorType: text('actor_type').notNull().$type<ActorType>().default('user'),
  actorIp: text('actor_ip'),
  userAgent: text('user_agent'),

  // Correlation & Tracing
  requestId: text('request_id'),
  sessionId: text('session_id'),
  traceId: text('trace_id'),

  // Timestamps
  createdAt: timestamp('created_at').notNull(),
  archivedAt: timestamp('archived_at').notNull().defaultNow(),
}, (table) => ({
  entityIdx: index('audit_events_archive_entity_idx').on(table.entityType, table.entityId),
  organizationIdx: index('audit_events_archive_organization_idx').on(table.organizationId),
  timeIdx: index('audit_events_archive_time_idx').on(table.createdAt),
}));

export type ArchivedAuditEvent = typeof auditEventsArchive.$inferSelect;

/**
 * Audit Logs Archive Table
 *
 * Same structure as audit_logs, used for cold storage of old records.
 */
export const auditLogsArchive = pgTable('audit_logs_archive', {
  id: text('id').primaryKey(),

  // Actor
  actorType: text('actor_type').notNull().$type<ActorType>(),
  actorId: text('actor_id').notNull(),

  // Context
  organizationId: text('organization_id').notNull(),

  // Action
  action: text('action').notNull(),
  resource: text('resource'),

  // Result
  result: text('result').notNull().$type<'allow' | 'deny' | 'error'>(),
  reason: text('reason'),

  // Metadata
  metadata: jsonb('metadata'),

  // Audit enhancement fields
  actorIp: text('actor_ip'),
  userAgent: text('user_agent'),
  traceId: text('trace_id'),

  // Timestamps
  createdAt: timestamp('created_at').notNull(),
  archivedAt: timestamp('archived_at').notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index('audit_logs_archive_organization_idx').on(table.organizationId),
  actorIdx: index('audit_logs_archive_actor_idx').on(table.actorType, table.actorId),
  timeIdx: index('audit_logs_archive_time_idx').on(table.createdAt),
}));

export type ArchivedAuditLog = typeof auditLogsArchive.$inferSelect;
