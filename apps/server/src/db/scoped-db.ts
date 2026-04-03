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
import { eq, and, or, SQL, sql, Column, getTableColumns, inArray } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { TagPrefix } from '@wordrhyme/db';
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
// Permission imports - Automatic permission enforcement
import { PermissionKernel, PermissionDeniedError } from '../permission/permission-kernel';
import { conditionsToSQL } from '../permission/casl-to-sql';
import { buildCombinedAbacDrizzleV2 } from '../permission/casl-to-drizzle-v2';
import type { AbilityUserContext } from '../permission/casl-ability';

// ============================================================
// Permission Helper Functions
// ============================================================

const DEBUG_PERMISSION = process.env['DEBUG_PERMISSION'] === 'true';

/**
 * ✅ DX-3: Debug log utility with JSON Lines format
 * Only logs when DEBUG_PERMISSION=true
 *
 * Format: JSON Lines (newline-delimited JSON)
 * - Parseable by log aggregators (Datadog, CloudWatch, etc.)
 * - Includes requestId for request tracing
 */
function debugLog(message: string, data?: unknown): void {
    if (DEBUG_PERMISSION) {
        try {
            const ctx = getContext();
            // ✅ DX-3: JSON Lines format
            const logEntry = {
                timestamp: new Date().toISOString(),
                level: 'debug',
                service: 'ScopedDb',
                requestId: ctx.requestId,
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                message,
                // ✅ P2 Fix: Sanitize sensitive data before logging
                ...(data !== undefined && { data: sanitizeForLog(data) }),
            };
            console.log(JSON.stringify(logEntry));
        } catch {
            // Fallback: No context available (background jobs, etc.)
            const logEntry = {
                timestamp: new Date().toISOString(),
                level: 'debug',
                service: 'ScopedDb',
                message,
                ...(data !== undefined && { data: sanitizeForLog(data) }),
            };
            console.log(JSON.stringify(logEntry));
        }
    }
}

/**
 * ✅ P2 Fix: Sanitize sensitive data before logging
 * Removes or masks fields that might contain PII or sensitive information
 */
const SENSITIVE_FIELDS = new Set([
    // All values must be lowercase since we compare with key.toLowerCase()
    'password', 'passwordhash', 'secret', 'token', 'accesstoken', 'refreshtoken',
    'apikey', 'privatekey', 'ssn', 'socialsecuritynumber', 'creditcard',
    'cardnumber', 'cvv', 'pin', 'email', 'phone', 'address', 'salary',
    'bankaccount', 'iban', 'swift', 'taxid', 'nationalid', 'dob', 'dateofbirth'
]);

function sanitizeForLog(data: unknown): unknown {
    if (data === null || data === undefined) return data;

    if (Array.isArray(data)) {
        // For arrays, only log count and sample IDs
        if (data.length > 5) {
            return {
                _type: 'array',
                _count: data.length,
                _sampleIds: data.slice(0, 3).map((item: any) => item?.id ?? item?.['id'] ?? '[no-id]'),
            };
        }
        return data.map(item => sanitizeForLog(item));
    }

    if (typeof data === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
            if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = sanitizeForLog(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    return data;
}

/**
 * Get permission metadata from AsyncLocalStorage
 * Returns undefined if no permission metadata is set (backward compatibility)
 */
function getPermissionMeta(): { action: string; subject: string } | undefined {
    try {
        const ctx = getContext();
        return ctx.permissionMeta;
    } catch {
        // No context available - this is OK (e.g., background jobs, system operations)
        return undefined;
    }
}

/**
 * Permission kernel instance for DB-layer checks
 * Created without cache (backward compatibility mode)
 */
const permissionKernel = new PermissionKernel();

/**
 * Filter object fields based on permitted fields
 */
function filterObject<T extends Record<string, unknown>>(
    obj: T,
    allowedFields: string[] | undefined
): Partial<T> {
    if (!allowedFields) return obj;

    const filtered: Partial<T> = {};
    for (const key of Object.keys(obj)) {
        if (allowedFields.includes(key)) {
            const typedKey = key as keyof T;
            filtered[typedKey] = obj[typedKey];
        }
    }
    return filtered;
}

/**
 * Auto-filter fields on query result based on permission metadata
 *
 * ✅ P0 Fix: "Deny by default" - field filtering failure throws error instead of returning full data
 */
async function autoFilterFields<T extends Record<string, unknown>>(
    result: T | T[],
    action: string,
    subject: string
): Promise<T | T[] | Partial<T> | Partial<T>[]> {
    try {
        const ctx = getContext();
        const allowedFields = await permissionKernel.permittedFields(action, subject, ctx);

        if (!allowedFields) return result;

        if (Array.isArray(result)) {
            return result.map(obj => filterObject(obj, allowedFields));
        }
        return filterObject(result, allowedFields);
    } catch (error) {
        // ✅ P0 Fix: Deny by default - throw error instead of returning unfiltered data
        console.error('[PermissionDB] Field filtering failed - denying access:', error);
        throw new PermissionDeniedError(
            `Field-level permission check failed for ${action} on ${subject}. ` +
            'This may indicate a permission system error. Access denied for security.'
        );
    }
}

/**
 * ✅ Critical-1 Fix: Concurrency limit for parallel ABAC checks
 * Prevents overwhelming the permission system while avoiding N+1
 */
const ABAC_CONCURRENCY_LIMIT = 10;

/**
 * Perform ABAC checks on instances before UPDATE/DELETE
 * Returns instances that passed permission check
 *
 * ✅ P3 Fix: Enhanced logging with specific denial reasons
 * ✅ Critical-1 Fix: Parallel execution with concurrency limit (eliminates N+1)
 */
async function checkAbacForInstances<T extends Record<string, unknown>>(
    instances: T[],
    action: string,
    subject: string
): Promise<{ allowed: T[]; denied: T[]; denialReasons: Map<string, string> }> {
    const allowed: T[] = [];
    const denied: T[] = [];
    const denialReasons = new Map<string, string>();

    try {
        const ctx = getContext();

        // ✅ Critical-1 Fix: Parallel execution with chunking
        // Process in chunks to limit concurrency and avoid overwhelming the system
        const chunks = chunkArray(instances, ABAC_CONCURRENCY_LIMIT);

        for (const chunk of chunks) {
            // Run permission checks in parallel within each chunk
            const results = await Promise.all(
                chunk.map(async (instance) => {
                    const instanceId = String(instance['id'] ?? 'unknown');
                    const hasPermission = await permissionKernel.can(
                        action,
                        subject,
                        instance,
                        ctx,
                        true // skipAudit - we'll audit the final operation
                    );
                    return { instance, instanceId, hasPermission };
                })
            );

            // Separate allowed and denied
            for (const { instance, instanceId, hasPermission } of results) {
                if (hasPermission) {
                    allowed.push(instance);
                } else {
                    denied.push(instance);
                }
            }
        }

        // ✅ Critical-1 Fix: Only sample denial reasons (max 5) to avoid extra overhead
        if (denied.length > 0) {
            const samplesToLog = denied.slice(0, 5);
            await Promise.all(
                samplesToLog.map(async (instance) => {
                    const instanceId = String(instance['id'] ?? 'unknown');
                    const reason = await getAbacDenialReason(action, subject, instance, ctx);
                    denialReasons.set(instanceId, reason);
                })
            );

            debugLog(`[ABAC] Batch check summary:`, {
                action,
                subject,
                total: instances.length,
                allowed: allowed.length,
                denied: denied.length,
                denialSummary: Array.from(denialReasons.entries()),
            });
        }
    } catch (error) {
        debugLog('[ABAC] Check failed - denying all for safety:', error);
        // On error, deny all instances for safety
        return {
            allowed: [],
            denied: instances,
            denialReasons: new Map([['_all', 'ABAC check failed with error']]),
        };
    }

    return { allowed, denied, denialReasons };
}

/**
 * ✅ Critical-1 Fix: Helper function to chunk array
 */
function chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * ✅ P3 Fix: Get specific reason why ABAC denied an instance
 */
async function getAbacDenialReason(
    action: string,
    subject: string,
    instance: Record<string, unknown>,
    ctx: any
): Promise<string> {
    try {
        // Try to get CASL rules to determine denial reason
        const rules = permissionKernel.getCachedRulesForRequest(ctx.requestId);

        if (!rules) {
            return 'No permission rules found for this request';
        }

        // Find matching rules for this action/subject
        const matchingRules = rules.filter(
            (rule: any) => rule.action === action && rule.subject === subject
        );

        if (matchingRules.length === 0) {
            return `No rules defined for "${action}" on "${subject}"`;
        }

        // Check each rule's conditions
        for (const rule of matchingRules) {
            if (rule.inverted) {
                // This is a "cannot" rule
                if (rule.conditions) {
                    const conditionKeys = Object.keys(rule.conditions);
                    return `Denied by "cannot" rule with conditions: ${conditionKeys.join(', ')}`;
                }
                return `Denied by unconditional "cannot" rule`;
            }

            if (rule.conditions) {
                // Check which condition failed
                const failedConditions: string[] = [];
                for (const [field, expected] of Object.entries(rule.conditions)) {
                    const actual = instance[field];
                    if (actual !== expected) {
                        failedConditions.push(`${field}: expected "${expected}", got "${actual}"`);
                    }
                }
                if (failedConditions.length > 0) {
                    return `Condition mismatch: ${failedConditions.join('; ')}`;
                }
            }
        }

        return 'Permission check returned false (reason unknown)';
    } catch {
        return 'Unable to determine denial reason';
    }
}

// ============================================================
// 🆕 P1 Refactor: Unified ABAC Execution Strategy
// ============================================================

/**
 * Context for ABAC execution
 */
interface AbacExecutionContext {
    operation: 'UPDATE' | 'DELETE';
    table: PgTable;
    finalCondition: SQL;
    permissionMeta: { action: string; subject: string };
    setValues?: any; // For UPDATE operations
}

/**
 * Result of ABAC execution
 */
interface AbacExecutionResult {
    result: any;
    usedSqlOptimization: boolean;
}

/**
 * ✅ P1 Fix: Unified ABAC execution strategy
 *
 * Eliminates 200+ lines of duplicate code between execute() and returning().execute()
 *
 * Strategy:
 * 1. Try SQL Pushdown Optimization (single-query path)
 * 2. Fallback to Double-Query Path (ABAC in memory)
 *
 * ✅ Major-4 Fix: Enhanced rule matching
 * - Merges multiple "can" rules with OR
 * - Handles "cannot" rules with AND NOT
 * - Handles unconditional "can" rules (allow all)
 *
 * @param context - Execution context
 * @param shouldReturn - Whether to use .returning() clause
 * @returns Execution result
 */
async function executeWithAbac(
    context: AbacExecutionContext,
    shouldReturn = false
): Promise<AbacExecutionResult> {
    const { operation, table, finalCondition, permissionMeta, setValues } = context;

    debugLog(`[${operation}] ABAC check with permissionMeta:`, permissionMeta);

    // 🚀 Phase 1: Try SQL Pushdown Optimization
    const ctx = getContext();
    const userContext: AbilityUserContext = {
        id: ctx.userId ?? '',
        organizationId: ctx.organizationId,
        currentTeamId: (ctx as any).currentTeamId,
    };

    // Get CASL rules for this user
    const caslRules = permissionKernel.getCachedRulesForRequest(ctx.requestId);

    let usedSqlOptimization = false;
    let result: any;

    // ✅ Major-4 Fix: Try to build combined SQL from multiple rules
    const sqlCondition = buildCombinedAbacSQL(
        caslRules,
        permissionMeta.action,
        permissionMeta.subject,
        table,
        userContext
    );

    if (sqlCondition.success && sqlCondition.sql) {
        debugLog(`[${operation}] ✅ SQL optimization enabled (${sqlCondition.ruleCount} rules merged)`);
        usedSqlOptimization = true;

        // Single-query path: Combine LBAC + User Condition + ABAC SQL
        const optimizedCondition = and(finalCondition, sqlCondition.sql);

        // Execute based on operation type
        result = await executeSingleQueryPath(
            operation,
            table,
            optimizedCondition!,
            setValues,
            permissionMeta,
            shouldReturn
        );
    } else if (sqlCondition.allowAll) {
        // ✅ Major-4 Fix: Unconditional "can" rule - no ABAC filter needed
        debugLog(`[${operation}] ✅ Unconditional permission - no ABAC filter needed`);
        usedSqlOptimization = true;

        result = await executeSingleQueryPath(
            operation,
            table,
            finalCondition,
            setValues,
            permissionMeta,
            shouldReturn
        );
    } else {
        debugLog(`[${operation}] ❌ SQL optimization failed: ${sqlCondition.error}`);
    }

    // Fallback to double-query path if SQL optimization not used
    if (!usedSqlOptimization) {
        debugLog(`[${operation}] Using double-query path (ABAC in memory)`);
        result = await executeDoubleQueryPath(
            operation,
            table,
            finalCondition,
            permissionMeta,
            setValues,
            shouldReturn
        );
    }

    return { result, usedSqlOptimization };
}

/**
 * ✅ Major-4 Fix: Build combined SQL from multiple CASL rules
 *
 * Handles:
 * - Multiple "can" rules → OR combination
 * - "cannot" rules → AND NOT combination
 * - Unconditional "can" rules → allowAll flag
 */
interface CombinedSQLResult {
    success: boolean;
    sql?: SQL;
    allowAll?: boolean;
    ruleCount?: number;
    error?: string;
}

function buildCombinedAbacSQL(
    rules: any[] | undefined,
    action: string,
    subject: string,
    table: PgTable,
    userContext: AbilityUserContext
): CombinedSQLResult {
    if (!rules || rules.length === 0) {
        return { success: false, error: 'No rules available' };
    }

    // Filter rules matching this action/subject
    const matchingRules = rules.filter(
        (rule: any) => rule.action === action && rule.subject === subject
    );

    if (matchingRules.length === 0) {
        return { success: false, error: `No rules for ${action} on ${subject}` };
    }

    // Separate "can" and "cannot" rules
    const canRules = matchingRules.filter((r: any) => !r.inverted);
    const cannotRules = matchingRules.filter((r: any) => r.inverted);

    // Check for unconditional "can" rule (no conditions = allow all)
    const unconditionalCan = canRules.find((r: any) => !r.conditions);
    if (unconditionalCan && cannotRules.length === 0) {
        // Unconditional permission with no "cannot" rules
        return { success: true, allowAll: true, ruleCount: 1 };
    }

    // Build "can" conditions (OR together)
    const canConditions: SQL[] = [];
    for (const rule of canRules) {
        if (!rule.conditions) {
            // Unconditional "can" - but we have "cannot" rules, so continue
            // This will be handled as "allow all EXCEPT cannot conditions"
            continue;
        }

        const result = conditionsToSQL(rule.conditions, table, userContext);
        if (result.success && result.sql) {
            canConditions.push(result.sql);
        } else {
            debugLog('[ABAC] Cannot convert rule to SQL, skipping:', {
                conditions: rule.conditions,
                error: result.error,
            });
            // If any rule fails to convert, we can't use SQL optimization
            // because we might miss valid permissions
            return { success: false, error: `Cannot convert condition: ${result.error}` };
        }
    }

    // Build "cannot" conditions (AND NOT each)
    const cannotConditions: SQL[] = [];
    for (const rule of cannotRules) {
        if (!rule.conditions) {
            // Unconditional "cannot" = deny all
            return { success: false, error: 'Unconditional cannot rule blocks all access' };
        }

        const result = conditionsToSQL(rule.conditions, table, userContext);
        if (result.success && result.sql) {
            cannotConditions.push(result.sql);
        } else {
            // For "cannot" rules, if we can't convert, we should be conservative
            // and fall back to double-query path
            return { success: false, error: `Cannot convert cannot-condition: ${result.error}` };
        }
    }

    // Combine conditions
    let finalSQL: SQL | undefined;

    // If we have "can" conditions, OR them together
    if (canConditions.length > 0) {
        finalSQL = canConditions.length === 1
            ? canConditions[0]
            : canConditions.reduce((acc, cond) => or(acc, cond)!);
    } else if (unconditionalCan) {
        // Unconditional "can" with "cannot" rules
        // Allow all EXCEPT the "cannot" conditions
        finalSQL = sql`TRUE`;
    } else {
        return { success: false, error: 'No valid can conditions' };
    }

    // Apply "cannot" conditions as AND NOT
    for (const cannotCond of cannotConditions) {
        finalSQL = and(finalSQL!, sql`NOT (${cannotCond})`)!;
    }

    return {
        success: true,
        ruleCount: canConditions.length + cannotConditions.length + (unconditionalCan ? 1 : 0),
        ...(finalSQL ? { sql: finalSQL } : {}),
    };
}

/**
 * Execute UPDATE/DELETE with SQL optimization (single-query path)
 */
async function executeSingleQueryPath(
    operation: 'UPDATE' | 'DELETE',
    table: PgTable,
    condition: SQL,
    setValues: any | undefined,
    permissionMeta: { action: string; subject: string },
    shouldReturn: boolean
): Promise<any> {
    if (operation === 'UPDATE' && setValues) {
        const filteredValues = await filterUpdateValues(
            setValues,
            permissionMeta.action,
            permissionMeta.subject
        );

        // ✅ P1-4 Fix: Check if filteredValues is empty after field filtering
        if (Object.keys(filteredValues).length === 0) {
            debugLog(`[${operation}] All fields were filtered out, skipping UPDATE`);
            return [] as any; // Return empty result (no rows affected)
        }

        const query = rawDb.update(table).set(filteredValues).where(condition);
        return shouldReturn ? query.returning().execute() : query.execute();
    } else {
        // DELETE operation
        const query = rawDb.delete(table).where(condition);
        return shouldReturn ? query.returning().execute() : query.execute();
    }
}

/**
 * ✅ Critical-2 Fix: Safety limits for double-query path
 * Prevents OOM by limiting batch size and total instances
 */
const DOUBLE_QUERY_BATCH_SIZE = 1000;
const DOUBLE_QUERY_MAX_INSTANCES = 10000;

/**
 * Execute UPDATE/DELETE with double-query path (ABAC in memory)
 *
 * ✅ Critical-2 Fix: Added batch processing and safety limits to prevent OOM
 */
async function executeDoubleQueryPath(
    operation: 'UPDATE' | 'DELETE',
    table: PgTable,
    finalCondition: SQL,
    permissionMeta: { action: string; subject: string },
    setValues: any | undefined,
    shouldReturn: boolean
): Promise<any> {
    // Step 1: Query instances to be affected with safety limit
    // ✅ Critical-2 Fix: Add LIMIT to prevent loading too many rows into memory
    const instancesToModify = await rawDb
        .select()
        .from(table)
        .where(finalCondition)
        .limit(DOUBLE_QUERY_MAX_INSTANCES + 1) // +1 to detect if we exceeded limit
        .execute();

    if (instancesToModify.length === 0) {
        debugLog(`[${operation}] No instances to modify after LBAC filter`);
        return [];
    }

    // ✅ Critical-2 Fix: Safety check - refuse to process if too many instances
    if (instancesToModify.length > DOUBLE_QUERY_MAX_INSTANCES) {
        console.warn(
            `[ScopedDb] ${operation} operation would affect more than ${DOUBLE_QUERY_MAX_INSTANCES} rows. ` +
            `This is likely a dangerous bulk operation. Use $raw for intentional bulk operations.`
        );
        throw new PermissionDeniedError(
            `Bulk ${operation} operation denied: Would affect more than ${DOUBLE_QUERY_MAX_INSTANCES} rows. ` +
            `For intentional bulk operations, use db.$raw with explicit safety measures.`
        );
    }

    // Step 2: Perform ABAC check on each instance (now parallelized via Critical-1 fix)
    // ✅ P3 Fix: Now includes denialReasons for enhanced debugging
    const { allowed, denied, denialReasons } = await checkAbacForInstances(
        instancesToModify as Record<string, unknown>[],
        permissionMeta.action,
        permissionMeta.subject
    );

    if (allowed.length === 0) {
        debugLog(`[${operation}] [ABAC] All instances denied - no rows match attribute conditions`, {
            totalInstances: instancesToModify.length,
            deniedCount: denied.length,
            sampleReasons: Array.from(denialReasons.entries()).slice(0, 3),
        });
        return [];
    }

    // Step 3: Build WHERE condition for allowed instances only
    const pkColumn = getPrimaryKeyColumn(table);

    // ✅ P0 Fix: Type-safe ID extraction and validation
    const pkColumnName = getPrimaryKeyColumnName(table);
    const allowedIds = allowed.map((row: any) => {
        const id = row[pkColumnName];
        if (typeof id !== 'string' && typeof id !== 'number') {
            throw new Error(`Invalid primary key type for column '${pkColumnName}': ${typeof id}`);
        }
        return id;
    });

    // ✅ Critical-2 Fix: Process in batches to avoid super-long IN clauses
    const allResults: any[] = [];
    let totalRowsAffected = 0;
    const idBatches = chunkArray(allowedIds as (string | number)[], DOUBLE_QUERY_BATCH_SIZE);

    for (const idBatch of idBatches) {
        // ✅ P0 Fix: Use inArray() instead of manual SQL template (防止 SQL 注入)
        const idCondition = inArray(pkColumn, idBatch);

        // ✅ P0 Fix: Combine ID filter + original LBAC condition to prevent TOCTOU
        const safeCondition = and(idCondition, finalCondition);

        // Step 4: Execute operation for this batch
        let batchResult: any;
        if (operation === 'UPDATE' && setValues) {
            const filteredValues = await filterUpdateValues(
                setValues,
                permissionMeta.action,
                permissionMeta.subject
            );

            // ✅ P1-4 Fix: Check if filteredValues is empty after field filtering
            if (Object.keys(filteredValues).length === 0) {
                debugLog(`[${operation}] All fields were filtered out, skipping UPDATE`);
                continue; // Skip this batch
            }

            const query = rawDb.update(table).set(filteredValues).where(safeCondition);
            batchResult = shouldReturn ? await query.returning().execute() : await query.execute();
        } else {
            // DELETE operation
            const query = rawDb.delete(table).where(safeCondition);
            batchResult = shouldReturn ? await query.returning().execute() : await query.execute();
        }

        if (shouldReturn && Array.isArray(batchResult)) {
            allResults.push(...batchResult);
        } else if (!shouldReturn && batchResult?.rowCount != null) {
            // ✅ Major-6 Fix: Preserve rowCount semantics for non-returning path
            totalRowsAffected += batchResult.rowCount;
        }
    }

    // ✅ Major-6 Fix: Return appropriate type based on shouldReturn flag
    if (shouldReturn) {
        return allResults;
    }
    // For non-returning path, return the original execute() result shape
    // so upstream code can check rowCount for idempotency/retry decisions
    return { rowCount: totalRowsAffected };
}

/**
 * Helper: Get primary key column for WHERE IN clause
 *
 * ✅ Major-7 Fix: Detect primary key from Drizzle metadata instead of hardcoding 'id'.
 * Falls back to 'id' column if metadata detection fails.
 * Throws error if no usable primary key column is found.
 */
function getPrimaryKeyColumn(t: PgTable): Column {
    const columns = getTableColumns(t) as Record<string, Column>;

    // Strategy 1: Check Drizzle primary key metadata
    for (const col of Object.values(columns)) {
        if ((col as any).primary === true || (col as any).primaryKey === true) {
            return col;
        }
    }

    // Strategy 2: Fallback to 'id' column (most common convention)
    if (columns['id']) {
        return columns['id'];
    }

    // No primary key found - double-query path cannot proceed safely
    throw new PermissionDeniedError(
        `Table has no detectable primary key column. ` +
        `Double-query ABAC path requires a primary key for safe batch operations. ` +
        `Either add an 'id' column or use db.$raw for this table.`
    );
}

/**
 * Helper: Get primary key column NAME for row value extraction
 */
function getPrimaryKeyColumnName(t: PgTable): string {
    const columns = getTableColumns(t) as Record<string, Column>;

    for (const [name, col] of Object.entries(columns)) {
        if ((col as any).primary === true || (col as any).primaryKey === true) {
            return name;
        }
    }

    if (columns['id']) {
        return 'id';
    }

    throw new PermissionDeniedError(
        `Table has no detectable primary key column for row extraction.`
    );
}

/**
 * Filter UPDATE values based on permitted fields
 *
 * ✅ P0 Fix: "Deny by default" - field filtering failure throws error instead of allowing all updates
 */
async function filterUpdateValues(
    values: Record<string, unknown>,
    action: string,
    subject: string
): Promise<Record<string, unknown>> {
    try {
        const ctx = getContext();
        const allowedFields = await permissionKernel.permittedFields(action, subject, ctx);
        return filterObject(values, allowedFields);
    } catch (error) {
        // ✅ P0 Fix: Deny by default - throw error instead of returning unfiltered values
        console.error('[PermissionDB] UPDATE field filtering failed - denying operation:', error);
        throw new PermissionDeniedError(
            `Field-level permission check failed for ${action} on ${subject}. ` +
            'Cannot determine which fields are allowed to update. Access denied for security.'
        );
    }
}


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
    /** Skip all LBAC filtering (for system queries) */
    nopolicy?: boolean;
    /** Skip tenant (organization) filter only */
    unscope?: boolean;
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
// Schema Detection (with WeakMap Cache)
// ============================================================

/**
 * ✅ P2 Fix: WeakMap cache for table schema detection
 * Avoids repeated column traversal on every query
 */
const schemaCache = new WeakMap<PgTable, TableSchemaInfo>();

/**
 * Detect table schema for auto-filtering (with caching)
 */
function detectTableSchema(table: PgTable): TableSchemaInfo {
    // Check cache first
    const cached = schemaCache.get(table);
    if (cached) return cached;

    const columns = getTableColumns(table) as Record<string, Column>;

    const orgCol = columns['organizationId'] ?? columns['organization_id'];
    const aclCol = columns['aclTags'] ?? columns['acl_tags'];
    const denyCol = columns['denyTags'] ?? columns['deny_tags'];

    const schema: TableSchemaInfo = {
        hasOrganizationId: orgCol !== undefined,
        hasAclTags: aclCol !== undefined,
        hasDenyTags: denyCol !== undefined,
        organizationIdColumn: orgCol,
        aclTagsColumn: aclCol,
        denyTagsColumn: denyCol,
    };

    // Store in cache
    schemaCache.set(table, schema);
    return schema;
}

// ============================================================
// LBAC Filter Builder (with Request-Level Cache)
// ============================================================

/**
 * ✅ Major-3 Fix: True request-level cache for userKeys
 *
 * Uses requestId as cache key to ensure:
 * 1. Cache is isolated per request (no cross-request pollution)
 * 2. Cache auto-expires when request ends (via WeakMap-like TTL behavior)
 * 3. Includes teamIds/roles in cache key hash for accuracy
 *
 * Structure: Map<requestId, { userKeys: string[], keysArraySQL: SQL, expiresAt: number }>
 */
interface UserKeysCacheEntry {
    userKeys: string[];
    keysArraySQL: SQL;
    cacheKeyHash: string;
    expiresAt: number;
}

const userKeysCache = new Map<string, UserKeysCacheEntry>();

/** Cache TTL: 5 minutes (requests should be much shorter, this is safety net) */
const USER_KEYS_CACHE_TTL_MS = 5 * 60 * 1000;

/** Max cache size to prevent memory leak in edge cases */
const USER_KEYS_CACHE_MAX_SIZE = 500;

/**
 * ✅ Major-3 Fix: Generate cache key hash including all permission-relevant fields
 */
function generateUserKeysCacheHash(ctx: ScopedContext): string {
    const teamIdsHash = ctx.teamIds.sort().join(',');
    const rolesHash = ctx.roles.sort().join(',');
    return `${ctx.userId}:${ctx.organizationId}:${teamIdsHash}:${rolesHash}`;
}

/**
 * ✅ Major-3 Fix: Cleanup expired entries periodically
 */
function cleanupExpiredUserKeysCache(): void {
    const now = Date.now();
    for (const [requestId, entry] of userKeysCache.entries()) {
        if (entry.expiresAt < now) {
            userKeysCache.delete(requestId);
        }
    }
}

/**
 * Get cached userKeys or build new ones
 *
 * ✅ Major-3 Fix: True request-level caching with proper key isolation
 */
async function getCachedUserKeys(ctx: ScopedContext): Promise<string[]> {
    // Get requestId from full context for request-level isolation
    let requestId: string;
    try {
        const fullCtx = getContext();
        requestId = fullCtx.requestId;
    } catch {
        // No context = no caching, build fresh
        return keyBuilder.build({
            userId: ctx.userId ?? '',
            organizationId: ctx.organizationId ?? '',
        });
    }

    const cacheKeyHash = generateUserKeysCacheHash(ctx);
    const cached = userKeysCache.get(requestId);

    // Check if cache is valid (same hash, not expired)
    if (cached && cached.cacheKeyHash === cacheKeyHash && cached.expiresAt > Date.now()) {
        return cached.userKeys;
    }

    // Build new userKeys
    const userKeys = await keyBuilder.build({
        userId: ctx.userId ?? '',
        organizationId: ctx.organizationId ?? '',
    });

    // Pre-build SQL array for reuse
    const keysArraySQL = userKeys.length > 0
        ? sql`ARRAY[${sql.join(userKeys.map((k) => sql`${k}`), sql`, `)}]::text[]`
        : sql`ARRAY[]::text[]`;

    // Cleanup if cache is too large
    if (userKeysCache.size >= USER_KEYS_CACHE_MAX_SIZE) {
        cleanupExpiredUserKeysCache();
        // If still too large, delete oldest entries
        if (userKeysCache.size >= USER_KEYS_CACHE_MAX_SIZE) {
            const keysToDelete = Array.from(userKeysCache.keys()).slice(0, 100);
            keysToDelete.forEach(k => userKeysCache.delete(k));
        }
    }

    // Store in cache
    userKeysCache.set(requestId, {
        userKeys,
        keysArraySQL,
        cacheKeyHash,
        expiresAt: Date.now() + USER_KEYS_CACHE_TTL_MS,
    });

    return userKeys;
}

/**
 * ✅ Major-3 Fix: Get cached keysArraySQL to avoid rebuilding SQL on every query
 */
async function getCachedKeysArraySQL(ctx: ScopedContext): Promise<SQL> {
    let requestId: string;
    try {
        const fullCtx = getContext();
        requestId = fullCtx.requestId;
    } catch {
        // No context, build fresh
        const userKeys = await keyBuilder.build({
            userId: ctx.userId ?? '',
            organizationId: ctx.organizationId ?? '',
        });
        return userKeys.length > 0
            ? sql`ARRAY[${sql.join(userKeys.map((k) => sql`${k}`), sql`, `)}]::text[]`
            : sql`ARRAY[]::text[]`;
    }

    const cacheKeyHash = generateUserKeysCacheHash(ctx);
    const cached = userKeysCache.get(requestId);

    if (cached && cached.cacheKeyHash === cacheKeyHash && cached.expiresAt > Date.now()) {
        return cached.keysArraySQL;
    }

    // Cache miss - getCachedUserKeys will populate the cache
    await getCachedUserKeys(ctx);
    const entry = userKeysCache.get(requestId);
    return entry?.keysArraySQL ?? sql`ARRAY[]::text[]`;
}

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
    const ctx = getCurrentContext();
    const organizationId = ctx.organizationId;

    const filters: SQL[] = [];

    // 1️⃣ Tenant Filter - ALWAYS apply (unless explicitly unscope)
    // This ensures multi-tenant isolation even when LBAC is disabled
    if (schema.hasOrganizationId && schema.organizationIdColumn && organizationId && !options.unscope) {
        filters.push(eq(schema.organizationIdColumn, organizationId));
    }

    // Early return if nopolicy - only return tenant filter if present
    if (options.nopolicy) {
        if (filters.length === 0) return undefined;
        if (filters.length === 1) return filters[0];
        return filters.reduce((acc, f) => and(acc, f)!);
    }

    // ✅ Major-3 Fix: Use cached userKeys and pre-built keysArraySQL
    const userKeys = await getCachedUserKeys(ctx);
    const keysArray = await getCachedKeysArraySQL(ctx);

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
 * ✅ P0 Fix: Check if current context is a system/admin context
 * Returns true if context has system privileges (can bypass LBAC/tenant filters)
 */
function isSystemContext(): boolean {
    try {
        const ctx = getContext();
        return ctx.isSystemContext === true;
    } catch {
        // No context = not system context
        return false;
    }
}

/**
 * Get current context from AsyncLocalStorage
 *
 * ✅ P0 Fix: Default strict context mode
 * - Default (strict): throws error if context is lost — prevents silent permission bypass
 * - In permissive mode: returns empty context (legacy behavior for background jobs)
 * - Set PERMISSIVE_CONTEXT=true to opt into legacy permissive mode
 */
function getCurrentContext(): ScopedContext {
    const PERMISSIVE_CONTEXT = process.env['PERMISSIVE_CONTEXT'] === 'true';

    try {
        const ctx = getContext();
        return {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            teamIds: ctx.teamIds ?? [],
            roles: ctx.userRoles ?? [],
        };
    } catch (error) {
        if (!PERMISSIVE_CONTEXT) {
            // ✅ Default strict: Throw error to prevent silent permission bypass
            throw new PermissionDeniedError(
                'Request context required but not available. ' +
                'This may be caused by: Promise.all(), setTimeout, or third-party library callbacks. ' +
                'Context must be propagated explicitly in async operations. ' +
                'Set PERMISSIVE_CONTEXT=true to opt into legacy permissive mode (NOT recommended for production).'
            );
        }

        // Legacy permissive mode (opt-in only): return empty context
        console.warn('[ScopedDb] Context lost in getCurrentContext() - permissions may be bypassed');
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
    const businessAuditLevel = getBusinessAuditLevel();
    const businessAuditMetadata = getBusinessAuditMetadata();

    // Add to pending logs buffer (zero IO)
    addPendingLog({
        entityType: tableName,
        entityId: entityId ?? 'unknown',
        action,
        changes,
        layer,
        ...(businessAuditLevel ? { level: businessAuditLevel } : {}),
        ...(businessAuditMetadata ? { metadata: businessAuditMetadata } : {}),
    });
}

// ============================================================
// SQL-like API Wrapper: db.select().from(table)
// ============================================================

// ============================================================
// Plugin Table Prefix Validation
// ============================================================

/**
 * Validate that a PgTable's name starts with the required prefix.
 * Used by createScopedDb({ tablePrefix }) to enforce plugin table isolation.
 *
 * @throws Error if table name does not start with the required prefix
 */
function validateTablePrefix(table: PgTable, prefix?: string): void {
    if (!prefix) return;
    const name = getTableName(table);
    if (!name.startsWith(prefix)) {
        throw new PermissionDeniedError(
            `Plugin table isolation violation: table "${name}" does not start with required prefix "${prefix}". ` +
            `Plugins can only access their own prefixed tables.`
        );
    }
}

function wrapSelectBuilder(originalSelect: typeof rawDb.select, tablePrefix?: string) {
    return function select(fields?: any) {
        const selectBuilder = originalSelect(fields);
        const mutableSelectBuilder = selectBuilder as any;
        const originalFrom = mutableSelectBuilder.from.bind(selectBuilder) as (...args: any[]) => any;

        // Override from() to inject LBAC
        mutableSelectBuilder.from = function wrappedFrom(table: PgTable, ...rest: any[]) {
            validateTablePrefix(table, tablePrefix);
            const query = originalFrom(table, ...rest);
            const schema = detectTableSchema(table);

            // ✅ P0 Fix: Apply tenant filter for ALL tables (even without LBAC fields)
            // Previous code only filtered tables with aclTags/denyTags, leaving pure organizationId tables unprotected
            return wrapQueryWithLbac(query, schema);
        };

        return selectBuilder;
    };
}

function wrapQueryWithLbac(query: any, schema: TableSchemaInfo) {
    const originalWhere = query.where?.bind(query);
    let userCondition: SQL | undefined;
    const lbacOptions: LbacOptions = {};

    // Override where() to capture user condition
    if (originalWhere) {
        query.where = function wrappedWhere(condition: SQL) {
            userCondition = condition;
            return query;
        };
    }

    // ✅ P0 Fix: Add LBAC option methods with system context check
    // These methods can only be used in system context to prevent business code from bypassing security
    query.$nopolicy = () => {
        if (!isSystemContext()) {
            throw new PermissionDeniedError(
                'Cannot use $nopolicy() outside of system context. ' +
                'This method bypasses all security filters and is restricted to trusted system operations only.'
            );
        }
        lbacOptions.nopolicy = true;
        return query;
    };

    query.$unscope = () => {
        if (!isSystemContext()) {
            throw new PermissionDeniedError(
                'Cannot use $unscope() outside of system context. ' +
                'This method bypasses tenant isolation and is restricted to trusted system operations only.'
            );
        }
        lbacOptions.unscope = true;
        return query;
    };

    query.$withDiscovery = (discovery: SQL) => {
        lbacOptions.discovery = discovery;
        return query;
    };

    // Wrap execute methods
    const wrapExecute = (originalMethod: Function, methodName: string) => {
        return async (...args: any[]) => {
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
                const result = await originalMethod(...args);

                // Auto-filter fields based on permission metadata (if present)
                const permissionMeta = getPermissionMeta();
                if (permissionMeta) {
                    debugLog('SQL API field filtering', { action: permissionMeta.action, subject: permissionMeta.subject });
                    return autoFilterFields(result, permissionMeta.action, permissionMeta.subject);
                }

                return result;
            }

            const result = await originalMethod(...args);

            // Auto-filter fields even without LBAC filter
            const permissionMeta = getPermissionMeta();
            if (permissionMeta) {
                debugLog('SQL API field filtering (no LBAC)', { action: permissionMeta.action, subject: permissionMeta.subject });
                return autoFilterFields(result, permissionMeta.action, permissionMeta.subject);
            }

            return result;
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

function wrapQueryApi(originalQuery: typeof rawDb.query, isV2 = true, tablePrefix?: string) {
    return new Proxy(originalQuery, {
        get(target, tableName: string) {
            const tableQuery = (target as any)[tableName];
            if (!tableQuery) return tableQuery;

            // Get the table schema for this table name
            const table = getTableByName(tableName);
            if (!table) return tableQuery;

            // Plugin table prefix isolation
            validateTablePrefix(table, tablePrefix);

            const schema = detectTableSchema(table);

            // ✅ P0 Fix: Apply tenant filter for ALL tables (even without LBAC fields)
            // Previous code only filtered tables with aclTags/denyTags, leaving pure organizationId tables unprotected

            // Wrap findMany and findFirst
            return new Proxy(tableQuery, {
                get(tableTarget, methodName: string) {
                    const method = tableTarget[methodName];
                    if (typeof method !== 'function') return method;

                    if (methodName === 'findMany' || methodName === 'findFirst') {
                        return wrapFindMethod(method.bind(tableTarget), schema, table, isV2);
                    }

                    return method.bind(tableTarget);
                },
            });
        },
    });
}

function wrapFindMethod(originalMethod: Function, schema: TableSchemaInfo, table: PgTable, isV2: boolean) {
    return async (options: any = {}) => {
        // ✅ P0 Fix: Check for skip options with system context validation
        // Prevent business code from bypassing security filters
        if (options.$nopolicy && !isSystemContext()) {
            throw new PermissionDeniedError(
                'Cannot use $nopolicy option outside of system context. ' +
                'This option bypasses all security filters and is restricted to trusted system operations only.'
            );
        }
        if (options.$unscope && !isSystemContext()) {
            throw new PermissionDeniedError(
                'Cannot use $unscope option outside of system context. ' +
                'This option bypasses tenant isolation and is restricted to trusted system operations only.'
            );
        }

        const lbacOptions: LbacOptions = {
            nopolicy: options.$nopolicy,
            unscope: options.$unscope,
            discovery: options.$discovery,
        };

        // Remove LBAC options from query options
        const { $nopolicy, $unscope, $discovery, ...queryOptions } = options;

        // Build LBAC filter
        const lbacFilter = await buildLbacFilter(schema, lbacOptions);

        if (lbacFilter) {
            // Combine LBAC filter with user's where condition
            // Supports: SQL (v1/v2), callback (v1), object (v2)
            const userWhere = queryOptions.where;

            if (!userWhere) {
                // No user where — just use LBAC filter (SQL works in both v1 and v2)
                queryOptions.where = lbacFilter;
            } else if (userWhere instanceof SQL) {
                // SQL-based where (v1 eq()/and() or v2 direct SQL) — combine with and()
                queryOptions.where = and(lbacFilter, userWhere);
            } else if (typeof userWhere === 'function') {
                // v1 callback where: (table, operators) => SQL
                const originalCallback = userWhere;
                queryOptions.where = (table: any, operators: any) => {
                    const userCondition = originalCallback(table, operators);
                    return userCondition ? and(lbacFilter, userCondition) : lbacFilter;
                };
            } else if (typeof userWhere === 'object') {
                // v2 object-based where: { field: value, ... }
                // Use AND + RAW to inject SQL LBAC filter into object syntax
                queryOptions.where = {
                    AND: [
                        userWhere,
                        { RAW: () => lbacFilter },
                    ],
                };
            } else {
                // Fallback — just use LBAC filter
                queryOptions.where = lbacFilter;
            }
        }

        // ✅ ABAC: Inject CASL conditions into Query API where clause
        const permissionMeta = getPermissionMeta();
        if (permissionMeta) {
            const ctx = getContext();
            const userContext: AbilityUserContext = {
                id: ctx.userId ?? '',
                organizationId: ctx.organizationId,
                currentTeamId: (ctx as any).currentTeamId,
            };
            const caslRules = permissionKernel.getCachedRulesForRequest(ctx.requestId);

            if (caslRules) {
                if (isV2) {
                    // v2 Query API: use object-based ABAC conditions
                    const abacResult = buildCombinedAbacDrizzleV2(
                        caslRules,
                        permissionMeta.action,
                        permissionMeta.subject,
                        userContext
                    );

                    if (abacResult.success && abacResult.where) {
                        const currentWhere = queryOptions.where;
                        if (!currentWhere) {
                            queryOptions.where = abacResult.where;
                        } else if (currentWhere instanceof SQL) {
                            // Current is SQL (from LBAC), combine with ABAC v2 object
                            queryOptions.where = {
                                AND: [
                                    { RAW: () => currentWhere },
                                    abacResult.where,
                                ],
                            };
                        } else if (typeof currentWhere === 'object') {
                            // Current is already v2 object, merge with AND
                            queryOptions.where = {
                                AND: [currentWhere, abacResult.where],
                            };
                        }
                        debugLog('Query API ABAC v2 injected', {
                            action: permissionMeta.action,
                            subject: permissionMeta.subject,
                            ruleCount: abacResult.ruleCount,
                        });
                    }
                    // allowAll → no ABAC filter needed
                } else {
                    // v1 Query API: use SQL-based ABAC conditions
                    const abacResult = buildCombinedAbacSQL(
                        caslRules,
                        permissionMeta.action,
                        permissionMeta.subject,
                        table,
                        userContext
                    );

                    if (abacResult.success && abacResult.sql) {
                        const currentWhere = queryOptions.where;
                        if (!currentWhere) {
                            queryOptions.where = abacResult.sql;
                        } else if (currentWhere instanceof SQL) {
                            queryOptions.where = and(currentWhere, abacResult.sql);
                        } else if (typeof currentWhere === 'function') {
                            const originalCallback = currentWhere;
                            const abacSQL = abacResult.sql;
                            queryOptions.where = (t: any, ops: any) => {
                                const prev = originalCallback(t, ops);
                                return prev ? and(prev, abacSQL) : abacSQL;
                            };
                        }
                        debugLog('Query API ABAC v1 SQL injected', {
                            action: permissionMeta.action,
                            subject: permissionMeta.subject,
                            ruleCount: abacResult.ruleCount,
                        });
                    }
                    // allowAll → no ABAC filter needed
                }
            }
        }

        const result = await originalMethod(queryOptions);

        // Auto-filter fields based on permission metadata (if present)
        if (permissionMeta) {
            debugLog('Query API field filtering', { action: permissionMeta.action, subject: permissionMeta.subject });
            return autoFilterFields(result, permissionMeta.action, permissionMeta.subject);
        }

        return result;
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

function wrapInsert(originalInsert: typeof rawDb.insert, tablePrefix?: string) {
    return function insert(table: PgTable) {
        validateTablePrefix(table, tablePrefix);
        const insertBuilder = originalInsert(table);
        const originalValues = insertBuilder.values.bind(insertBuilder);
        const schema = detectTableSchema(table);
        const tableName = getTableName(table);

        insertBuilder.values = (values: any) => {
            const ctx = getCurrentContext();

            // Process single value or array
            const processValue = (val: any) => {
                const data = { ...val };

                // ✅ P0 Fix: FORCE override organizationId to prevent tenant isolation bypass
                // Previous code only set it if missing, allowing malicious code to pass other tenant IDs
                // ✅ Fail-safe: throw if context is missing organizationId for tables that require it
                if (schema.hasOrganizationId) {
                    if (!ctx.organizationId) {
                        throw new PermissionDeniedError(
                            `Cannot insert into table with organization_id column: ` +
                            `request context is missing organizationId. ` +
                            `This usually means session authentication failed silently. ` +
                            `Table: ${tableName}`
                        );
                    }
                    // Detect attempt to bypass tenant isolation
                    if ((data.organizationId || data.organization_id) &&
                        (data.organizationId !== ctx.organizationId && data.organization_id !== ctx.organizationId)) {
                        throw new PermissionDeniedError(
                            `Tenant isolation violation: Attempted to insert data with organizationId ` +
                            `"${data.organizationId || data.organization_id}" while in context of "${ctx.organizationId}". ` +
                            `Cross-tenant data manipulation is forbidden.`
                        );
                    }
                    // Force set to current context organizationId
                    data.organizationId = ctx.organizationId;
                    // Remove snake_case variant if present
                    delete data.organization_id;
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
                query.returning = (...args: any[]) => {
                    const returningQuery = (originalReturning as (...args: any[]) => any)(...args);
                    const returningExecute = returningQuery.execute?.bind(returningQuery);

                    if (returningExecute) {
                        returningQuery.execute = async (...execArgs: any[]) => {
                            const result = await returningExecute(...execArgs);

                            // Audit: record INSERT for each row
                            if (!shouldSkipAudit(tableName) && Array.isArray(result)) {
                                for (const row of result) {
                                    collectAuditEntry(tableName, 'INSERT', row['id'], {
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

function wrapUpdate(originalUpdate: typeof rawDb.update, tablePrefix?: string) {
    return function update(table: PgTable) {
        validateTablePrefix(table, tablePrefix);
        const updateBuilder = originalUpdate(table);
        const schema = detectTableSchema(table);
        const tableName = getTableName(table);

        // If table doesn't have LBAC columns, return as-is (but still audit)
        if (!schema.hasAclTags || !schema.hasDenyTags) {
            // Still wrap for audit even without LBAC
            return wrapUpdateBuilderForAudit(updateBuilder, table, tableName, schema);
        }

        const originalSet = updateBuilder.set.bind(updateBuilder);

        updateBuilder.set = (values: any) => {
            const setBuilder = originalSet(values);
            const originalWhere = setBuilder.where.bind(setBuilder);
            let whereWasCalled = false;

            // Override where() to inject LBAC and audit
            setBuilder.where = (condition: SQL) => {
                whereWasCalled = true;
                return wrapUpdateDeleteWhere(originalWhere, condition, schema, tableName, 'UPDATE', values, false, table);
            };

            // Capture raw execute before wrapping
            const rawExecute = setBuilder.execute?.bind(setBuilder);

            // Wrap execute() to auto-inject organizationId filter if where() was not called
            if (rawExecute) {
                setBuilder.execute = async (...args: any[]) => {
                    if (!whereWasCalled) {
                        const autoFilter = await buildLbacFilter(schema, {});
                        if (autoFilter) {
                            originalWhere(autoFilter);
                        }
                    }
                    return rawExecute(...args);
                };
            }

            // Wrap then() to support await without .execute()
            if (rawExecute) {
                setBuilder.then = (onfulfilled?: any, onrejected?: any) => {
                    const promise = (async () => {
                        if (!whereWasCalled) {
                            const autoFilter = await buildLbacFilter(schema, {});
                            if (autoFilter) {
                                originalWhere(autoFilter);
                            }
                        }
                        return await rawExecute();
                    })();

                    return promise.then(onfulfilled, onrejected);
                };
            }

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

    updateBuilder.set = (values: any) => {
        const setBuilder = originalSet(values);
        const originalWhere = setBuilder.where.bind(setBuilder);
        let whereWasCalled = false;

        setBuilder.where = (condition: SQL) => {
            whereWasCalled = true;
            return wrapUpdateDeleteWhere(originalWhere, condition, schema, tableName, 'UPDATE', values, true, table);
        };

        // Capture raw execute before wrapping
        const rawExecute = setBuilder.execute?.bind(setBuilder);

        // Wrap execute() to auto-inject organizationId filter if where() was not called
        if (rawExecute) {
            setBuilder.execute = async (...args: any[]) => {
                if (!whereWasCalled) {
                    const autoFilter = await buildLbacFilter(schema, { nopolicy: true });
                    if (autoFilter) {
                        originalWhere(autoFilter);
                    }
                }
                return rawExecute(...args);
            };
        }

        // Wrap then() to support await without .execute()
            if (rawExecute) {
                setBuilder.then = (onfulfilled?: any, onrejected?: any) => {
                    const promise = (async () => {
                        if (!whereWasCalled) {
                        const autoFilter = await buildLbacFilter(schema, { nopolicy: true });
                        if (autoFilter) {
                            originalWhere(autoFilter);
                        }
                    }
                    return await rawExecute();
                })();

                return promise.then(onfulfilled, onrejected);
            };
        }

        return setBuilder;
    };

    return updateBuilder;
}

// ============================================================
// Delete Wrapper: Auto-inject LBAC filter + Audit
// ============================================================

function wrapDelete(originalDelete: typeof rawDb.delete, tablePrefix?: string) {
    return function deleteFrom(table: PgTable) {
        validateTablePrefix(table, tablePrefix);
        const deleteBuilder = originalDelete(table);
        const schema = detectTableSchema(table);
        const tableName = getTableName(table);
        let whereWasCalled = false;

        /**
         * Guard helper: block DELETE without WHERE on execute/then/returning paths.
         * Extracted to avoid duplicating ~40 lines across LBAC and non-LBAC branches.
         */
        function applyDeleteSafety(builder: any) {
            const rawExecute = builder.execute?.bind(builder);
            if (rawExecute) {
                builder.execute = async (...args: any[]) => {
                    if (!whereWasCalled) {
                        throw new PermissionDeniedError(
                            `DELETE without WHERE clause on "${tableName}" is forbidden. ` +
                            'This would delete all rows in the table. Use db.$raw for intentional bulk deletions.'
                        );
                    }
                    return rawExecute(...args);
                };
            }

            const originalThen = builder.then?.bind(builder);
            if (originalThen && rawExecute) {
                builder.then = (onfulfilled?: any, onrejected?: any) => {
                    const promise = (async () => {
                        if (!whereWasCalled) {
                            throw new PermissionDeniedError(
                                `DELETE without WHERE clause on "${tableName}" is forbidden. ` +
                                'This would delete all rows in the table. Use db.$raw for intentional bulk deletions.'
                            );
                        }
                        return await rawExecute();
                    })();
                    return promise.then(onfulfilled, onrejected);
                };
            }

            // ✅ C2 Fix: Also guard .returning() path — db.delete(t).returning() without .where()
            const originalReturning = builder.returning?.bind(builder);
            if (originalReturning) {
                builder.returning = (...args: any[]) => {
                    if (!whereWasCalled) {
                        throw new PermissionDeniedError(
                            `DELETE without WHERE clause on "${tableName}" is forbidden. ` +
                            'This would delete all rows in the table. Use db.$raw for intentional bulk deletions.'
                        );
                    }
                    return originalReturning(...args);
                };
            }
        }

        // If table doesn't have LBAC columns, still wrap for audit + where-safety
        if (!schema.hasAclTags || !schema.hasDenyTags) {
            const originalWhere = deleteBuilder.where.bind(deleteBuilder);
            deleteBuilder.where = (condition: SQL) => {
                whereWasCalled = true;
                return wrapUpdateDeleteWhere(originalWhere, condition, schema, tableName, 'DELETE', undefined, true, table);
            };

            applyDeleteSafety(deleteBuilder);
            return deleteBuilder;
        }

        const originalWhere = deleteBuilder.where.bind(deleteBuilder);

        // Override where() to inject LBAC and audit
        deleteBuilder.where = (condition: SQL) => {
            whereWasCalled = true;
            return wrapUpdateDeleteWhere(originalWhere, condition, schema, tableName, 'DELETE', undefined, false, table);
        };

        applyDeleteSafety(deleteBuilder);
        return deleteBuilder;
    };
}

/**
 * ✅ P1 Fix: Simplified update/delete where wrapper
 *
 * Reduced from 420+ lines to ~150 lines by extracting ABAC execution strategy
 *
 * Wrap update/delete where clause with LBAC filter + Audit
 */
function wrapUpdateDeleteWhere(
    originalWhere: Function,
    userCondition: SQL,
    schema: TableSchemaInfo,
    tableName: string,
    operation: 'UPDATE' | 'DELETE',
    setValues?: any,
    nopolicy = false,
    table?: PgTable
) {
    const query = originalWhere(userCondition);

    // CRITICAL: Capture the ORIGINAL unwrapped execute/returning BEFORE wrapping
    const rawExecute = query.execute?.bind(query);
    const rawReturning = query.returning?.bind(query);

    // Flag to prevent duplicate audit when using .returning()
    let hasReturning = false;

    // Helper to build final condition with LBAC
    const buildFinalCondition = async () => {
        if (nopolicy) {
            return userCondition;
        }
        const lbacFilter = await buildLbacFilter(schema, {});
        return lbacFilter
            ? and(lbacFilter, userCondition)!
            : userCondition;
    };

    // ✅ P1 Fix: Wrap execute() using unified ABAC strategy
    if (rawExecute) {
        query.execute = async (...args: any[]) => {
            const finalCondition = await buildFinalCondition();
            const permissionMeta = getPermissionMeta();

            let result: any;

            // If permission metadata is available AND we have the table reference, perform ABAC
            if (permissionMeta && table) {
                const abacResult = await executeWithAbac({
                    operation,
                    table,
                    finalCondition,
                    permissionMeta,
                    setValues,
                }, false); // shouldReturn = false
                result = abacResult.result;
            } else {
                // No permission metadata - fall back to original behavior (LBAC only)
                originalWhere(finalCondition);
                result = await rawExecute(...args);
            }

            // Schedule audit write ONLY if not using .returning()
            if (!shouldSkipAudit(tableName) && !hasReturning) {
                collectAuditEntry(tableName, operation, 'batch', {
                    ...(setValues ? { old: { _note: 'before data not captured' } } : {}),
                    ...(operation === 'UPDATE' ? { new: setValues } : {}),
                });
            }

            return result;
        };
    }

    // ✅ P1 Fix: Wrap returning() using unified ABAC strategy
    if (rawReturning) {
        query.returning = (...args: any[]) => {
            hasReturning = true;

            const returningQuery = rawReturning(...args);
            const rawReturningExecute = returningQuery.execute?.bind(returningQuery);

            if (rawReturningExecute) {
                returningQuery.execute = async (...execArgs: any[]) => {
                    const finalCondition = await buildFinalCondition();
                    const permissionMeta = getPermissionMeta();

                    let result: any;

                    // If permission metadata is available AND we have the table reference, perform ABAC
                    if (permissionMeta && table) {
                        const abacResult = await executeWithAbac({
                            operation,
                            table,
                            finalCondition,
                            permissionMeta,
                            setValues,
                        }, true); // shouldReturn = true
                        result = abacResult.result;
                    } else {
                        // No permission metadata - fall back to original behavior
                        originalWhere(finalCondition);
                        result = await rawReturningExecute(...execArgs);
                    }

                    // Schedule audit writes with actual result data
                    if (!shouldSkipAudit(tableName) && Array.isArray(result)) {
                        for (const row of result) {
                            collectAuditEntry(tableName, operation, String(row?.['id'] ?? 'unknown'), {
                                ...(operation === 'UPDATE' ? { new: row } : {}),
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
/**
 * Wrap transaction callback to provide ScopedDb to the callback
 *
 * Note: Transaction context inherits all ScopedDb wrappers (LBAC, permissions, audit).
 * The callback receives a proxied transaction object with the same API as ScopedDb.
 */
function wrapTransaction(originalTransaction: typeof rawDb.transaction, tablePrefix?: string) {
    return function transaction<T>(
        callback: (tx: Database) => Promise<T>,
        options?: any
    ): Promise<T> {
        return originalTransaction(async (rawTx: any) => {
            // Wrap the raw transaction object with ScopedDb proxy
            // This ensures tx.query, tx.update, etc. have the same behavior as ctx.db
            const wrappedTx = new Proxy(rawTx, {
                get(target: any, prop: string, receiver: any) {
                    if (prop === 'query') {
                        return wrapQueryApi(target.query, true, tablePrefix);
                    }
                    if (prop === '_query') {
                        return wrapQueryApi(target._query, false, tablePrefix);
                    }
                    if (prop === 'update') {
                        return wrapUpdate(target.update.bind(target), tablePrefix);
                    }
                    if (prop === 'delete') {
                        return wrapDelete(target.delete.bind(target), tablePrefix);
                    }
                    if (prop === 'insert') {
                        return wrapInsert(target.insert.bind(target), tablePrefix);
                    }
                    if (prop === 'select') {
                        return wrapSelectBuilder(target.select.bind(target), tablePrefix);
                    }
                    if (tablePrefix && prop === 'execute') {
                        throw new PermissionDeniedError(
                            'Plugin cannot use execute() — raw SQL bypasses plugin table prefix isolation.'
                        );
                    }
                    // Plugin mode: block bypass methods in transaction too
                    if (tablePrefix && (prop === '$raw' || prop === '$nopolicy' || prop === '$unscope')) {
                        throw new PermissionDeniedError(
                            `Plugin cannot use ${prop} — this bypasses security filters.`
                        );
                    }
                    return Reflect.get(target, prop, receiver);
                },
            }) as Database;

            return callback(wrappedTx);
        }, options);
    };
}

// ============================================================
// ScopedDb Factory
// ============================================================

export interface CreateScopedDbOptions {
    /**
     * Table name prefix for plugin isolation.
     * When set, all table operations (select/insert/update/delete/query)
     * will validate that the target table name starts with this prefix.
     * Example: 'plugin_shop_' — only tables like plugin_shop_products are accessible.
     */
    tablePrefix?: string;
}

/**
 * Create a scoped database instance with LBAC, tenant isolation, and optional plugin table prefix.
 *
 * @param options.tablePrefix - When set, restricts table access to tables starting with this prefix
 * @returns Drizzle-compatible database instance with security filters applied
 */
export function createScopedDb(options?: CreateScopedDbOptions): Database & { $raw?: Database } {
    const tablePrefix = options?.tablePrefix;

    return new Proxy(rawDb, {
        get(target, prop, receiver) {
            // Wrap select() for SQL-like API
            if (prop === 'select') {
                return wrapSelectBuilder(target.select.bind(target), tablePrefix);
            }

            // Wrap query for Query API (v2: object-based where)
            if (prop === 'query') {
                return wrapQueryApi(target.query, true, tablePrefix);
            }

            // Wrap _query for Query API (v1: function-based where, deprecated)
            if (prop === '_query') {
                return wrapQueryApi((target as any)._query, false, tablePrefix);
            }

            // Wrap insert() for auto-defaults + audit collection
            if (prop === 'insert') {
                return wrapInsert(target.insert.bind(target), tablePrefix);
            }

            // Wrap update() for LBAC filtering + audit collection
            if (prop === 'update') {
                return wrapUpdate(target.update.bind(target), tablePrefix);
            }

            // Wrap delete() for LBAC filtering + audit collection
            if (prop === 'delete') {
                return wrapDelete(target.delete.bind(target), tablePrefix);
            }

            // Wrap transaction to provide ScopedDb to callback
            if (prop === 'transaction') {
                return wrapTransaction(target.transaction.bind(target), tablePrefix);
            }

            // Plugin mode: block all bypass methods
            if (tablePrefix && prop === 'execute') {
                throw new PermissionDeniedError(
                    'Plugin cannot use execute() — raw SQL bypasses plugin table prefix isolation.'
                );
            }
            if (tablePrefix && (prop === '$raw' || prop === '$nopolicy' || prop === '$unscope')) {
                throw new PermissionDeniedError(
                    `Plugin cannot use ${String(prop)} — this bypasses security filters and is not allowed for plugins.`
                );
            }

            // Expose raw db for system operations (core routes only)
            // ✅ Security Fix: Require System Context (consistent with $unscope/$nopolicy)
            if (prop === '$raw') {
                if (!isSystemContext()) {
                    console.error(
                        '[ScopedDb] Security Alert: Attempted $raw access outside system context. ' +
                        'This bypasses all security filters (tenant isolation, LBAC, audit).'
                    );
                    throw new PermissionDeniedError(
                        'Direct raw database access is restricted to system context only. ' +
                        'Use standard db queries or wrap your operation in system context.'
                    );
                }
                return target;
            }

            // Pass through everything else
            return Reflect.get(target, prop, receiver);
        },
    }) as Database & {
        /** Raw database access (bypasses LBAC) - Requires System Context */
        $raw: Database;
    };
}

/**
 * Default ScopedDb instance (no table prefix — used by core routes)
 */
export const db = createScopedDb();

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

// Re-export raw db
export { rawDb };
export type { Database };

// ============================================================
// Test Exports (for unit testing internal functions)
// ============================================================

/**
 * @internal Exported for testing only
 */
export const __test__ = {
    // P0: Security functions
    isSystemContext,
    getCurrentContext,

    // P2: Caching functions
    sanitizeForLog,
    getCachedUserKeys,

    // P3: ABAC functions
    checkAbacForInstances,
    getAbacDenialReason,

    // Field filtering
    autoFilterFields,
    filterUpdateValues,
    filterObject,

    // Schema detection
    detectTableSchema,

    // LBAC filter
    buildLbacFilter,

    // Critical fixes: Helpers and constants
    chunkArray,
    ABAC_CONCURRENCY_LIMIT,
    DOUBLE_QUERY_BATCH_SIZE,
    DOUBLE_QUERY_MAX_INSTANCES,

    // Major-3 fix: Request-level cache
    generateUserKeysCacheHash,
    getCachedKeysArraySQL,
    USER_KEYS_CACHE_TTL_MS,
    USER_KEYS_CACHE_MAX_SIZE,
    cleanupExpiredUserKeysCache,

    // Major-4 fix: Multi-rule SQL Pushdown
    buildCombinedAbacSQL,
};
