import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import type { ActorType } from '../../context/async-local-storage';

/**
 * Audit Events Table - Generic Entity Change Tracking
 *
 * This is a platform-level audit table that tracks changes to any entity.
 * Used by Settings, Users, Roles, Feature Flags, and other modules.
 *
 * Different from audit_logs which is specifically for permission checks.
 *
 * IMPORTANT: This table is APPEND-ONLY. No UPDATE or DELETE operations allowed.
 * Use archive() method to move old records to audit_events_archive.
 */
export const auditEvents = pgTable('audit_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

  // Entity identification
  entityType: text('entity_type').notNull(), // 'setting', 'user', 'role', 'feature_flag', etc.
  entityId: text('entity_id'), // Entity ID (can be NULL for batch operations)

  // Multi-tenancy
  organizationId: text('organization_id'), // NULL for global operations

  // Action
  action: text('action').notNull(), // 'create', 'update', 'delete', 'login', 'logout', etc.

  // Changes (flexible structure)
  changes: jsonb('changes').$type<{
    old?: unknown;
    new?: unknown;
  }>(), // { old: {...}, new: {...} } or custom structure
  metadata: jsonb('metadata').$type<Record<string, unknown>>(), // Extra context (e.g., setting key, encrypted flag)

  // Actor
  actorId: text('actor_id').notNull(),
  actorType: text('actor_type').notNull().$type<ActorType>().default('user'), // 'user', 'system', 'plugin', 'api-token'
  actorIp: text('actor_ip'),
  userAgent: text('user_agent'),

  // Correlation & Tracing
  requestId: text('request_id'), // Request tracking ID
  sessionId: text('session_id'),
  traceId: text('trace_id'), // Distributed trace ID

  // Timestamp
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // Index for entity queries
  entityIdx: index('audit_events_entity_idx').on(table.entityType, table.entityId),
  // Index for tenant queries (partial - only when organization_id is not null)
  organizationIdx: index('audit_events_organization_idx').on(table.organizationId),
  // Index for actor queries
  actorIdx: index('audit_events_actor_idx').on(table.actorId),
  // Index for time-based queries
  timeIdx: index('audit_events_time_idx').on(table.createdAt),
  // Index for action queries
  actionIdx: index('audit_events_action_idx').on(table.entityType, table.action),
  // Index for trace queries
  traceIdx: index('audit_events_trace_idx').on(table.traceId),
}));

export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = typeof auditEvents.$inferInsert;

/**
 * Audit Event Input Interface
 *
 * Used by AuditService.log() - actor context is auto-populated from AsyncLocalStorage
 */
export interface AuditEventInput {
  entityType: string;
  entityId?: string | undefined;
  organizationId?: string | undefined;
  action: string;
  changes?: {
    old?: unknown;
    new?: unknown;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Audit Query Filters
 */
export interface AuditQueryFilters {
  entityType?: string;
  entityId?: string;
  organizationId?: string;
  actorId?: string;
  action?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}
