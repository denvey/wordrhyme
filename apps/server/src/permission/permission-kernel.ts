import { Injectable, Logger } from '@nestjs/common';
import { PermissionScope, PermissionContext } from './permission.types';
import { parseCapability } from './capability-parser';
import {
    createAppAbility,
    loadRulesFromDB,
    createAbilityFromRules,
    type AppAbility,
    type AbilityUserContext,
    type AppSubjects,
} from './casl-ability';
import type { CaslRule } from '../db/schema/role-permissions';
import { getContext } from '../context/async-local-storage';
import { db } from '../db';
import { auditLogs } from '../db/schema/audit-logs';

/**
 * PermissionKernel - Centralized permission evaluation using CASL
 *
 * Implements white-list authorization model per PERMISSION_GOVERNANCE.md:
 * - Deny by default
 * - Centralized evaluation (plugins cannot self-authorize)
 * - Tenant-scoped permissions
 * - Per-request caching
 * - Audit logging for denied access and sensitive operations
 * - Database-driven role-permission mappings in CASL format
 *
 * Supports dual API for gradual migration:
 * - Legacy: can("content:read:space")
 * - CASL:   can("read", "Content") or can("read", "Content", article)
 */
@Injectable()
export class PermissionKernel {
    private readonly logger = new Logger(PermissionKernel.name);

    /**
     * Per-request ability cache
     * Key: requestId, Value: { ability, rules }
     */
    private abilityCache = new Map<string, { ability: AppAbility; rules: CaslRule[] }>();

    /**
     * Per-request permission result cache
     * Key: requestId, Value: Map<cacheKey, result>
     */
    private resultCache = new Map<string, Map<string, boolean>>();

    /**
     * Try to get context from AsyncLocalStorage, or return a fallback context
     * that will result in permission denial
     */
    private tryGetContext(): PermissionContext {
        try {
            return getContext();
        } catch {
            this.logger.warn('AsyncLocalStorage context not available, using fallback');
            return {
                requestId: 'no-context',
                userId: undefined,
                organizationId: undefined,
                userRole: undefined,
            };
        }
    }

    /**
     * Get or create CASL ability for current request
     */
    private async getAbility(ctx: PermissionContext): Promise<AppAbility> {
        const { requestId, userId, organizationId, userRole, userRoles, currentTeamId } = ctx as PermissionContext & {
            userRoles?: string[];
            currentTeamId?: string;
        };

        // Check cache
        if (this.abilityCache.has(requestId)) {
            return this.abilityCache.get(requestId)!.ability;
        }

        // Build user context for CASL
        const userContext: AbilityUserContext = {
            id: userId ?? '',
            organizationId: organizationId,
            currentTeamId,
        };

        // Aggregate roles: use userRoles if available, otherwise fall back to userRole
        const roleNames = userRoles ?? (userRole ? [userRole] : []);

        // Load rules and create ability
        const rules = organizationId ? await loadRulesFromDB(roleNames, organizationId) : [];
        const ability = createAbilityFromRules(rules, userContext);

        // Cache for this request
        this.abilityCache.set(requestId, { ability, rules });

        return ability;
    }

    /**
     * Check if current user has the specified capability
     *
     * Supports dual API:
     * - Legacy: can("content:read:space")
     * - CASL:   can("read", "Content") or can("read", "Content", subjectInstance)
     *
     * @param capabilityOrAction - Legacy capability string OR CASL action
     * @param subjectOrScope - Optional CASL subject OR legacy scope
     * @param subjectInstance - Optional subject instance for ABAC
     * @param explicitCtx - Optional explicit context (for use in tRPC middleware)
     * @returns true if allowed, false if denied
     */
    async can(
        capabilityOrAction: string,
        subjectOrScope?: string | PermissionScope,
        subjectInstance?: unknown,
        explicitCtx?: PermissionContext
    ): Promise<boolean> {
        const ctx = explicitCtx ?? this.tryGetContext();
        const { userId, organizationId, requestId } = ctx;

        // No user = no access
        if (!userId) {
            await this.logDenied(capabilityOrAction, 'No userId in context', ctx);
            return false;
        }

        // Parse the capability (handles both legacy and CASL formats)
        let action: string;
        let subject: string;
        let instance: unknown = subjectInstance;

        if (typeof subjectOrScope === 'string') {
            // CASL-style: can("read", "Content", ?instance)
            action = capabilityOrAction;
            subject = subjectOrScope;
        } else {
            // Legacy format: can("content:read:space", ?scope)
            const parsed = parseCapability(capabilityOrAction);
            action = parsed.action;
            subject = parsed.subject;

            // Tenant boundary check for legacy scope
            if (subjectOrScope?.organizationId && subjectOrScope.organizationId !== organizationId) {
                await this.logDenied(capabilityOrAction, 'Cross-tenant access denied', ctx);
                return false;
            }
        }

        // Check result cache
        const cacheKey = `${action}:${subject}:${instance ? JSON.stringify(instance) : 'no-instance'}`;
        const requestCache = this.resultCache.get(requestId);
        if (requestCache?.has(cacheKey)) {
            return requestCache.get(cacheKey)!;
        }

        // Get ability and check permission
        const ability = await this.getAbility(ctx);
        let result: boolean;

        if (instance !== undefined && typeof instance === 'object' && instance !== null) {
            // ABAC check with subject instance
            // For CASL MongoAbility, we check with the subject type embedded
            const subjectWithType = { ...(instance as object), __caslSubjectType__: subject };
            result = ability.can(action, subjectWithType as AppSubjects);
        } else {
            result = ability.can(action, subject);
        }

        // Cache result for this request
        if (!this.resultCache.has(requestId)) {
            this.resultCache.set(requestId, new Map());
        }
        this.resultCache.get(requestId)!.set(cacheKey, result);

        // Audit logging
        const capabilityString = `${action}:${subject}`;
        if (!result) {
            await this.logDenied(capabilityString, 'Permission denied by CASL', ctx);
        } else if (this.isSensitive(action, subject)) {
            await this.logAllowed(capabilityString, ctx);
        }

        return result;
    }

    /**
     * Require a capability - throws if denied
     */
    async require(
        capabilityOrAction: string,
        subjectOrScope?: string | PermissionScope,
        subjectInstance?: unknown,
        explicitCtx?: PermissionContext
    ): Promise<void> {
        const allowed = await this.can(capabilityOrAction, subjectOrScope, subjectInstance, explicitCtx);
        if (!allowed) {
            const display = typeof subjectOrScope === 'string'
                ? `${capabilityOrAction} ${subjectOrScope}`
                : capabilityOrAction;
            throw new PermissionDeniedError(display);
        }
    }

    /**
     * Get permitted fields for a subject
     *
     * @returns Array of permitted field names, or undefined if all fields are permitted
     */
    async permittedFields(
        action: string,
        subject: string,
        explicitCtx?: PermissionContext
    ): Promise<string[] | undefined> {
        const ctx = explicitCtx ?? this.tryGetContext();

        // Ensure ability is loaded (populates cache)
        await this.getAbility(ctx);

        // Get cached rules
        const cached = this.abilityCache.get(ctx.requestId);
        if (!cached) return undefined;

        const matchingRules = cached.rules.filter(
            rule => (rule.action === action || rule.action === 'manage') &&
                (rule.subject === subject || rule.subject === 'all') &&
                !rule.inverted
        );

        // Collect all field restrictions
        const allFields: string[] = [];
        for (const rule of matchingRules) {
            if (rule.fields && rule.fields.length > 0) {
                allFields.push(...rule.fields);
            }
        }

        // If no field restrictions found, all fields are permitted
        return allFields.length > 0 ? [...new Set(allFields)] : undefined;
    }

    /**
     * Create ability for frontend hydration
     *
     * Returns the raw CASL ability for packaging/serialization
     */
    async getAbilityForUser(
        userId: string,
        organizationId: string,
        roleNames: string[],
        currentTeamId?: string
    ): Promise<AppAbility> {
        const userContext: AbilityUserContext = {
            id: userId,
            organizationId: organizationId,
            currentTeamId,
        };

        return createAppAbility(userContext, roleNames);
    }

    /**
     * Get rules for frontend hydration (for packRules)
     */
    async getRulesForUser(
        roleNames: string[],
        organizationId: string
    ): Promise<CaslRule[]> {
        return loadRulesFromDB(roleNames, organizationId);
    }

    /**
     * Check if action/subject is sensitive
     */
    private isSensitive(action: string, subject: string): boolean {
        // Check against sensitive patterns
        const sensitivePatterns = [
            { action: 'manage', subject: 'User' },
            { action: 'delete', subject: 'User' },
            { action: 'delete', subject: 'Organization' },
            { action: 'manage', subject: 'Plugin' },
        ];

        return sensitivePatterns.some(
            p => (p.action === action || action === 'manage') &&
                (p.subject === subject || subject === 'all')
        );
    }

    /**
     * Log denied permission check
     */
    private async logDenied(
        capability: string,
        reason: string,
        ctx: PermissionContext
    ): Promise<void> {
        await this.writeAuditLog({
            actorType: 'user',
            actorId: ctx.userId ?? 'anonymous',
            organizationId: ctx.organizationId ?? 'unknown',
            organizationId: ctx.organizationId ?? null,
            action: 'permission.check',
            resource: capability,
            result: 'deny',
            reason,
            metadata: {
                requestId: ctx.requestId,
                userRole: ctx.userRole,
            },
        });
    }

    /**
     * Log allowed sensitive operation
     */
    private async logAllowed(
        capability: string,
        ctx: PermissionContext
    ): Promise<void> {
        await this.writeAuditLog({
            actorType: 'user',
            actorId: ctx.userId ?? 'anonymous',
            organizationId: ctx.organizationId ?? 'unknown',
            organizationId: ctx.organizationId ?? null,
            action: 'permission.check',
            resource: capability,
            result: 'allow',
            metadata: {
                requestId: ctx.requestId,
                userRole: ctx.userRole,
            },
        });
    }

    /**
     * Write audit log entry (non-blocking)
     */
    private async writeAuditLog(
        entry: Omit<typeof auditLogs.$inferInsert, 'id' | 'createdAt'>
    ): Promise<void> {
        try {
            await db.insert(auditLogs).values(entry);
        } catch (error) {
            this.logger.error('Failed to write audit log:', error);
        }
    }

    /**
     * Clear request cache (called at end of request)
     */
    clearRequestCache(requestId: string): void {
        this.abilityCache.delete(requestId);
        this.resultCache.delete(requestId);
    }
}

/**
 * Permission denied error
 */
export class PermissionDeniedError extends Error {
    constructor(public readonly capability: string) {
        super(`Permission denied: ${capability}`);
        this.name = 'PermissionDeniedError';
    }
}
