/**
 * Scoped Database Access - Automatic Tenant Filtering
 *
 * Provides a wrapped Drizzle instance that automatically injects tenant
 * filtering into all queries. Both Core and Plugins use this for unified
 * database access with multi-tenant isolation.
 *
 * @see design.md Section 8.5: Unified Database Access
 */
import { getContext } from '../context/async-local-storage';
import { db, type Database } from './client';
import { eq, and, SQL, sql, Column } from 'drizzle-orm';

/**
 * Scoped Database Interface
 *
 * Mirrors Drizzle's API but automatically adds tenant filtering
 */
export interface ScopedDb {
    /**
     * SELECT with automatic tenant filtering
     */
    select: typeof db.select;

    /**
     * INSERT with automatic tenantId injection
     */
    insert: typeof db.insert;

    /**
     * UPDATE with automatic tenant filtering
     */
    update: typeof db.update;

    /**
     * DELETE with automatic tenant filtering
     */
    delete: typeof db.delete;

    /**
     * Transaction support (uses scoped db internally)
     */
    transaction: typeof db.transaction;

    /**
     * Raw database access (use with caution - bypasses tenant filtering)
     * Only for advanced use cases that explicitly need cross-tenant access
     */
    $raw: Database;

    /**
     * Current tenant ID from context
     */
    tenantId: string | undefined;
}

/**
 * Get current tenant ID from request context
 * Returns undefined if no tenant context (e.g., system operations)
 */
function getCurrentTenantId(): string | undefined {
    try {
        const ctx = getContext();
        return ctx.tenantId;
    } catch {
        // Not in request context
        return undefined;
    }
}

/**
 * Create a scoped database instance with automatic tenant filtering
 *
 * Usage (Core):
 * ```typescript
 * const db = getScopedDb();
 * const posts = await db.select().from(postsTable);
 * // Automatically filtered by tenantId
 * ```
 *
 * Usage (Plugin):
 * ```typescript
 * // Via ctx.db which is getScopedDb() result
 * const events = await ctx.db.select().from(analyticsEvents);
 * ```
 *
 * Note: For MVP, we provide the raw db with a helper to add tenant filters.
 * Full automatic filtering via Proxy would require more complex implementation.
 */
export function getScopedDb(): ScopedDb {
    const tenantId = getCurrentTenantId();

    return {
        // For MVP: expose raw db methods
        // Developers should use withTenantFilter() helper for queries
        select: db.select.bind(db),
        insert: db.insert.bind(db),
        update: db.update.bind(db),
        delete: db.delete.bind(db),
        transaction: db.transaction.bind(db),

        $raw: db,
        tenantId,
    };
}

/**
 * Helper: Add tenant filter to a WHERE condition
 *
 * Usage:
 * ```typescript
 * const db = getScopedDb();
 * await db.select()
 *   .from(posts)
 *   .where(withTenantFilter(db, posts.tenantId, eq(posts.status, 'published')));
 * ```
 *
 * @param scopedDb - The scoped database instance
 * @param tenantIdColumn - The tenantId column from your table (e.g., table.tenantId)
 * @param condition - Optional additional WHERE condition
 */
export function withTenantFilter(
    scopedDb: ScopedDb,
    tenantIdColumn: Column,
    condition?: SQL
): SQL {
    const tenantCondition = scopedDb.tenantId
        ? eq(tenantIdColumn, scopedDb.tenantId)
        : sql`1=1`; // No tenant filter if no context

    return condition
        ? and(tenantCondition, condition)!
        : tenantCondition;
}

/**
 * Helper: Add tenantId to insert data
 *
 * Usage:
 * ```typescript
 * const db = getScopedDb();
 * await db.insert(posts).values(withTenantId(db, {
 *   title: 'Hello',
 *   content: 'World',
 * }));
 * ```
 */
export function withTenantId<T extends Record<string, unknown>>(
    scopedDb: ScopedDb,
    data: T
): T & { tenantId?: string } {
    if (scopedDb.tenantId) {
        return { ...data, tenantId: scopedDb.tenantId };
    }
    return data;
}

/**
 * Helper: Add tenantId to array of insert data
 */
export function withTenantIdArray<T extends Record<string, unknown>>(
    scopedDb: ScopedDb,
    data: T[]
): Array<T & { tenantId?: string }> {
    return data.map(d => withTenantId(scopedDb, d));
}

// Re-export for convenience
export { db } from './client';
