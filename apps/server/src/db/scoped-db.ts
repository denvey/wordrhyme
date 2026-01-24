/**
 * Scoped Database Access - Automatic Tenant + LBAC Filtering
 *
 * Provides a wrapped Drizzle instance that automatically injects:
 * 1. Tenant filtering (multi-tenant isolation)
 * 2. LBAC filtering (row-level security based on tags)
 *
 * Supports BOTH Drizzle API styles:
 * 1. SQL-like API: db.select().from(table).where(...)
 * 2. Query API: db.query.tableName.findMany({...})
 *
 * Usage:
 * ```typescript
 * import { db } from '@/db';
 *
 * // SQL-like API (LBAC auto-injected)
 * const articles = await db.select().from(articlesTable).where(eq(status, 'published'));
 *
 * // Query API (LBAC auto-injected)
 * const articles = await db.query.articles.findMany({
 *   where: eq(articlesTable.status, 'published'),
 *   with: { author: true },
 * });
 *
 * // Raw access (bypasses LBAC)
 * const all = await db.$raw.select().from(articlesTable);
 * ```
 *
 * @see design.md Section 8.5: Unified Database Access
 * @see Frozen Spec: DB Wrapper (Security Enforcement Engine)
 */
import { getContext } from '../context/async-local-storage';
import { db as rawDb, type Database } from './client';
import { eq, and, or, SQL, sql, Column, getTableColumns } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { TagPrefix } from './schema/permission-fields';
import { keyBuilder } from '../lbac/key-builder';
// Audit imports - Using In-Memory Buffer pattern (no IO during DB operations)
import {
    addPendingLog,
    getAuditLayer,
    getBusinessAuditAction,
    getBusinessAuditLevel,
    getBusinessAuditMetadata,
    hasBusinessAudit,
} from '../audit/audit-context';
import {
    shouldSkipAudit,
    getTableName,
    INFRASTRUCTURE_ACTIONS,
} from '../audit/audit-config';

// ============================================================
// Types
// ============================================================

/**
 * User context for LBAC
 */
export interface LbacContext {
    userId: string;
    organizationId: string;
    teamIds?: string[];
    roles?: string[];
    isAdmin?: boolean;
}

/**
 * Table schema detection result
 */
interface TableSchemaInfo {
    hasOrganizationId: boolean;
    hasAclTags: boolean;
    hasDenyTags: boolean;
    organizationIdColumn: Column | undefined;
    aclTagsColumn: Column | undefined;
    denyTagsColumn: Column | undefined;
}

/**
 * LBAC query options
 */
interface LbacOptions {
    /** Skip LBAC filtering (for system queries) */
    skipLbac?: boolean;
    /** Skip tenant filter only */
    skipTenant?: boolean;
    /** Additional discovery logic (for plugins) */
    discovery?: SQL;
}

/**
 * Runtime context for scoped operations
 */
interface ScopedContext {
    organizationId: string | undefined;
    userId: string | undefined;
    teamIds: string[];
    roles: string[];
}

// ============================================================
// Schema Detection
// ============================================================

/**
 * Detect table schema for auto-filtering
 */
function detectTableSchema(table: PgTable): TableSchemaInfo {
    const columns = getTableColumns(table) as Record<string, Column>;

    const orgCol = columns['organizationId'] ?? columns['organization_id'];
    const aclCol = columns['aclTags'] ?? columns['acl_tags'];
    const denyCol = columns['denyTags'] ?? columns['deny_tags'];

    return {
        hasOrganizationId: orgCol !== undefined,
        hasAclTags: aclCol !== undefined,
        hasDenyTags: denyCol !== undefined,
        organizationIdColumn: orgCol,
        aclTagsColumn: aclCol,
        denyTagsColumn: denyCol,
    };
}

// ============================================================
// LBAC Filter Builder
// ============================================================

/**
 * Build LBAC filter with mandatory execution order:
 * 1️⃣ Tenant Filter
 * 2️⃣ Allow Filter (aclTags && userKeys)
 * 3️⃣ Deny Filter (NOT denyTags && userKeys) ← ABSOLUTE
 * 4️⃣ Discovery (optional, still subject to deny)
 */
async function buildLbacFilter(
    schema: TableSchemaInfo,
    options: LbacOptions = {}
): Promise<SQL | undefined> {
    if (options.skipLbac) return undefined;

    const ctx = getCurrentContext();
    const organizationId = ctx.organizationId;

    // Build user keys via KeyBuilder (includes plugin-provided keys)
    const userKeys = await keyBuilder.build({
        userId: ctx.userId ?? '',
        organizationId: ctx.organizationId ?? '',
    });

    const filters: SQL[] = [];

    // Keys array for SQL
    const keysArray = userKeys.length > 0
        ? sql`ARRAY[${sql.join(userKeys.map((k) => sql`${k}`), sql`, `)}]::text[]`
        : sql`ARRAY[]::text[]`;

    // 1️⃣ Tenant Filter
    if (schema.hasOrganizationId && schema.organizationIdColumn && organizationId && !options.skipTenant) {
        filters.push(eq(schema.organizationIdColumn, organizationId));
    }

    // 2️⃣ + 3️⃣ + 4️⃣ LBAC Logic
    if (schema.hasAclTags && schema.hasDenyTags && schema.aclTagsColumn && schema.denyTagsColumn) {
        if (userKeys.length > 0) {
            // Allow: aclTags && userKeys
            const allowFilter = sql`(${schema.aclTagsColumn} && ${keysArray})`;

            // Discovery (optional, from plugins like relationships)
            const accessFilter = options.discovery
                ? or(allowFilter, options.discovery)
                : allowFilter;

            // Deny: ABSOLUTE, cannot be bypassed
            const denyFilter = sql`NOT (${schema.denyTagsColumn} && ${keysArray})`;

            // Final: (allow OR discovery) AND NOT deny
            filters.push(and(accessFilter!, denyFilter)!);
        } else {
            // No keys = no access
            filters.push(sql`FALSE`);
        }
    }

    if (filters.length === 0) return undefined;
    if (filters.length === 1) return filters[0];
    return filters.reduce((acc, f) => and(acc, f)!);
}

// ============================================================
// Context Helpers
// ============================================================

/**
 * Get current context from AsyncLocalStorage
 */
function getCurrentContext(): ScopedContext {
    try {
        const ctx = getContext();
        return {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            teamIds: ctx.teamIds ?? [],
            roles: ctx.userRoles ?? [],
        };
    } catch {
        return { organizationId: undefined, userId: undefined, teamIds: [], roles: [] };
    }
}

// ============================================================
// Audit Helpers (In-Memory Buffer Pattern)
// ============================================================

/**
 * Collect audit entry to in-memory buffer
 *
 * This does NOT write to database - just adds to pending logs.
 * The buffer is flushed by tRPC middleware after successful response.
 *
 * Benefits:
 * - Zero IO during DB operations
 * - No ghost logs (buffer discarded on error)
 * - Batch write at request end
 */
function collectAuditEntry(
    tableName: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    entityId: string | undefined,
    changes: { old?: Record<string, unknown>; new?: Record<string, unknown> }
): void {
    // Skip 'unknown' table names
    if (tableName === 'unknown') {
        return;
    }

    // Skip audit tables (prevent circular dependency)
    if (shouldSkipAudit(tableName)) {
        return;
    }

    // Determine action based on Layer 2 business audit or Layer 1 infrastructure
    const action = hasBusinessAudit()
        ? getBusinessAuditAction()!
        : INFRASTRUCTURE_ACTIONS[operation];

    const layer = getAuditLayer();

    // Add to pending logs buffer (zero IO)
    addPendingLog({
        entityType: tableName,
        entityId: entityId ?? 'unknown',
        action,
        changes,
        layer,
        level: getBusinessAuditLevel(),
        metadata: getBusinessAuditMetadata(),
    });
}

// ============================================================
// SQL-like API Wrapper: db.select().from(table)
// ============================================================

function wrapSelectBuilder(originalSelect: typeof rawDb.select) {
    return function select(fields?: any) {
        const selectBuilder = originalSelect(fields);
        const originalFrom = selectBuilder.from.bind(selectBuilder);

        // Override from() to inject LBAC
        selectBuilder.from = function wrappedFrom(table: PgTable, ...rest: any[]) {
            const query = originalFrom(table, ...rest);
            const schema = detectTableSchema(table);

            // If table doesn't have LBAC columns, return as-is
            if (!schema.hasAclTags || !schema.hasDenyTags) {
                return query;
            }

            // Wrap the query to inject LBAC filter
            return wrapQueryWithLbac(query, schema);
        };

        return selectBuilder;
    };
}

function wrapQueryWithLbac(query: any, schema: TableSchemaInfo) {
    const originalWhere = query.where?.bind(query);
    let userCondition: SQL | undefined;
    let lbacOptions: LbacOptions = {};

    // Override where() to capture user condition
    if (originalWhere) {
        query.where = function wrappedWhere(condition: SQL) {
            userCondition = condition;
            return query;
        };
    }

    // Add LBAC option methods
    query.$skipLbac = function() {
        lbacOptions.skipLbac = true;
        return query;
    };

    query.$skipTenant = function() {
        lbacOptions.skipTenant = true;
        return query;
    };

    query.$withDiscovery = function(discovery: SQL) {
        lbacOptions.discovery = discovery;
        return query;
    };

    // Wrap execute methods
    const wrapExecute = (originalMethod: Function, methodName: string) => {
        return async function(...args: any[]) {
            const lbacFilter = await buildLbacFilter(schema, lbacOptions);

            // Combine LBAC filter with user condition
            const finalCondition = lbacFilter && userCondition
                ? and(lbacFilter, userCondition)!
                : lbacFilter ?? userCondition;

            if (finalCondition && originalWhere) {
                // Apply where condition to query (Drizzle mutates the query object in-place)
                // IMPORTANT: Do NOT call filteredQuery[methodName] - it would call the wrapped
                // method again causing infinite recursion since filteredQuery === query
                originalWhere(finalCondition);
                // Call the original unwrapped method directly
                return originalMethod(...args);
            }

            return originalMethod(...args);
        };
    };

    // Wrap common execution methods
    if (query.execute) {
        const originalExecute = query.execute.bind(query);
        query.execute = wrapExecute(originalExecute, 'execute');
    }

    // Support await directly
    // DISABLED: .then wrapping causes infinite loop and logic bugs
    // The issue: originalWhere() returns the same query object, and
    // rawExecute doesn't include the where condition.
    // Users should use .execute() explicitly or Query API.
    // TODO: Implement proper thenable wrapper that doesn't cause recursion

    return query;
}

// ============================================================
// Query API Wrapper: db.query.tableName.findMany({...})
// ============================================================

function wrapQueryApi(originalQuery: typeof rawDb.query) {
    return new Proxy(originalQuery, {
        get(target, tableName: string) {
            const tableQuery = (target as any)[tableName];
            if (!tableQuery) return tableQuery;

            // Get the table schema for this table name
            const table = getTableByName(tableName);
            if (!table) return tableQuery;

            const schema = detectTableSchema(table);

            // If table doesn't have LBAC columns, return as-is
            if (!schema.hasAclTags || !schema.hasDenyTags) {
                return tableQuery;
            }

            // Wrap findMany and findFirst
            return new Proxy(tableQuery, {
                get(tableTarget, methodName: string) {
                    const method = tableTarget[methodName];
                    if (typeof method !== 'function') return method;

                    if (methodName === 'findMany' || methodName === 'findFirst') {
                        return wrapFindMethod(method.bind(tableTarget), schema);
                    }

                    return method.bind(tableTarget);
                },
            });
        },
    });
}

function wrapFindMethod(originalMethod: Function, schema: TableSchemaInfo) {
    return async function(options: any = {}) {
        // Check for skip options
        const lbacOptions: LbacOptions = {
            skipLbac: options.$skipLbac,
            skipTenant: options.$skipTenant,
            discovery: options.$discovery,
        };

        // Remove LBAC options from query options
        const { $skipLbac, $skipTenant, $discovery, ...queryOptions } = options;

        // Build LBAC filter
        const lbacFilter = await buildLbacFilter(schema, lbacOptions);

        if (lbacFilter) {
            // Combine with user's where condition
            const userWhere = queryOptions.where;
            queryOptions.where = userWhere
                ? and(lbacFilter, userWhere)
                : lbacFilter;
        }

        return originalMethod(queryOptions);
    };
}

// Helper to get table by name (from schema)
function getTableByName(tableName: string): PgTable | undefined {
    const schema = (rawDb as any)._.schema;
    if (!schema) return undefined;

    const tableSchema = schema[tableName];
    if (tableSchema?.table) {
        return tableSchema.table;
    }

    return undefined;
}

// ============================================================
// Insert Wrapper: Auto-set default tags + Audit
// ============================================================

function wrapInsert(originalInsert: typeof rawDb.insert) {
    return function insert(table: PgTable) {
        const insertBuilder = originalInsert(table);
        const originalValues = insertBuilder.values.bind(insertBuilder);
        const schema = detectTableSchema(table);
        const tableName = getTableName(table);

        insertBuilder.values = function(values: any) {
            const ctx = getCurrentContext();

            // Process single value or array
            const processValue = (val: any) => {
                const data = { ...val };

                // Auto-set organizationId
                if (schema.hasOrganizationId && !data.organizationId && !data.organization_id) {
                    data.organizationId = ctx.organizationId;
                }

                // Auto-set default aclTags
                if (schema.hasAclTags && (!data.aclTags || data.aclTags.length === 0)) {
                    data.aclTags = ctx.userId ? [`user:${ctx.userId}`] : [];
                }

                // Ensure denyTags exists
                if (schema.hasDenyTags && !data.denyTags) {
                    data.denyTags = [];
                }

                return data;
            };

            const processedValues = Array.isArray(values)
                ? values.map(processValue)
                : processValue(values);

            const query = originalValues(processedValues);

            // Wrap returning() to capture result and audit
            const originalReturning = query.returning?.bind(query);
            if (originalReturning) {
                query.returning = function(...args: any[]) {
                    const returningQuery = originalReturning(...args);
                    const returningExecute = returningQuery.execute?.bind(returningQuery);

                    if (returningExecute) {
                        returningQuery.execute = async function(...execArgs: any[]) {
                            const result = await returningExecute(...execArgs);

                            // Audit: record INSERT for each row
                            if (!shouldSkipAudit(tableName) && Array.isArray(result)) {
                                for (const row of result) {
                                    collectAuditEntry(tableName, 'INSERT', row.id, {
                                        new: row,
                                    });
                                }
                            }

                            return result;
                        };
                    }

                    return returningQuery;
                };
            }

            return query;
        };

        return insertBuilder;
    };
}

// ============================================================
// Update Wrapper: Auto-inject LBAC filter + Audit
// ============================================================

function wrapUpdate(originalUpdate: typeof rawDb.update) {
    return function update(table: PgTable) {
        const updateBuilder = originalUpdate(table);
        const schema = detectTableSchema(table);
        const tableName = getTableName(table);

        // If table doesn't have LBAC columns, return as-is (but still audit)
        if (!schema.hasAclTags || !schema.hasDenyTags) {
            // Still wrap for audit even without LBAC
            return wrapUpdateBuilderForAudit(updateBuilder, table, tableName, schema);
        }

        const originalSet = updateBuilder.set.bind(updateBuilder);

        updateBuilder.set = function(values: any) {
            const setBuilder = originalSet(values);
            const originalWhere = setBuilder.where.bind(setBuilder);

            // Override where() to inject LBAC and audit
            setBuilder.where = function(condition: SQL) {
                return wrapUpdateDeleteWhere(originalWhere, condition, schema, tableName, 'UPDATE', values);
            };

            return setBuilder;
        };

        return updateBuilder;
    };
}

/**
 * Wrap update builder for tables without LBAC but still need audit
 */
function wrapUpdateBuilderForAudit(
    updateBuilder: ReturnType<typeof rawDb.update>,
    table: PgTable,
    tableName: string,
    schema: TableSchemaInfo
) {
    const originalSet = updateBuilder.set.bind(updateBuilder);

    updateBuilder.set = function(values: any) {
        const setBuilder = originalSet(values);
        const originalWhere = setBuilder.where.bind(setBuilder);

        setBuilder.where = function(condition: SQL) {
            return wrapUpdateDeleteWhere(originalWhere, condition, schema, tableName, 'UPDATE', values, true);
        };

        return setBuilder;
    };

    return updateBuilder;
}

// ============================================================
// Delete Wrapper: Auto-inject LBAC filter + Audit
// ============================================================

function wrapDelete(originalDelete: typeof rawDb.delete) {
    return function deleteFrom(table: PgTable) {
        const deleteBuilder = originalDelete(table);
        const schema = detectTableSchema(table);
        const tableName = getTableName(table);

        // If table doesn't have LBAC columns, still wrap for audit
        if (!schema.hasAclTags || !schema.hasDenyTags) {
            const originalWhere = deleteBuilder.where.bind(deleteBuilder);
            deleteBuilder.where = function(condition: SQL) {
                return wrapUpdateDeleteWhere(originalWhere, condition, schema, tableName, 'DELETE', undefined, true);
            };
            return deleteBuilder;
        }

        const originalWhere = deleteBuilder.where.bind(deleteBuilder);

        // Override where() to inject LBAC and audit
        deleteBuilder.where = function(condition: SQL) {
            return wrapUpdateDeleteWhere(originalWhere, condition, schema, tableName, 'DELETE');
        };

        return deleteBuilder;
    };
}

/**
 * Wrap update/delete where clause with LBAC filter + Audit
 */
function wrapUpdateDeleteWhere(
    originalWhere: Function,
    userCondition: SQL,
    schema: TableSchemaInfo,
    tableName: string,
    operation: 'UPDATE' | 'DELETE',
    setValues?: any,
    skipLbac: boolean = false
) {
    const query = originalWhere(userCondition);

    // CRITICAL: Capture the ORIGINAL unwrapped execute/returning BEFORE wrapping
    // These are the raw Drizzle methods that we need to call directly
    const rawExecute = query.execute?.bind(query);
    const rawReturning = query.returning?.bind(query);

    // Flag to prevent duplicate audit when using .returning()
    let hasReturning = false;

    // Helper to build final condition with LBAC
    const buildFinalCondition = async () => {
        if (skipLbac) {
            return userCondition;
        }
        const lbacFilter = await buildLbacFilter(schema, {});
        return lbacFilter
            ? and(lbacFilter, userCondition)!
            : userCondition;
    };

    // Wrap execute()
    if (rawExecute) {
        query.execute = async function(...args: any[]) {
            // Build final condition with LBAC
            const finalCondition = await buildFinalCondition();

            // Apply the final condition to the query (Drizzle mutates in-place)
            // Then call the RAW execute, NOT query.execute (which would recurse)
            originalWhere(finalCondition);
            const result = await rawExecute(...args);

            // Schedule audit write ONLY if not using .returning()
            // (returning().execute() will handle audit with detailed data)
            if (!shouldSkipAudit(tableName) && !hasReturning) {
                collectAuditEntry(tableName, operation, 'batch', {
                    old: setValues ? { _note: 'before data not captured' } : undefined,
                    new: operation === 'UPDATE' ? setValues : undefined,
                });
            }

            return result;
        };
    }

    // Wrap returning() chain
    if (rawReturning) {
        query.returning = function(...args: any[]) {
            // Mark that .returning() was called
            hasReturning = true;

            const returningQuery = rawReturning(...args);
            // Capture raw execute from returning query BEFORE any wrapping
            const rawReturningExecute = returningQuery.execute?.bind(returningQuery);

            if (rawReturningExecute) {
                returningQuery.execute = async function(...execArgs: any[]) {
                    // Build final condition with LBAC
                    const finalCondition = await buildFinalCondition();

                    // Apply where condition (Drizzle mutates in-place)
                    // Then call raw returning and raw execute - NO wrapped methods!
                    originalWhere(finalCondition);
                    const result = await rawReturningExecute(...execArgs);

                    // Schedule audit writes with actual result data
                    if (!shouldSkipAudit(tableName) && Array.isArray(result)) {
                        for (const row of result) {
                            collectAuditEntry(tableName, operation, String(row?.id ?? 'unknown'), {
                                old: undefined, // Before data not captured in this simplified version
                                new: operation === 'UPDATE' ? row : undefined,
                            });
                        }
                    }

                    return result;
                };
            }

            return returningQuery;
        };
    }

    return query;
}

// ============================================================
// Main Export: LBAC-Enhanced DB (Drizzle-compatible)
// ============================================================

/**
 * LBAC-Enhanced Database
 *
 * Drop-in replacement for Drizzle db with automatic LBAC filtering.
 * Supports both SQL-like and Query API styles.
 *
 * Audit uses "In-Memory Buffer" pattern:
 * - collectAuditEntry() adds to buffer (zero IO)
 * - tRPC middleware flushes buffer after successful response
 */
export const db = new Proxy(rawDb, {
    get(target, prop, receiver) {
        // Wrap select() for SQL-like API
        if (prop === 'select') {
            return wrapSelectBuilder(target.select.bind(target));
        }

        // Wrap query for Query API
        if (prop === 'query') {
            return wrapQueryApi(target.query);
        }

        // Wrap insert() for auto-defaults + audit collection
        if (prop === 'insert') {
            return wrapInsert(target.insert.bind(target));
        }

        // Wrap update() for LBAC filtering + audit collection
        if (prop === 'update') {
            return wrapUpdate(target.update.bind(target));
        }

        // Wrap delete() for LBAC filtering + audit collection
        if (prop === 'delete') {
            return wrapDelete(target.delete.bind(target));
        }

        // Expose raw db for system operations
        if (prop === '$raw') {
            return target;
        }

        // Pass through everything else (transaction, etc.)
        return Reflect.get(target, prop, receiver);
    },
}) as Database & {
    /** Raw database access (bypasses LBAC) */
    $raw: Database;
};

/**
 * Type augmentation for LBAC methods on queries
 */
declare module 'drizzle-orm/pg-core' {
    interface PgSelect {
        /** Skip LBAC filtering (system queries only) */
        $skipLbac(): this;
        /** Skip tenant filter only */
        $skipTenant(): this;
        /** Add discovery SQL (for plugins) */
        $withDiscovery(discovery: SQL): this;
    }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Build user keys for LBAC filtering
 */
export function buildUserKeys(ctx: LbacContext): string[] {
    const keys: string[] = [];
    if (ctx.userId) keys.push(`${TagPrefix.USER}:${ctx.userId}`);
    if (ctx.organizationId) keys.push(`${TagPrefix.ORG}:${ctx.organizationId}`);
    ctx.teamIds?.forEach(teamId => keys.push(`${TagPrefix.TEAM}:${teamId}`));
    ctx.roles?.forEach(role => keys.push(`${TagPrefix.ROLE}:${role}`));
    keys.push(`${TagPrefix.PUBLIC}:all`);
    return keys;
}

/**
 * Helper: Add tenant filter to a WHERE condition
 */
export function withTenantFilter(
    scopedDb: ScopedDb,
    organizationIdColumn: Column,
    condition?: SQL
): SQL {
    const tenantCondition = scopedDb.organizationId
        ? eq(organizationIdColumn, scopedDb.organizationId)
        : sql`1=1`;

    return condition ? and(tenantCondition, condition)! : tenantCondition;
}

/**
 * Helper: Add organizationId to insert data
 */
export function withTenantId<T extends Record<string, unknown>>(
    scopedDb: ScopedDb,
    data: T
): T & { organizationId?: string } {
    if (scopedDb.organizationId) {
        return { ...data, organizationId: scopedDb.organizationId };
    }
    return data;
}

/**
 * Helper: Add organizationId to array of insert data
 */
export function withTenantIdArray<T extends Record<string, unknown>>(
    scopedDb: ScopedDb,
    data: T[]
): Array<T & { organizationId?: string }> {
    return data.map(d => withTenantId(scopedDb, d));
}

/**
 * Helper: Add LBAC filter to a WHERE condition
 */
export function withLbacFilter(
    aclTagsColumn: Column,
    denyTagsColumn: Column,
    userKeys: string[],
    condition?: SQL
): SQL {
    if (userKeys.length === 0) return sql`FALSE`;

    const keysArray = sql`ARRAY[${sql.join(userKeys.map(k => sql`${k}`), sql`, `)}]::text[]`;
    const lbacCondition = sql`(${aclTagsColumn} && ${keysArray}) AND NOT (${denyTagsColumn} && ${keysArray})`;

    return condition ? and(lbacCondition, condition)! : lbacCondition;
}

/**
 * Build default tags for a new entity
 */
export function buildDefaultTags(options: {
    organizationId: string;
    ownerId?: string;
    teamId?: string;
    spaceId?: string;
}): { aclTags: string[]; denyTags: string[] } {
    const aclTags: string[] = [];
    aclTags.push(`${TagPrefix.ORG}:${options.organizationId}`);
    if (options.ownerId) aclTags.push(`${TagPrefix.USER}:${options.ownerId}`);
    if (options.teamId) aclTags.push(`${TagPrefix.TEAM}:${options.teamId}`);
    if (options.spaceId) aclTags.push(`${TagPrefix.SPACE}:${options.spaceId}`);
    return { aclTags, denyTags: [] };
}

/**
 * Helper: Add permission fields to insert data
 */
export function withPermissionFields<T extends Record<string, unknown>>(
    scopedDb: ScopedDb,
    data: T & { teamId?: string; spaceId?: string }
): T & {
    organizationId: string;
    ownerId: string;
    creatorId: string;
    aclTags: string[];
    denyTags: string[];
} {
    const orgId = scopedDb.organizationId ?? '';
    const userId = scopedDb.userId ?? '';

    const tags = buildDefaultTags({
        organizationId: orgId,
        ownerId: userId,
        teamId: data.teamId,
        spaceId: data.spaceId,
    });

    return {
        ...data,
        organizationId: orgId,
        ownerId: userId,
        creatorId: userId,
        aclTags: tags.aclTags,
        denyTags: tags.denyTags,
    };
}

// Re-export raw db
export { rawDb };
export type { Database };
