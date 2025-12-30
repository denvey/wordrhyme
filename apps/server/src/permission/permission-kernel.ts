import { Injectable, Logger } from '@nestjs/common';
import {
    PermissionScope,
    isValidCapabilityFormat,
    ROLE_PERMISSIONS,
    SENSITIVE_CAPABILITIES,
} from './permission.types';
import { getContext } from '../context/async-local-storage';
import { db } from '../db';
import { auditLogs } from '../db/schema/audit-logs';

/**
 * PermissionKernel - Centralized permission evaluation
 * 
 * Implements white-list authorization model per PERMISSION_GOVERNANCE.md:
 * - Deny by default
 * - Centralized evaluation (plugins cannot self-authorize)
 * - Tenant-scoped permissions
 * - Per-request caching
 * - Audit logging for denied access and sensitive operations
 */
@Injectable()
export class PermissionKernel {
    private readonly logger = new Logger(PermissionKernel.name);

    /**
     * Per-request permission cache
     * Key: requestId, Value: Map<cacheKey, result>
     */
    private cache = new Map<string, Map<string, boolean>>();

    /**
     * Check if current user has the specified capability
     * 
     * @param capability - Capability in format `resource:action:scope`
     * @param scope - Optional scope constraints
     * @returns true if allowed, false if denied
     */
    async can(capability: string, scope?: PermissionScope): Promise<boolean> {
        const ctx = getContext();
        const { userId, tenantId, userRole, requestId } = ctx;

        // No user = no access
        if (!userId) {
            await this.logDenied(capability, 'No userId in context', ctx);
            return false;
        }

        // Validate capability format
        if (!isValidCapabilityFormat(capability)) {
            this.logger.warn(`Invalid capability format: ${capability}`);
            await this.logDenied(capability, 'Invalid capability format', ctx);
            return false;
        }

        // Tenant boundary check
        if (scope?.tenantId && scope.tenantId !== tenantId) {
            await this.logDenied(capability, 'Cross-tenant access denied', ctx);
            return false;
        }

        // Check request cache
        const cacheKey = `${userId}:${capability}:${tenantId ?? 'global'}`;
        const requestCache = this.cache.get(requestId);
        if (requestCache?.has(cacheKey)) {
            return requestCache.get(cacheKey)!;
        }

        // Evaluate permission
        const rolePerms = ROLE_PERMISSIONS[userRole ?? 'viewer'] ?? [];
        const result = this.matchCapability(capability, rolePerms);

        // Cache result for this request
        if (!this.cache.has(requestId)) {
            this.cache.set(requestId, new Map());
        }
        this.cache.get(requestId)!.set(cacheKey, result);

        // Audit logging for denied or sensitive operations
        if (!result) {
            await this.logDenied(capability, `Missing capability in role: ${userRole ?? 'unknown'}`, ctx);
        } else if (this.isSensitive(capability)) {
            await this.logAllowed(capability, ctx);
        }

        return result;
    }

    /**
     * Require a capability - throws if denied
     */
    async require(capability: string, scope?: PermissionScope): Promise<void> {
        const allowed = await this.can(capability, scope);
        if (!allowed) {
            throw new PermissionDeniedError(capability);
        }
    }

    /**
     * Match a required capability against available permissions
     * Supports wildcards: `content:*:*` matches `content:create:space`
     */
    private matchCapability(required: string, available: string[]): boolean {
        for (const cap of available) {
            if (cap === required) return true;

            // Wildcard matching
            const capParts = cap.split(':');
            const reqParts = required.split(':');

            if (capParts.length !== reqParts.length) continue;

            const matches = capParts.every((part, index) =>
                part === '*' || part === reqParts[index]
            );

            if (matches) return true;
        }
        return false;
    }

    /**
     * Check if capability is sensitive (requires logging even on success)
     */
    private isSensitive(capability: string): boolean {
        return SENSITIVE_CAPABILITIES.some(pattern =>
            this.matchCapability(capability, [pattern])
        );
    }

    /**
     * Log denied permission check
     */
    private async logDenied(
        capability: string,
        reason: string,
        ctx: ReturnType<typeof getContext>
    ): Promise<void> {
        await this.writeAuditLog({
            actorType: 'user',
            actorId: ctx.userId ?? 'anonymous',
            tenantId: ctx.tenantId ?? 'unknown',
            organizationId: ctx.tenantId ?? null,
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
        ctx: ReturnType<typeof getContext>
    ): Promise<void> {
        await this.writeAuditLog({
            actorType: 'user',
            actorId: ctx.userId ?? 'anonymous',
            tenantId: ctx.tenantId ?? 'unknown',
            organizationId: ctx.tenantId ?? null,
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
            // Audit log failure should not block business logic
            this.logger.error('Failed to write audit log:', error);
        }
    }

    /**
     * Clear request cache (called at end of request)
     */
    clearRequestCache(requestId: string): void {
        this.cache.delete(requestId);
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
