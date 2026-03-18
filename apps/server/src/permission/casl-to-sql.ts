/**
 * CASL to SQL Converter - Performance Optimization
 *
 * Converts CASL MongoDB-style conditions to Drizzle SQL conditions
 * This enables single-query ABAC enforcement instead of double-query pattern
 *
 * Supported MongoDB operators:
 * - $eq: equals
 * - $ne: not equals
 * - $in: in array
 * - $nin: not in array
 * - $gt: greater than
 * - $gte: greater than or equal
 * - $lt: less than
 * - $lte: less than or equal
 * - $exists: field exists (not null)
 *
 * Template variable resolution:
 * - "${user.id}" → actual user ID from context
 * - "${user.organizationId}" → actual org ID
 * - "${user.currentTeamId}" → actual team ID
 */

import { SQL, sql, eq, ne, inArray, notInArray, gt, gte, lt, lte, isNull, isNotNull, and, or } from 'drizzle-orm';
import { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import type { AbilityUserContext } from './casl-ability';

const DEBUG_SQL_CONVERSION = process.env['DEBUG_PERMISSION'] === 'true';

/**
 * MongoDB operator types supported
 */
type MongoOperator = '$eq' | '$ne' | '$in' | '$nin' | '$gt' | '$gte' | '$lt' | '$lte' | '$exists';

/**
 * CASL condition value types
 */
type ConditionValue =
    | string
    | number
    | boolean
    | null
    | string[]
    | number[]
    | { [key in MongoOperator]?: ConditionValue };

/**
 * CASL conditions structure
 */
type CaslConditions = Record<string, ConditionValue>;

/**
 * Conversion result
 */
interface ConversionResult {
    success: boolean;
    sql?: SQL;
    error?: string;
}

/**
 * Get nested value from object by path
 *
 * @example
 * getNestedValue({ user: { id: '123' } }, 'user.id') // → '123'
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        if (typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }

    return current;
}

/**
 * ✅ P1-3 Fix: Template injection protection
 * Whitelist of allowed template paths
 */
const ALLOWED_TEMPLATE_PATHS = new Set([
    'user.id',
    'user.organizationId',
    'user.currentTeamId',
]);

/**
 * ✅ P1-3 Fix: Maximum path depth to prevent deep nesting attacks
 */
const MAX_PATH_DEPTH = 3;

/**
 * Resolve template variable value from user context
 *
 * ✅ P1-3 Fix: Added whitelist validation and depth limit
 *
 * @example
 * resolveTemplateValue("${user.id}", { id: '123' }) // → '123'
 * resolveTemplateValue("published", { ... }) // → 'published'
 */
export function resolveTemplateValue(
    value: unknown,
    userContext: AbilityUserContext
): unknown {
    // Handle template strings
    if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        const path = value.slice(2, -1); // Remove ${ and }
        const parts = path.split('.');

        // ✅ P1-3 Fix: Validate path depth
        if (parts.length > MAX_PATH_DEPTH) {
            if (DEBUG_SQL_CONVERSION) {
                console.warn(`[CASL-SQL] Template path too deep (max ${MAX_PATH_DEPTH}): ${value}`);
            }
            return undefined;
        }

        if (parts[0] === 'user' && parts.length > 1) {
            const userKey = parts.slice(1).join('.');
            const fullPath = `user.${userKey}`;

            // ✅ P1-3 Fix: Whitelist validation
            if (!ALLOWED_TEMPLATE_PATHS.has(fullPath)) {
                if (DEBUG_SQL_CONVERSION) {
                    console.warn(`[CASL-SQL] Template path not in whitelist: ${fullPath}`);
                }
                return undefined;
            }

            return getNestedValue(userContext, userKey);
        }

        if (DEBUG_SQL_CONVERSION) {
            console.warn(`[CASL-SQL] Unknown template variable: ${value}`);
        }
        return undefined;
    }

    // Handle arrays
    if (Array.isArray(value)) {
        return value.map(v => resolveTemplateValue(v, userContext));
    }

    // Handle nested objects (recursive)
    if (value !== null && typeof value === 'object') {
        const resolved: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
            resolved[key] = resolveTemplateValue(val, userContext);
        }
        return resolved;
    }

    // Primitive values
    return value;
}

/**
 * Get table column by field name
 * Supports both camelCase and snake_case
 */
function getTableColumn(table: PgTable, fieldName: string): PgColumn | undefined {
    const columns = table as unknown as Record<string, PgColumn>;

    // Try exact match
    if (columns[fieldName]) {
        return columns[fieldName];
    }

    // Try snake_case conversion
    const snakeCase = fieldName.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (columns[snakeCase]) {
        return columns[snakeCase];
    }

    // Try camelCase conversion
    const camelCase = fieldName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    if (columns[camelCase]) {
        return columns[camelCase];
    }

    return undefined;
}

/**
 * Convert MongoDB operator to SQL
 */
function convertOperator(
    column: PgColumn,
    operator: MongoOperator,
    value: unknown
): SQL | undefined {
    switch (operator) {
        case '$eq':
            if (value === null) {
                return isNull(column);
            }
            return eq(column, value as string | number);

        case '$ne':
            if (value === null) {
                return isNotNull(column);
            }
            return ne(column, value as string | number);

        case '$in':
            if (!Array.isArray(value) || value.length === 0) {
                return undefined;
            }
            return inArray(column, value as (string | number)[]);

        case '$nin':
            if (!Array.isArray(value) || value.length === 0) {
                return undefined;
            }
            return notInArray(column, value as (string | number)[]);

        case '$gt':
            return gt(column, value as string | number);

        case '$gte':
            return gte(column, value as string | number);

        case '$lt':
            return lt(column, value as string | number);

        case '$lte':
            return lte(column, value as string | number);

        case '$exists':
            return value === true ? isNotNull(column) : isNull(column);

        default:
            return undefined;
    }
}

/**
 * Convert single field condition to SQL
 */
function convertFieldCondition(
    table: PgTable,
    fieldName: string,
    value: ConditionValue,
    userContext: AbilityUserContext
): SQL | undefined {
    const column = getTableColumn(table, fieldName);
    if (!column) {
        if (DEBUG_SQL_CONVERSION) {
            console.warn(`[CASL-SQL] Column not found: ${fieldName}`);
        }
        return undefined;
    }

    // Resolve template variables
    const resolvedValue = resolveTemplateValue(value, userContext);

    // Simple equality check
    if (
        typeof resolvedValue === 'string' ||
        typeof resolvedValue === 'number' ||
        typeof resolvedValue === 'boolean' ||
        resolvedValue === null
    ) {
        if (resolvedValue === null) {
            return isNull(column);
        }
        return eq(column, resolvedValue as string | number);
    }

    // MongoDB operator object
    if (typeof resolvedValue === 'object' && resolvedValue !== null && !Array.isArray(resolvedValue)) {
        const conditions: SQL[] = [];

        for (const [op, opValue] of Object.entries(resolvedValue)) {
            if (op.startsWith('$')) {
                const sqlCondition = convertOperator(column, op as MongoOperator, opValue);
                if (sqlCondition) {
                    conditions.push(sqlCondition);
                } else {
                    // Unsupported operator, cannot convert
                    return undefined;
                }
            }
        }

        if (conditions.length === 0) {
            return undefined;
        }

        // Multiple conditions on same field = AND
        return conditions.length === 1 ? conditions[0] : and(...conditions);
    }

    // Array value without operator → implicit $in
    if (Array.isArray(resolvedValue)) {
        if (resolvedValue.length === 0) {
            return undefined;
        }
        return inArray(column, resolvedValue as (string | number)[]);
    }

    // Cannot convert
    return undefined;
}

/**
 * Convert CASL conditions to SQL
 *
 * @param conditions - CASL MongoDB-style conditions
 * @param table - Drizzle table schema
 * @param userContext - User context for template resolution
 * @returns Conversion result with SQL or error
 *
 * @example
 * const conditions = {
 *   ownerId: "${user.id}",
 *   status: { $in: ["draft", "published"] },
 *   deletedAt: { $exists: false }
 * };
 * const result = conditionsToSQL(conditions, articlesTable, userContext);
 * if (result.success) {
 *   query.where(result.sql);
 * }
 */
export function conditionsToSQL(
    conditions: CaslConditions | null | undefined,
    table: PgTable,
    userContext: AbilityUserContext
): ConversionResult {
    if (!conditions || Object.keys(conditions).length === 0) {
        return { success: true };
    }

    try {
        const sqlConditions: SQL[] = [];

        for (const [fieldName, value] of Object.entries(conditions)) {
            // Skip special MongoDB operators at root level ($and, $or, etc.)
            if (fieldName.startsWith('$')) {
                if (DEBUG_SQL_CONVERSION) {
                    console.warn(`[CASL-SQL] Root-level operator not supported: ${fieldName}`);
                }
                return {
                    success: false,
                    error: `Root-level operator ${fieldName} not supported`,
                };
            }

            const fieldCondition = convertFieldCondition(table, fieldName, value, userContext);

            if (!fieldCondition) {
                // Cannot convert this condition
                return {
                    success: false,
                    error: `Failed to convert field: ${fieldName}`,
                };
            }

            sqlConditions.push(fieldCondition);
        }

        if (sqlConditions.length === 0) {
            return { success: true };
        }

        // All conditions at root level are ANDed
        const finalSQL = sqlConditions.length === 1
            ? sqlConditions[0]
            : and(...sqlConditions);

        if (DEBUG_SQL_CONVERSION) {
            console.log('[CASL-SQL] Conversion succeeded');
        }

        return finalSQL ? { success: true, sql: finalSQL } : { success: true };
    } catch (error) {
        if (DEBUG_SQL_CONVERSION) {
            console.error('[CASL-SQL] Conversion error:', error);
        }
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
