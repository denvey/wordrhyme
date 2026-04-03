/**
 * Cross-Tenant Permission Utilities
 *
 * Provides helper functions for checking and applying cross-tenant permissions.
 * Only Platform organization can perform cross-tenant operations.
 *
 * Permission Composition Model:
 * - User must have 'cross-tenant' permission (independent capability)
 * - User must have resource-specific permission (e.g., 'read:Order')
 * - Both permissions are required for cross-tenant access
 *
 * Example:
 * - User has 'cross-tenant' + 'read:Order' → Can read orders across all organizations
 * - User has only 'read:Order' → Can only read orders in current organization
 * - User has only 'cross-tenant' → Cannot access any resources
 */

import type { Context } from '../trpc/context';
import { createAppAbility, type AbilityUserContext } from './casl-ability';

/**
 * Check if the current context allows cross-tenant access for a subject
 *
 * Requirements (all must be met):
 * 1. Must be in Platform organization (organizationId === 'platform')
 * 2. Must have 'cross-tenant' permission
 * 3. Must have resource-specific permission (e.g., 'read:Order')
 *
 * @param ctx - tRPC context
 * @param subject - Resource subject (e.g., 'User', 'Order')
 * @param action - Action to perform (default: 'read')
 * @returns true if cross-tenant access is allowed
 *
 * @example
 * // User has 'cross-tenant' + 'read:Order' permissions
 * if (await canCrossTenant(ctx, 'Order')) {
 *     // Query all orders across all organizations
 * } else {
 *     // Query only current organization's orders
 * }
 */
export async function canCrossTenant(
    ctx: Context,
    subject: string,
    action = 'read'
): Promise<boolean> {
    // Requirement 1: Only Platform organization can perform cross-tenant operations
    if (ctx.organizationId !== 'platform') {
        return false;
    }

    // Get user roles from context
    const userRoles = (ctx as { userRoles?: string[] }).userRoles || [];
    if (userRoles.length === 0) {
        return false;
    }

    // Create ability instance
    const abilityUser: AbilityUserContext = {
        id: ctx.userId || '',
        organizationId: ctx.organizationId,
    };

    const ability = await createAppAbility(abilityUser, userRoles);

    // Requirement 2: Must have 'cross-tenant' permission
    const hasCrossTenantPermission = ability.can('manage', 'cross-tenant');
    if (!hasCrossTenantPermission) {
        return false;
    }

    // Requirement 3: Must have resource-specific permission
    const hasResourcePermission = ability.can(action, subject as any);
    if (!hasResourcePermission) {
        return false;
    }

    // All requirements met
    return true;
}

/**
 * Apply cross-tenant filter to a Drizzle query
 *
 * If cross-tenant access is allowed, returns undefined (no filter needed).
 * Otherwise, returns organizationId filter for current organization.
 *
 * Note: This function returns a WHERE condition, not a modified query.
 * Use it with Drizzle's where() method.
 *
 * @param ctx - tRPC context
 * @param subject - Resource subject
 * @param organizationIdColumn - Column reference for organizationId (from Drizzle schema)
 * @returns WHERE condition or undefined (no filter)
 *
 * @example
 * import { eq } from 'drizzle-orm';
 * import { user } from '../db/schema';
 *
 * const filter = await applyCrossTenantFilter(ctx, 'User', user.organizationId);
 * let query = db.select().from(user);
 * if (filter) {
 *     query = query.where(filter);
 * }
 * const users = await query;
 */
export async function applyCrossTenantFilter(
    ctx: Context,
    subject: string,
    organizationIdColumn: any
): Promise<any> {
    if (await canCrossTenant(ctx, subject)) {
        // Cross-tenant query: no filter needed
        return undefined;
    }

    // Regular query: filter by current organization
    const { eq } = require('drizzle-orm');
    return eq(organizationIdColumn, ctx.organizationId);
}

/**
 * Get organization filter condition for cross-tenant queries
 *
 * Returns null if cross-tenant access is allowed (no filter needed).
 * Returns organizationId condition otherwise.
 *
 * @param ctx - tRPC context
 * @param subject - Resource subject
 * @returns Organization filter condition or null
 *
 * @example
 * const orgFilter = await getOrgFilter(ctx, 'User');
 * const query = db.select().from(user);
 * if (orgFilter) {
 *     query.where(orgFilter);
 * }
 */
export async function getOrgFilter(
    ctx: Context,
    subject: string
): Promise<{ organizationId: string } | null> {
    if (await canCrossTenant(ctx, subject)) {
        return null; // No filter needed
    }

    return { organizationId: ctx.organizationId || '' };
}

/**
 * Log cross-tenant access for audit purposes
 *
 * Should be called after successful cross-tenant operations.
 *
 * @param ctx - tRPC context
 * @param action - Action performed
 * @param subject - Resource subject
 * @param recordCount - Number of records accessed
 * @param metadata - Additional metadata
 *
 * @example
 * const users = await query;
 * if (await canCrossTenant(ctx, 'User')) {
 *     await logCrossTenantAccess(ctx, 'read', 'User', users.length);
 * }
 */
export async function logCrossTenantAccess(
    ctx: Context,
    action: string,
    subject: string,
    recordCount: number,
    metadata?: Record<string, unknown>
): Promise<void> {
    // TODO: Implement audit logging
    // This should write to audit_logs table with:
    // - userId
    // - action
    // - subject
    // - recordCount
    // - timestamp
    // - ipAddress
    // - userAgent
    // - metadata

    console.log('[Cross-Tenant Access]', {
        userId: ctx.userId,
        action,
        subject,
        recordCount,
        timestamp: new Date().toISOString(),
        metadata,
    });
}

/**
 * Require cross-tenant permission or throw error
 *
 * Use this to protect endpoints that should only be accessible with cross-tenant permissions.
 *
 * @param ctx - tRPC context
 * @param subject - Resource subject
 * @param action - Action to perform
 * @throws Error if cross-tenant access is not allowed
 *
 * @example
 * await requireCrossTenant(ctx, 'User', 'read');
 * // If we reach here, user has cross-tenant permission
 */
export async function requireCrossTenant(
    ctx: Context,
    subject: string,
    action = 'read'
): Promise<void> {
    if (!(await canCrossTenant(ctx, subject, action))) {
        throw new Error(
            `Cross-tenant ${action} access to ${subject} is not allowed. ` +
            `Must be in Platform organization with ${action}:${subject}:cross-tenant permission.`
        );
    }
}
