/**
 * Audit tRPC Router
 *
 * Uses @wordrhyme/auto-crud-server for standard list/get operations.
 * Custom routes for aggregation (stats, entityTypes, actions) and export.
 *
 * @reason Audit table is APPEND-ONLY — only list/get are exposed from auto-crud.
 * Stats/export require GROUP BY / DISTINCT which auto-crud cannot generate.
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { auditEvents } from '@wordrhyme/db';
import { eq, and, desc, gte, lte, sql, count } from 'drizzle-orm';
import { createCrudRouter, type CrudOperation } from '@wordrhyme/auto-crud-server';

// ============================================================================
// Auto-CRUD: list + get
// ============================================================================

const auditCrud = createCrudRouter({
  table: auditEvents,
  omitFields: ['organizationId'],

  procedure: (op: CrudOperation) => {
    const action = (op === 'list' || op === 'get') ? 'read' : op;
    return protectedProcedure.meta({
      permission: { action, subject: 'AuditLog' },
    });
  },

  filterableColumns: [
    'entityType', 'entityId', 'action',
    'actorId', 'actorType', 'traceId', 'createdAt',
  ],
  sortableColumns: ['createdAt', 'entityType', 'action', 'actorType'],
});

// ============================================================================
// Router Assembly
// ============================================================================

export const auditRouter = (() => {
  // Only expose read operations from auto-crud (audit is append-only)
  const { list, get } = auditCrud.procedures;

  return router({
    // Auto-CRUD routes
    list,
    get,

    // ========================================================================
    // Custom routes (aggregation — cannot be auto-generated)
    // ========================================================================

    /**
     * Get audit statistics (for dashboard)
     */
    stats: protectedProcedure
      .meta({ permission: { action: 'read', subject: 'AuditLog' } })
      .query(async () => {
        // Count by entity type
        const byEntityType = await db
          .select({
            entityType: auditEvents.entityType,
            count: sql<number>`count(*)::int`,
          })
          .from(auditEvents)
          .groupBy(auditEvents.entityType)
          .orderBy(desc(sql`count(*)`))
          .limit(10);

        // Count by action
        const byAction = await db
          .select({
            action: auditEvents.action,
            count: sql<number>`count(*)::int`,
          })
          .from(auditEvents)
          .groupBy(auditEvents.action)
          .orderBy(desc(sql`count(*)`))
          .limit(10);

        // Total count
        const totalResult = await db
          .select({ total: count() })
          .from(auditEvents);

        // Recent activity (last 24 hours)
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        const recentResult = await db
          .select({ count: count() })
          .from(auditEvents)
          .where(gte(auditEvents.createdAt, oneDayAgo));

        return {
          total: totalResult[0]?.total ?? 0,
          last24Hours: recentResult[0]?.count ?? 0,
          byEntityType,
          byAction,
        };
      }),

    /**
     * Get distinct entity types (for filter dropdown)
     */
    entityTypes: protectedProcedure
      .meta({ permission: { action: 'read', subject: 'AuditLog' } })
      .query(async () => {
        const result = await db
          .selectDistinct({ entityType: auditEvents.entityType })
          .from(auditEvents)
          .orderBy(auditEvents.entityType);

        return result.map((r: { entityType: string | null }) => r.entityType);
      }),

    /**
     * Get distinct actions (for filter dropdown)
     */
    actions: protectedProcedure
      .meta({ permission: { action: 'read', subject: 'AuditLog' } })
      .query(async () => {
        const result = await db
          .selectDistinct({ action: auditEvents.action })
          .from(auditEvents)
          .orderBy(auditEvents.action);

        return result.map((r: { action: string | null }) => r.action);
      }),

    /**
     * Export audit events (returns data for client-side file generation)
     */
    export: protectedProcedure
      .meta({ permission: { action: 'manage', subject: 'AuditLog' } })
      .input(
        z.object({
          format: z.enum(['csv', 'json']),
          filters: z
            .object({
              entityType: z.string().optional(),
              action: z.string().optional(),
              actorId: z.string().optional(),
              startTime: z.string().datetime().optional(),
              endTime: z.string().datetime().optional(),
            })
            .optional(),
          limit: z.number().min(1).max(10000).default(1000),
        }),
      )
      .mutation(async ({ input }) => {
        const { format, filters, limit } = input;

        const conditions = [];

        if (filters?.entityType) {
          conditions.push(eq(auditEvents.entityType, filters.entityType));
        }
        if (filters?.action) {
          conditions.push(eq(auditEvents.action, filters.action));
        }
        if (filters?.actorId) {
          conditions.push(eq(auditEvents.actorId, filters.actorId));
        }
        if (filters?.startTime) {
          conditions.push(gte(auditEvents.createdAt, new Date(filters.startTime)));
        }
        if (filters?.endTime) {
          conditions.push(lte(auditEvents.createdAt, new Date(filters.endTime)));
        }

        const data = await db
          .select()
          .from(auditEvents)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(auditEvents.createdAt))
          .limit(limit);

        if (format === 'json') {
          return {
            format: 'json' as const,
            data,
            filename: `audit-export-${new Date().toISOString().split('T')[0]}.json`,
          };
        }

        // CSV format - flatten data
        const csvData = data.map((row: typeof auditEvents.$inferSelect) => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          entityType: row.entityType,
          entityId: row.entityId ?? '',
          action: row.action,
          actorId: row.actorId,
          actorType: row.actorType,
          actorIp: row.actorIp ?? '',
          traceId: row.traceId ?? '',
          changes: row.changes ? JSON.stringify(row.changes) : '',
          metadata: row.metadata ? JSON.stringify(row.metadata) : '',
        }));

        return {
          format: 'csv' as const,
          data: csvData,
          filename: `audit-export-${new Date().toISOString().split('T')[0]}.csv`,
        };
      }),
  });
})();

export type AuditRouter = typeof auditRouter;
