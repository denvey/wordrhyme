/**
 * CASL Ability Factory
 *
 * Creates CASL abilities for permission evaluation. Supports:
 * - Database-driven rules from role_permissions table
 * - Condition interpolation (e.g., { "ownerId": "${user.id}" })
 * - Multi-tenant context with optional team scoping
 * - Field-level permissions
 */
import { createMongoAbility, MongoAbility, RawRuleOf } from '@casl/ability';
import { db } from '../db';
import { roles, rolePermissions } from '../db/schema/definitions';
import { eq, and, inArray } from 'drizzle-orm';
import type { CaslRule } from '../db/schema/role-permissions';

/**
 * Subject type for CASL - includes subject name for type detection
 */
export type SubjectType = string | { __caslSubjectType__: string; [key: string]: unknown };

/**
 * Application subjects - all resources that can be protected
 */
export type AppSubjects =
    | 'all'
    | 'User'
    | 'Organization'
    | 'Team'
    | 'Content'
    | 'Menu'
    | 'Plugin'
    | 'Role'
    | 'Permission'
    | 'AuditLog'
    | SubjectType; // Allow dynamic subjects for plugins and instances

/**
 * Application actions
 */
export type AppActions = 'manage' | 'create' | 'read' | 'update' | 'delete' | string;

/**
 * Application Ability type
 */
export type AppAbility = MongoAbility<[AppActions, AppSubjects]>;

/**
 * User context for ability creation
 */
export interface AbilityUserContext {
    id: string;
    organizationId?: string | undefined;
    currentTeamId?: string | undefined;
    [key: string]: unknown;
}

/**
 * Interpolate condition values with user context
 *
 * Replaces template variables like "${user.id}" with actual values
 *
 * @example
 * interpolateConditions({ ownerId: "${user.id}" }, { id: "123" })
 * // Returns: { ownerId: "123" }
 */
export function interpolateConditions(
    conditions: Record<string, unknown> | null | undefined,
    user: AbilityUserContext
): Record<string, unknown> | undefined {
    if (!conditions) return undefined;

    const interpolated: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(conditions)) {
        if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
            // Extract path: "${user.id}" -> "user.id"
            const path = value.slice(2, -1);
            // Parse path: "user.id" -> ["user", "id"]
            const parts = path.split('.');

            if (parts[0] === 'user' && parts.length > 1) {
                // Get value from user context
                const userKey = parts.slice(1).join('.');
                interpolated[key] = getNestedValue(user, userKey);
            } else {
                // Unknown template, keep as-is
                interpolated[key] = value;
            }
        } else if (typeof value === 'object' && value !== null) {
            // Recursively interpolate nested objects
            interpolated[key] = interpolateConditions(
                value as Record<string, unknown>,
                user
            );
        } else {
            interpolated[key] = value;
        }
    }

    return interpolated;
}

/**
 * Get nested value from object by path
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
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
 * Load CASL rules from database for given role names
 *
 * @param roleNames - Array of role slugs to load rules for
 * @param orgId - Organization ID for tenant scoping
 * @returns Array of raw CASL rules
 */
export async function loadRulesFromDB(
    roleNames: string[],
    orgId: string
): Promise<CaslRule[]> {
    if (roleNames.length === 0 || !orgId) {
        return [];
    }

    try {
        // Find all roles matching the slugs in this organization
        const roleRecords = await db
            .select({ id: roles.id })
            .from(roles)
            .where(and(
                inArray(roles.slug, roleNames),
                eq(roles.organizationId, orgId)
            ));

        if (roleRecords.length === 0) {
            return [];
        }

        const roleIds = roleRecords.map(r => r.id);

        // Load all permissions for these roles
        const permissions = await db
            .select({
                action: rolePermissions.action,
                subject: rolePermissions.subject,
                fields: rolePermissions.fields,
                conditions: rolePermissions.conditions,
                inverted: rolePermissions.inverted,
            })
            .from(rolePermissions)
            .where(inArray(rolePermissions.roleId, roleIds));

        return permissions.map(p => ({
            action: p.action,
            subject: p.subject,
            fields: p.fields,
            conditions: p.conditions,
            inverted: p.inverted,
        }));
    } catch (error) {
        console.error('[CASL] Failed to load rules from DB:', error);
        return [];
    }
}

/**
 * Convert database rules to CASL raw rules with condition interpolation
 */
export function toRawRules(
    dbRules: CaslRule[],
    user: AbilityUserContext
): RawRuleOf<AppAbility>[] {
    return dbRules.map(rule => {
        const rawRule: RawRuleOf<AppAbility> = {
            action: rule.action,
            subject: rule.subject,
        };

        // Add fields if present
        if (rule.fields && rule.fields.length > 0) {
            rawRule.fields = rule.fields;
        }

        // Interpolate and add conditions if present
        if (rule.conditions) {
            const interpolated = interpolateConditions(rule.conditions, user);
            if (interpolated && Object.keys(interpolated).length > 0) {
                rawRule.conditions = interpolated;
            }
        }

        // Add inverted flag for "cannot" rules
        if (rule.inverted) {
            rawRule.inverted = true;
        }

        return rawRule;
    });
}

/**
 * Create CASL ability for a user
 *
 * @param user - User context including id, organizationId, currentTeamId
 * @param roleNames - Array of role slugs assigned to user (org + team roles)
 * @returns CASL MongoAbility instance
 */
export async function createAppAbility(
    user: AbilityUserContext,
    roleNames: string[] = []
): Promise<AppAbility> {
    const orgId = user.organizationId;

    if (!orgId || roleNames.length === 0) {
        // No org or no roles = no permissions (deny by default)
        return createMongoAbility<[AppActions, AppSubjects]>([]);
    }

    // Load rules from database
    const dbRules = await loadRulesFromDB(roleNames, orgId);

    // Convert to CASL raw rules with interpolation
    const rawRules = toRawRules(dbRules, user);

    return createMongoAbility<[AppActions, AppSubjects]>(rawRules);
}

/**
 * Create ability from pre-loaded rules (for caching scenarios)
 */
export function createAbilityFromRules(
    rules: CaslRule[],
    user: AbilityUserContext
): AppAbility {
    const rawRules = toRawRules(rules, user);
    return createMongoAbility<[AppActions, AppSubjects]>(rawRules);
}
