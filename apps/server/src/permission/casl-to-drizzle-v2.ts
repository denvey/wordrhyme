/**
 * CASL to Drizzle v2 Object Converter
 *
 * Converts CASL MongoDB-style conditions directly to Drizzle v2 object-based where syntax.
 * This is more efficient than casl-to-sql.ts as it doesn't require building SQL AST.
 *
 * ## Supported CASL MongoDB Operators → Drizzle v2 Mapping
 *
 * | CASL (MongoDB) | Drizzle v2 | Description |
 * |----------------|------------|-------------|
 * | `$eq`          | `eq`       | Equals |
 * | `$ne`          | `ne`       | Not equals |
 * | `$gt`          | `gt`       | Greater than |
 * | `$gte`         | `gte`      | Greater than or equal |
 * | `$lt`          | `lt`       | Less than |
 * | `$lte`         | `lte`      | Less than or equal |
 * | `$in`          | `in`       | In array |
 * | `$nin`         | `notIn`    | Not in array |
 * | `$exists: true`| `isNotNull`| Field is not null |
 * | `$exists: false`| `isNull`  | Field is null |
 * | `$and`         | `AND`      | Logical AND |
 * | `$or`          | `OR`       | Logical OR |
 * | `$not` / `$nor`| `NOT`      | Logical NOT |
 * | `$regex`       | `like`     | Pattern matching (converted) |
 *
 * ## Template Variable Resolution
 *
 * - `"${user.id}"` → actual user ID from context
 * - `"${user.organizationId}"` → actual org ID
 * - `"${user.currentTeamId}"` → actual team ID
 *
 * @example
 * ```typescript
 * // CASL conditions
 * const conditions = {
 *   ownerId: "${user.id}",
 *   status: { $in: ["draft", "published"] },
 *   deletedAt: { $exists: false },
 *   $or: [
 *     { visibility: "public" },
 *     { teamId: "${user.currentTeamId}" }
 *   ]
 * };
 *
 * // Converted to Drizzle v2
 * const drizzleWhere = {
 *   ownerId: "actual-user-id",
 *   status: { in: ["draft", "published"] },
 *   deletedAt: { isNull: true },
 *   OR: [
 *     { visibility: "public" },
 *     { teamId: "actual-team-id" }
 *   ]
 * };
 * ```
 *
 * @see https://orm.drizzle.team/docs/rqb-v2#select-filters
 */

import type { AbilityUserContext } from './casl-ability';
import { resolveTemplateValue } from './casl-to-sql';

const DEBUG_CASL_V2 = process.env['DEBUG_PERMISSION'] === 'true';

/**
 * Drizzle v2 comparison operators
 */
type DrizzleV2ComparisonOp =
    | 'eq' | 'ne'
    | 'gt' | 'gte' | 'lt' | 'lte'
    | 'in' | 'notIn'
    | 'like' | 'ilike' | 'notLike' | 'notIlike'
    | 'isNull' | 'isNotNull'
    | 'arrayOverlaps' | 'arrayContained' | 'arrayContains';

/**
 * Drizzle v2 where clause structure
 */
interface DrizzleV2Where {
    OR?: DrizzleV2Where[];
    AND?: DrizzleV2Where[];
    NOT?: DrizzleV2Where;
    RAW?: (table: any) => any;
    [column: string]: unknown;
}

/**
 * Drizzle v2 column filter
 */
interface DrizzleV2ColumnFilter {
    OR?: DrizzleV2ColumnFilter[];
    AND?: DrizzleV2ColumnFilter[];
    NOT?: DrizzleV2ColumnFilter;
    eq?: unknown;
    ne?: unknown;
    gt?: unknown;
    gte?: unknown;
    lt?: unknown;
    lte?: unknown;
    in?: unknown[];
    notIn?: unknown[];
    like?: string;
    ilike?: string;
    notLike?: string;
    notIlike?: string;
    isNull?: boolean;
    isNotNull?: boolean;
    arrayOverlaps?: unknown[];
    arrayContained?: unknown[];
    arrayContains?: unknown[];
}

/**
 * CASL MongoDB operator to Drizzle v2 operator mapping
 */
const OPERATOR_MAP: Record<string, DrizzleV2ComparisonOp | null> = {
    '$eq': 'eq',
    '$ne': 'ne',
    '$gt': 'gt',
    '$gte': 'gte',
    '$lt': 'lt',
    '$lte': 'lte',
    '$in': 'in',
    '$nin': 'notIn',
    '$like': 'like',
    '$ilike': 'ilike',
    '$regex': 'like', // Basic regex → like conversion
    // $exists is handled specially
};

/**
 * Conversion result
 */
export interface CaslToDrizzleV2Result {
    success: boolean;
    where?: DrizzleV2Where;
    allowAll?: boolean;
    error?: string;
}

/**
 * Convert CASL conditions value to Drizzle v2 column filter
 *
 * Handles both simple values and MongoDB operator objects
 */
function convertFieldValue(
    value: unknown,
    userContext: AbilityUserContext
): unknown {
    // Resolve template variables first
    const resolved = resolveTemplateValue(value, userContext);

    // Simple value → direct equality (Drizzle v2 shorthand)
    if (
        typeof resolved === 'string' ||
        typeof resolved === 'number' ||
        typeof resolved === 'boolean'
    ) {
        return resolved;
    }

    // null → isNull
    if (resolved === null) {
        return { isNull: true };
    }

    // Array without operator → implicit $in
    if (Array.isArray(resolved)) {
        if (resolved.length === 0) {
            // Empty array → impossible condition
            return { in: [] };
        }
        return { in: resolved };
    }

    // MongoDB operator object
    if (typeof resolved === 'object' && resolved !== null) {
        const ops = resolved as Record<string, unknown>;
        const filter: DrizzleV2ColumnFilter = {};
        let hasOperator = false;

        for (const [op, opValue] of Object.entries(ops)) {
            if (!op.startsWith('$')) {
                // Not an operator, might be nested object
                continue;
            }

            hasOperator = true;

            // Handle $exists specially
            if (op === '$exists') {
                if (opValue === true) {
                    filter.isNotNull = true;
                } else if (opValue === false) {
                    filter.isNull = true;
                }
                continue;
            }

            // Handle $not specially
            if (op === '$not') {
                const notResult = convertFieldValue(opValue, userContext);
                filter.NOT = notResult as DrizzleV2ColumnFilter;
                continue;
            }

            // Handle $regex → like conversion
            if (op === '$regex') {
                // Basic conversion: wrap with %
                const pattern = String(opValue);
                // Remove ^ and $ anchors, convert * to %
                const likePattern = pattern
                    .replace(/^\^/, '')
                    .replace(/\$$/, '')
                    .replace(/\.\*/g, '%')
                    .replace(/\*/g, '%');
                filter.like = `%${likePattern}%`;
                continue;
            }

            // Map standard operators
            const drizzleOp = OPERATOR_MAP[op];
            if (drizzleOp) {
                // Resolve nested template variables in array values
                const resolvedOpValue = resolveTemplateValue(opValue, userContext);
                (filter as any)[drizzleOp] = resolvedOpValue;
            } else if (DEBUG_CASL_V2) {
                console.warn(`[CASL-V2] Unknown operator: ${op}`);
            }
        }

        // If no operators found, it might be a direct value
        if (!hasOperator) {
            return resolved;
        }

        return filter;
    }

    // Undefined or unhandled → return as-is
    return resolved;
}

/**
 * Convert CASL MongoDB conditions to Drizzle v2 object-based where clause
 *
 * @param conditions - CASL MongoDB-style conditions
 * @param userContext - User context for template resolution
 * @returns Conversion result with Drizzle v2 where object
 *
 * @example
 * ```typescript
 * const conditions = {
 *   ownerId: "${user.id}",
 *   status: { $in: ["draft", "published"] },
 *   $or: [
 *     { visibility: "public" },
 *     { teamId: "${user.currentTeamId}" }
 *   ]
 * };
 *
 * const result = caslToDrizzleV2(conditions, userContext);
 * if (result.success) {
 *   db.query.articles.findMany({ where: result.where });
 * }
 * ```
 */
export function caslToDrizzleV2(
    conditions: Record<string, unknown> | null | undefined,
    userContext: AbilityUserContext
): CaslToDrizzleV2Result {
    // Empty conditions → allow all
    if (!conditions || Object.keys(conditions).length === 0) {
        return { success: true, allowAll: true };
    }

    try {
        const where: DrizzleV2Where = {};

        for (const [key, value] of Object.entries(conditions)) {
            // Handle logical operators at root level
            if (key === '$and') {
                if (!Array.isArray(value)) {
                    return { success: false, error: '$and must be an array' };
                }
                const andConditions: DrizzleV2Where[] = [];
                for (const subCondition of value) {
                    const subResult = caslToDrizzleV2(
                        subCondition as Record<string, unknown>,
                        userContext
                    );
                    if (!subResult.success) {
                        return subResult;
                    }
                    if (subResult.where) {
                        andConditions.push(subResult.where);
                    }
                }
                if (andConditions.length > 0) {
                    where.AND = andConditions;
                }
                continue;
            }

            if (key === '$or') {
                if (!Array.isArray(value)) {
                    return { success: false, error: '$or must be an array' };
                }
                const orConditions: DrizzleV2Where[] = [];
                for (const subCondition of value) {
                    const subResult = caslToDrizzleV2(
                        subCondition as Record<string, unknown>,
                        userContext
                    );
                    if (!subResult.success) {
                        return subResult;
                    }
                    if (subResult.where) {
                        orConditions.push(subResult.where);
                    }
                }
                if (orConditions.length > 0) {
                    where.OR = orConditions;
                }
                continue;
            }

            if (key === '$not' || key === '$nor') {
                // $not: single condition, $nor: array of conditions (all must be false)
                if (key === '$nor' && Array.isArray(value)) {
                    // $nor: [a, b, c] → NOT: { OR: [a, b, c] }
                    const norConditions: DrizzleV2Where[] = [];
                    for (const subCondition of value) {
                        const subResult = caslToDrizzleV2(
                            subCondition as Record<string, unknown>,
                            userContext
                        );
                        if (!subResult.success) {
                            return subResult;
                        }
                        if (subResult.where) {
                            norConditions.push(subResult.where);
                        }
                    }
                    if (norConditions.length > 0) {
                        where.NOT = { OR: norConditions };
                    }
                } else {
                    // $not: single condition
                    const notResult = caslToDrizzleV2(
                        value as Record<string, unknown>,
                        userContext
                    );
                    if (!notResult.success) {
                        return notResult;
                    }
                    if (notResult.where) {
                        where.NOT = notResult.where;
                    }
                }
                continue;
            }

            // Skip other $ prefixed keys (unsupported operators)
            if (key.startsWith('$')) {
                if (DEBUG_CASL_V2) {
                    console.warn(`[CASL-V2] Unsupported root operator: ${key}`);
                }
                return { success: false, error: `Unsupported root operator: ${key}` };
            }

            // Regular field condition
            const converted = convertFieldValue(value, userContext);
            where[key] = converted;
        }

        if (DEBUG_CASL_V2) {
            console.log('[CASL-V2] Conversion succeeded:', JSON.stringify(where, null, 2));
        }

        return { success: true, where };
    } catch (error) {
        if (DEBUG_CASL_V2) {
            console.error('[CASL-V2] Conversion error:', error);
        }
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown conversion error',
        };
    }
}

/**
 * Build combined Drizzle v2 where from multiple CASL rules
 *
 * Handles:
 * - Multiple "can" rules → OR combination
 * - "cannot" rules → AND NOT combination
 * - Unconditional "can" rules → allowAll flag
 *
 * @param rules - CASL rules array
 * @param action - Permission action (e.g., 'read', 'update')
 * @param subject - Permission subject (e.g., 'Article')
 * @param userContext - User context for template resolution
 */
export interface CombinedDrizzleV2Result {
    success: boolean;
    where?: DrizzleV2Where;
    allowAll?: boolean;
    ruleCount?: number;
    error?: string;
}

export function buildCombinedAbacDrizzleV2(
    rules: any[] | undefined,
    action: string,
    subject: string,
    userContext: AbilityUserContext
): CombinedDrizzleV2Result {
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
        return { success: true, allowAll: true, ruleCount: 1 };
    }

    // Build "can" conditions (OR together)
    const canConditions: DrizzleV2Where[] = [];
    for (const rule of canRules) {
        if (!rule.conditions) {
            // Unconditional "can" with "cannot" rules - handled below
            continue;
        }

        const result = caslToDrizzleV2(rule.conditions, userContext);
        if (result.success && result.where) {
            canConditions.push(result.where);
        } else if (!result.allowAll) {
            if (DEBUG_CASL_V2) {
                console.warn('[CASL-V2] Cannot convert rule conditions:', {
                    conditions: rule.conditions,
                    error: result.error,
                });
            }
            return { success: false, error: `Cannot convert condition: ${result.error}` };
        }
    }

    // Build "cannot" conditions (AND NOT each)
    const cannotConditions: DrizzleV2Where[] = [];
    for (const rule of cannotRules) {
        if (!rule.conditions) {
            // Unconditional "cannot" = deny all
            return { success: false, error: 'Unconditional cannot rule blocks all access' };
        }

        const result = caslToDrizzleV2(rule.conditions, userContext);
        if (result.success && result.where) {
            cannotConditions.push(result.where);
        } else if (!result.allowAll) {
            // For "cannot" rules, if we can't convert, be conservative
            return { success: false, error: `Cannot convert cannot-condition: ${result.error}` };
        }
    }

    // Combine conditions
    let finalWhere: DrizzleV2Where;

    if (canConditions.length > 0) {
        // Multiple "can" conditions → OR
        finalWhere = canConditions.length === 1
            ? canConditions[0]
            : { OR: canConditions };
    } else if (unconditionalCan) {
        // Unconditional "can" with "cannot" rules
        // Start with empty object (matches all) and apply NOT conditions
        finalWhere = {};
    } else {
        return { success: false, error: 'No valid can conditions' };
    }

    // Apply "cannot" conditions as NOT
    if (cannotConditions.length > 0) {
        const andConditions: DrizzleV2Where[] = [finalWhere];

        for (const cannotCond of cannotConditions) {
            andConditions.push({ NOT: cannotCond });
        }

        finalWhere = { AND: andConditions };
    }

    return {
        success: true,
        where: finalWhere,
        ruleCount: canConditions.length + cannotConditions.length + (unconditionalCan ? 1 : 0),
    };
}

/**
 * Merge Drizzle v2 where conditions with AND
 *
 * Utility function to combine multiple where conditions
 */
export function mergeWhereAnd(
    ...conditions: (DrizzleV2Where | undefined)[]
): DrizzleV2Where | undefined {
    const validConditions = conditions.filter((c): c is DrizzleV2Where =>
        c !== undefined && Object.keys(c).length > 0
    );

    if (validConditions.length === 0) {
        return undefined;
    }

    if (validConditions.length === 1) {
        return validConditions[0];
    }

    return { AND: validConditions };
}

/**
 * Merge Drizzle v2 where conditions with OR
 *
 * Utility function to combine multiple where conditions
 */
export function mergeWhereOr(
    ...conditions: (DrizzleV2Where | undefined)[]
): DrizzleV2Where | undefined {
    const validConditions = conditions.filter((c): c is DrizzleV2Where =>
        c !== undefined && Object.keys(c).length > 0
    );

    if (validConditions.length === 0) {
        return undefined;
    }

    if (validConditions.length === 1) {
        return validConditions[0];
    }

    return { OR: validConditions };
}
