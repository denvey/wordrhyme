/**
 * Audit Logs Database Schema
 *
 * Drizzle ORM table definitions for audit logging.
 * These are the source of truth - Zod schemas are generated from these.
 *
 * IMPORTANT: This table is APPEND-ONLY. No UPDATE or DELETE operations allowed.
 */
import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { organization } from './auth';

// ============================================================
// Types
// ============================================================

/**
 * Actor Type - who performed the action
 */
export type ActorType = 'user' | 'plugin' | 'system';

/**
 * Audit Result - outcome of the action
 */
export type AuditResult = 'allow' | 'deny' | 'error';

// ============================================================
// Audit Logs Table
// ============================================================

/**
 * Audit Logs Table
 *
 * Records permission checks, sensitive operations.
 *
 * IMPORTANT: This table is APPEND-ONLY. No UPDATE or DELETE operations allowed.
 * Use archive() method to move old records to audit_logs_archive.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Actor
    actorType: text('actor_type').notNull().$type<ActorType>(),
    actorId: text('actor_id').notNull(),

    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),

    // Action
    action: text('action').notNull(),
    resource: text('resource'),

    // Result
    result: text('result').notNull().$type<AuditResult>(),
    reason: text('reason'),

    // Metadata
    metadata: jsonb('metadata'),

    // Audit enhancement fields
    actorIp: text('actor_ip'),
    userAgent: text('user_agent'),
    traceId: text('trace_id'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_organization_idx').on(table.organizationId),
    index('audit_logs_actor_idx').on(table.actorType, table.actorId),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_created_at_idx').on(table.createdAt),
    index('audit_logs_trace_idx').on(table.traceId),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const auditLogSchema = createInsertSchema(auditLogs);

// ============================================================
// Inferred Types
// ============================================================

export type AuditLogEntry = typeof auditLogs.$inferSelect;
export type InsertAuditLogEntry = typeof auditLogs.$inferInsert;
