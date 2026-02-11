/**
 * Audit Archive Database Schema
 *
 * Drizzle ORM table definitions for archived audit records.
 * These are the source of truth - Zod schemas are generated from these.
 */
import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { organization } from './auth';
import type { AuditChanges } from './audit-events';

// ============================================================
// Types
// ============================================================

export type ArchiveActorType = 'user' | 'plugin' | 'system';

// ============================================================
// Audit Events Archive Table
// ============================================================

/**
 * Audit Events Archive Table
 *
 * Same structure as audit_events, used for cold storage of old records.
 * Records are moved here by the archive() method after retention period.
 */
export const auditEventsArchive = pgTable(
  'audit_events_archive',
  {
    id: text('id').primaryKey(),

    // Entity identification
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),

    // FK to organization table (nullable for global operations)
    organizationId: text('organization_id')
      .references(() => organization.id, { onDelete: 'set null' }),

    // Action
    action: text('action').notNull(),

    // Changes
    changes: jsonb('changes').$type<AuditChanges>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    // Actor
    actorId: text('actor_id').notNull(),
    actorType: text('actor_type').notNull().$type<ArchiveActorType>().default('user'),
    actorIp: text('actor_ip'),
    userAgent: text('user_agent'),

    // Correlation & Tracing
    requestId: text('request_id'),
    sessionId: text('session_id'),
    traceId: text('trace_id'),

    // Timestamps
    createdAt: timestamp('created_at').notNull(),
    archivedAt: timestamp('archived_at').notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_archive_entity_idx').on(table.entityType, table.entityId),
    index('audit_events_archive_organization_idx').on(table.organizationId),
    index('audit_events_archive_time_idx').on(table.createdAt),
  ]
);

// ============================================================
// Audit Logs Archive Table
// ============================================================

/**
 * Audit Logs Archive Table
 *
 * Same structure as audit_logs, used for cold storage of old records.
 */
export const auditLogsArchive = pgTable(
  'audit_logs_archive',
  {
    id: text('id').primaryKey(),

    // Actor
    actorType: text('actor_type').notNull().$type<ArchiveActorType>(),
    actorId: text('actor_id').notNull(),

    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),

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
  },
  (table) => [
    index('audit_logs_archive_organization_idx').on(table.organizationId),
    index('audit_logs_archive_actor_idx').on(table.actorType, table.actorId),
    index('audit_logs_archive_time_idx').on(table.createdAt),
  ]
);

// ============================================================
// Zod Schemas
// ============================================================

export const auditEventsArchiveSchema = createInsertSchema(auditEventsArchive);
export const auditLogsArchiveSchema = createInsertSchema(auditLogsArchive);

// ============================================================
// Inferred Types
// ============================================================

export type ArchivedAuditEvent = typeof auditEventsArchive.$inferSelect;
export type ArchivedAuditLog = typeof auditLogsArchive.$inferSelect;
