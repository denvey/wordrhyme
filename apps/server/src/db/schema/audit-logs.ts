import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import type { ActorType } from '../../context/async-local-storage';

/**
 * Audit Logs Table
 *
 * Records permission checks, sensitive operations.
 *
 * IMPORTANT: This table is APPEND-ONLY. No UPDATE or DELETE operations allowed.
 * Use archive() method to move old records to audit_logs_archive.
 */
export const auditLogs = pgTable('audit_logs', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

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

    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
    organizationIdx: index('audit_logs_organization_idx').on(table.organizationId),
    actorIdx: index('audit_logs_actor_idx').on(table.actorType, table.actorId),
    actionIdx: index('audit_logs_action_idx').on(table.action),
    createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
    traceIdx: index('audit_logs_trace_idx').on(table.traceId),
}));

export type AuditLogEntry = typeof auditLogs.$inferSelect;
export type InsertAuditLogEntry = typeof auditLogs.$inferInsert;
