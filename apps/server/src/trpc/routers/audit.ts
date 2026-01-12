import { z } from 'zod';
import { router, protectedProcedure, requirePermission } from '../trpc.js';
import { db } from '../../db/index.js';
import { auditEvents, type AuditQueryFilters } from '../../db/schema/definitions.js';
import { eq, and, desc, gte, lte, sql, count } from 'drizzle-orm';

/**
 * Input schema for audit list query
 */
const auditListInputSchema = z.object({
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(20),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  actorId: z.string().optional(),
  actorType: z.enum(['user', 'system', 'plugin', 'api-token']).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  traceId: z.string().optional(),
});

/**
 * Input schema for audit export
 */
const auditExportInputSchema = z.object({
  format: z.enum(['csv', 'json']),
  filters: z.object({
    entityType: z.string().optional(),
    action: z.string().optional(),
    actorId: z.string().optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
  }).optional(),
  limit: z.number().min(1).max(10000).default(1000),
});

/**
 * Audit Router
 *
 * Provides tRPC endpoints for querying audit logs.
 * All endpoints require admin permissions.
 */
export const auditRouter = router({
  /**
   * List audit events with pagination and filtering
   */
  list: protectedProcedure
    .use(requirePermission('core:audit:read'))
    .input(auditListInputSchema)
    .query(async ({ ctx, input }) => {
      const { page, pageSize, ...filters } = input;
      const offset = (page - 1) * pageSize;

      // Build query conditions
      const conditions = [];

      if (ctx.tenantId) {
        conditions.push(eq(auditEvents.tenantId, ctx.tenantId));
      }
      if (filters.entityType) {
        conditions.push(eq(auditEvents.entityType, filters.entityType));
      }
      if (filters.entityId) {
        conditions.push(eq(auditEvents.entityId, filters.entityId));
      }
      if (filters.action) {
        conditions.push(eq(auditEvents.action, filters.action));
      }
      if (filters.actorId) {
        conditions.push(eq(auditEvents.actorId, filters.actorId));
      }
      if (filters.actorType) {
        conditions.push(eq(auditEvents.actorType, filters.actorType));
      }
      if (filters.traceId) {
        conditions.push(eq(auditEvents.traceId, filters.traceId));
      }
      if (filters.startTime) {
        conditions.push(gte(auditEvents.createdAt, new Date(filters.startTime)));
      }
      if (filters.endTime) {
        conditions.push(lte(auditEvents.createdAt, new Date(filters.endTime)));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const countResult = await db
        .select({ total: count() })
        .from(auditEvents)
        .where(whereClause);

      const total = countResult[0]?.total ?? 0;

      // Get paginated data
      const data = await db
        .select()
        .from(auditEvents)
        .where(whereClause)
        .orderBy(desc(auditEvents.createdAt))
        .limit(pageSize)
        .offset(offset);

      return {
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    }),

  /**
   * Get a single audit event by ID
   */
  get: protectedProcedure
    .use(requirePermission('core:audit:read'))
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.id, input.id),
            ctx.tenantId ? eq(auditEvents.tenantId, ctx.tenantId) : undefined
          )
        )
        .limit(1);

      if (!result[0]) {
        return null;
      }

      return result[0];
    }),

  /**
   * Get audit statistics (for dashboard)
   */
  stats: protectedProcedure
    .use(requirePermission('core:audit:read'))
    .query(async ({ ctx }) => {
      const conditions = ctx.tenantId
        ? [eq(auditEvents.tenantId, ctx.tenantId)]
        : [];

      // Count by entity type
      const byEntityType = await db
        .select({
          entityType: auditEvents.entityType,
          count: sql<number>`count(*)::int`,
        })
        .from(auditEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
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
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(auditEvents.action)
        .orderBy(desc(sql`count(*)`))
        .limit(10);

      // Total count
      const totalResult = await db
        .select({ total: count() })
        .from(auditEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      // Recent activity (last 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const recentResult = await db
        .select({ count: count() })
        .from(auditEvents)
        .where(
          and(
            ...(conditions.length > 0 ? conditions : []),
            gte(auditEvents.createdAt, oneDayAgo)
          )
        );

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
    .use(requirePermission('core:audit:read'))
    .query(async ({ ctx }) => {
      const result = await db
        .selectDistinct({ entityType: auditEvents.entityType })
        .from(auditEvents)
        .where(ctx.tenantId ? eq(auditEvents.tenantId, ctx.tenantId) : undefined)
        .orderBy(auditEvents.entityType);

      return result.map((r) => r.entityType);
    }),

  /**
   * Get distinct actions (for filter dropdown)
   */
  actions: protectedProcedure
    .use(requirePermission('core:audit:read'))
    .query(async ({ ctx }) => {
      const result = await db
        .selectDistinct({ action: auditEvents.action })
        .from(auditEvents)
        .where(ctx.tenantId ? eq(auditEvents.tenantId, ctx.tenantId) : undefined)
        .orderBy(auditEvents.action);

      return result.map((r) => r.action);
    }),

  /**
   * Export audit events (returns data for client-side file generation)
   */
  export: protectedProcedure
    .use(requirePermission('core:audit:export'))
    .input(auditExportInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { format, filters, limit } = input;

      const conditions = [];

      if (ctx.tenantId) {
        conditions.push(eq(auditEvents.tenantId, ctx.tenantId));
      }
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
      const csvData = data.map((row) => ({
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

export type AuditRouter = typeof auditRouter;
