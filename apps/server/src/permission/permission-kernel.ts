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
import type { CaslRule } from '@wordrhyme/db';
import { getContext } from '../context/async-local-storage';
import { rawDb } from '../db';
import { auditLogs } from '@wordrhyme/db';
import { PermissionCache } from './permission-cache';

const DEBUG_PERMISSION = process.env['DEBUG_PERMISSION'] === 'true';

/**
 * 缓存配置
 */
const CACHE_CONFIG = {
    /** 最大缓存条目数（防止内存泄漏） */
    MAX_ENTRIES: 10000,
    /** 缓存条目过期时间（毫秒） */
    ENTRY_TTL_MS: 5 * 60 * 1000, // 5 分钟
    /** 清理检查间隔（毫秒） */
    CLEANUP_INTERVAL_MS: 60 * 1000, // 1 分钟
};

/**
 * 带时间戳的缓存条目
 */
interface CacheEntry<T> {
    value: T;
    createdAt: number;
}

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

    constructor(private readonly permissionCache?: PermissionCache) {
        // 启动定期清理任务
        this.startCleanupTimer();
    }

    /**
     * Per-request ability cache (带时间戳，防止内存泄漏)
     * Key: requestId, Value: { value: { ability, rules }, createdAt }
     */
    private abilityCache = new Map<string, CacheEntry<{ ability: AppAbility; rules: CaslRule[] }>>();

    /**
     * Per-request permission result cache (带时间戳)
     * Key: requestId, Value: { value: Map<cacheKey, result>, createdAt }
     */
    private resultCache = new Map<string, CacheEntry<Map<string, boolean>>>();

    /**
     * 清理定时器引用
     */
    private cleanupTimer?: NodeJS.Timeout;

    /**
     * 启动定期清理任务
     */
    private startCleanupTimer(): void {
        this.cleanupTimer = setInterval(() => {
            this.evictExpiredEntries();
        }, CACHE_CONFIG.CLEANUP_INTERVAL_MS);

        // 允许进程正常退出
        if (this.cleanupTimer.unref) {
            this.cleanupTimer.unref();
        }
    }

    /**
     * 清理过期条目
     */
    private evictExpiredEntries(): void {
        const now = Date.now();
        let evictedCount = 0;

        // 清理 abilityCache
        for (const [key, entry] of this.abilityCache) {
            if (now - entry.createdAt > CACHE_CONFIG.ENTRY_TTL_MS) {
                this.abilityCache.delete(key);
                evictedCount++;
            }
        }

        // 清理 resultCache
        for (const [key, entry] of this.resultCache) {
            if (now - entry.createdAt > CACHE_CONFIG.ENTRY_TTL_MS) {
                this.resultCache.delete(key);
                evictedCount++;
            }
        }

        if (DEBUG_PERMISSION && evictedCount > 0) {
            this.logger.debug(`Evicted ${evictedCount} expired cache entries`);
        }

        // 如果超过最大条目数，强制清理最旧的条目
        this.enforceMaxEntries();
    }

    /**
     * 强制限制最大条目数（LRU 简化版：删除最旧的）
     */
    private enforceMaxEntries(): void {
        if (this.abilityCache.size > CACHE_CONFIG.MAX_ENTRIES) {
            const excess = this.abilityCache.size - CACHE_CONFIG.MAX_ENTRIES;
            const keys = Array.from(this.abilityCache.keys()).slice(0, excess);
            keys.forEach(k => this.abilityCache.delete(k));
            if (DEBUG_PERMISSION) {
                this.logger.debug(`Evicted ${excess} entries due to max size limit`);
            }
        }

        if (this.resultCache.size > CACHE_CONFIG.MAX_ENTRIES) {
            const excess = this.resultCache.size - CACHE_CONFIG.MAX_ENTRIES;
            const keys = Array.from(this.resultCache.keys()).slice(0, excess);
            keys.forEach(k => this.resultCache.delete(k));
        }
    }

    /**
     * 构建缓存 key（安全处理循环引用）
     */
    private buildCacheKey(action: string, subject: string, instance?: unknown): string {
        if (!instance) {
            return `${action}:${subject}:no-instance`;
        }

        try {
            // 尝试序列化，但捕获循环引用错误
            return `${action}:${subject}:${JSON.stringify(instance)}`;
        } catch {
            // 循环引用或其他序列化错误，使用对象的部分属性
            if (typeof instance === 'object' && instance !== null) {
                const obj = instance as Record<string, unknown>;
                const id = obj['id'] ?? obj['_id'] ?? 'unknown';
                return `${action}:${subject}:id=${id}`;
            }
            return `${action}:${subject}:unserializable`;
        }
    }

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
            if (DEBUG_PERMISSION) {
                this.logger.debug(`L1 cache HIT: request=${requestId}`);
            }
            return this.abilityCache.get(requestId)!.value.ability;
        }
        if (DEBUG_PERMISSION) {
            this.logger.debug(`L1 cache MISS: request=${requestId}`);
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
        let rules: CaslRule[] = [];
        if (organizationId) {
            // Try L2 cache if available
            if (this.permissionCache) {
                const cachedRules = await this.permissionCache.get(organizationId, roleNames);
                if (cachedRules) {
                    if (DEBUG_PERMISSION) {
                        this.logger.debug(`L2 cache HIT: org=${organizationId}, roles=${roleNames.join(',')}`);
                    }
                    rules = cachedRules;
                } else {
                    if (DEBUG_PERMISSION) {
                        this.logger.debug(`L2 cache MISS: org=${organizationId}, roles=${roleNames.join(',')}`);
                    }
                    rules = await loadRulesFromDB(roleNames, organizationId);
                    // Cache is guaranteed to be defined here
                    await this.permissionCache!.set(organizationId, roleNames, rules);
                }
            } else {
                // No cache available, load directly from DB (backward compatibility)
                rules = await loadRulesFromDB(roleNames, organizationId);
            }
        }
        const ability = createAbilityFromRules(rules, userContext);

        // Cache for this request
        this.abilityCache.set(requestId, {
            value: { ability, rules },
            createdAt: Date.now(),
        });

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
        explicitCtx?: PermissionContext,
        skipAudit = false
    ): Promise<boolean> {
        const ctx = explicitCtx ?? this.tryGetContext();
        const { userId, organizationId, requestId } = ctx;

        // No user = no access
        if (!userId) {
            if (!skipAudit) {
                await this.logDenied(capabilityOrAction, 'No userId in context', ctx);
            }
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
                if (!skipAudit) {
                    await this.logDenied(capabilityOrAction, 'Cross-tenant access denied', ctx);
                }
                return false;
            }
        }

        // Check result cache
        const cacheKey = this.buildCacheKey(action, subject, instance);
        const requestCacheEntry = this.resultCache.get(requestId);
        if (requestCacheEntry?.value.has(cacheKey)) {
            return requestCacheEntry.value.get(cacheKey)!;
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
            this.resultCache.set(requestId, {
                value: new Map(),
                createdAt: Date.now(),
            });
        }
        this.resultCache.get(requestId)!.value.set(cacheKey, result);

        // Audit logging
        const capabilityString = `${action}:${subject}`;
        if (!skipAudit) {
            if (!result) {
                await this.logDenied(capabilityString, 'Permission denied by CASL', ctx);
            } else if (this.isSensitive(action, subject)) {
                await this.logAllowed(capabilityString, ctx);
            }
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

        // ✅ Bug Fix: Access rules via cached.value.rules instead of cached.rules
        // ✅ Enhancement: Support action inheritance (manage includes all actions)
        const matchingRules = cached.value.rules.filter(
            rule => (rule.action === action || rule.action === 'manage') &&
                   (rule.subject === subject || rule.subject === 'all') &&
                   !rule.inverted
        );

        // If no matching rules found, return empty array (deny all fields)
        if (matchingRules.length === 0) return [];

        // Collect all field restrictions
        const allFields: string[] = [];

        for (const rule of matchingRules) {
            // ✅ Enhancement: If any rule allows all fields, then all fields are permitted
            if (!rule.fields || rule.fields.length === 0) {
                return undefined;
            }
            allFields.push(...rule.fields);
        }

        return [...new Set(allFields)];
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
            await rawDb.insert(auditLogs).values(entry);
        } catch (error) {
            this.logger.error('Failed to write audit log:', error);
        }
    }

    /**
     * Get cached CASL rules for a specific request
     *
     * @param requestId - The request ID to look up
     * @returns The cached rules array, or undefined if not cached
     *
     * @description
     * This method provides controlled access to cached rules for use by
     * other modules (like ScopedDb) that need to inspect rules for
     * SQL optimization or debugging purposes.
     *
     * Note: This should only be called AFTER getAbility() has been called
     * for the same request, otherwise will return undefined.
     */
    getCachedRulesForRequest(requestId: string): CaslRule[] | undefined {
        const cached = this.abilityCache.get(requestId);
        return cached?.value.rules;
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
