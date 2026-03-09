import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';
import { PermissionKernel, PermissionDeniedError } from '../permission';
import {
    runWithAuditContext,
    createAuditContextData,
    type AuditMeta,
} from '../audit/audit-context';
import { scheduleAuditFlush } from '../audit/audit-flush';
import { requestContextStorage } from '../context/async-local-storage';
import {
    enforceInfraPolicy,
    getModuleFromPath,
    getMode,
    getProcedureNameFromPath,
    BYPASS_PROCEDURES,
    resolveEffectiveOrg,
    WRITE_ACTIONS,
} from './infra-policy-guard';
import {
    resolvePermissionForPath,
    getRbacDefaultPolicy,
} from './permission-registry';
import {
    resolveBillingSubject,
    getDefaultPolicy as getBillingDefaultPolicy,
    isBillingGuardReady,
} from '../billing/billing-guard';
import { resolvePluginId } from './router';
import { getBillingContext } from '../billing/billing-context';
import { EntitlementDeniedError } from '../billing/services/entitlement.service';
import { db } from '../db';
import { auditLogs } from '../db/schema/audit-logs';

/**
 * tRPC Meta type for audit
 *
 * Usage:
 * ```ts
 * protectedProcedure
 *   .meta({ audit: { action: 'MENU_UPDATE', level: 'FULL' } })
 *   .mutation(...)
 * ```
 */
export type { AuditMeta };

/**
 * Initialize tRPC with context and meta type
 */
const t = initTRPC
    .context<Context>()
    .meta<AuditMeta>()
    .create();

export const router = t.router;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;

// ============================================================
// Global Audit Middleware (In-Memory Buffer + Flush Pattern)
// ============================================================

/**
 * Global audit middleware - automatically wraps all procedures
 *
 * This middleware implements "In-Memory Buffer + Flush" pattern:
 * 1. Creates an AuditContext with empty pendingLogs buffer
 * 2. Runs the procedure (DB operations add to buffer, zero IO)
 * 3. On SUCCESS: flush buffer to database (fire-and-forget)
 * 4. On ERROR: buffer is discarded (no ghost logs)
 *
 * Benefits:
 * - Zero IO during DB operations
 * - No ghost logs (failed requests don't create audit)
 * - Batch write at request end
 *
 * IMPORTANT: Also ensures AsyncLocalStorage context is preserved
 */
const globalAuditMiddleware = middleware(async ({ meta, next, ctx }) => {
    // Create audit context data with empty pending logs buffer
    const auditContextData = createAuditContextData(
        meta,
        ctx.userId,
        (ctx as { ip?: string }).ip,
        ctx.organizationId
    );

    // ✅ Ensure AsyncLocalStorage context is preserved for the entire procedure execution
    // This is critical for HookRegistry and other services that rely on getContext()
    const requestContext = requestContextStorage.getStore();
    if (!requestContext) {
        console.warn('[tRPC] No AsyncLocalStorage context found, creating from ctx');
    }

    const contextToUse = {
        ...(requestContext ?? {}),
        requestId: ctx.requestId,
        organizationId: ctx.organizationId ?? requestContext?.organizationId,
        userId: ctx.userId ?? requestContext?.userId,
        userRole: ctx.userRole ?? requestContext?.userRole,
        userRoles: (ctx as { userRoles?: string[] }).userRoles ?? requestContext?.userRoles,
        currentTeamId: (ctx as { currentTeamId?: string }).currentTeamId ?? requestContext?.currentTeamId,
        locale: requestContext?.locale ?? 'en-US',
        currency: requestContext?.currency ?? 'USD',
        timezone: requestContext?.timezone ?? 'UTC',
    };

    // Run the procedure within both audit context AND AsyncLocalStorage context
    return runWithAuditContext(auditContextData, async () => {
        // Wrap in requestContextStorage.run() to ensure context propagates through async calls
        return requestContextStorage.run(contextToUse, async () => {
            const result = await next({ ctx });

            // Only flush audit logs if the procedure succeeded
            // On error, pendingLogs are automatically discarded
            if (result.ok) {
                // Fire-and-forget: schedule flush without blocking response
                scheduleAuditFlush();
            }

            return result;
        });
    });
});

/**
 * Global Infra Policy Middleware (v2: Path-Driven Context Swap)
 *
 * 1. Extracts module from request path (Core: first segment, Plugin: pluginId)
 * 2. Bypasses meta-operations (switchToCustom, resetToPlatform)
 * 3. Reads policy mode from in-memory cache (no I/O)
 * 4. WRITE guard: blocks mutations when policy disallows
 * 5. READ Context Swap: replaces organizationId with effective org
 *
 * Skips if: no module in path, no policy configured, platform user, or meta-operation.
 * WRITE operations always use original organizationId (never swapped).
 */
const globalInfraPolicyMiddleware = middleware(async ({ meta, ctx, next, path }) => {
    const orgId = ctx.organizationId;
    if (!orgId || orgId === 'platform') return next({ ctx });

    const module = getModuleFromPath(path);
    if (!module) return next({ ctx });

    // Meta-operation bypass: switchToCustom/resetToPlatform modify policy state itself
    const procedureName = getProcedureNameFromPath(path);
    if (BYPASS_PROCEDURES.has(procedureName)) return next({ ctx });

    const mode = getMode(module);
    if (mode === 'require_tenant') return next({ ctx });

    const action = meta?.permission?.action;

    // 1. WRITE guard
    await enforceInfraPolicy(module, orgId, action);

    // 2. READ Context Swap
    const isWrite = action && WRITE_ACTIONS.has(action);
    if (!isWrite) {
        const effectiveOrg = await resolveEffectiveOrg(module, orgId);
        if (effectiveOrg !== orgId) {
            const store = requestContextStorage.getStore();
            if (store) {
                store.originalOrganizationId = orgId;
                store.organizationId = effectiveOrg;
            }

            return next({
                ctx: {
                    ...ctx,
                    organizationId: effectiveOrg,
                    originalOrganizationId: orgId,
                },
            });
        }
    }

    return next({ ctx });
});

// ============================================================
// Global Billing Middleware (Plugin API Entitlement Check)
// ============================================================

/**
 * Global Billing Middleware
 *
 * Only applies to plugin API routes (pluginApis.{pluginId}.{procedure}).
 * Core routes are not affected — Core billing is handled via direct
 * EntitlementService calls in Core services (Task 5.7).
 *
 * Four-layer resolution:
 *   L4: Admin Override (Settings)
 *   L3: Manifest declaration (capabilities.billing.procedures)
 *   L2: Module Default (Settings)
 *   Default Policy: allow/deny/audit
 *
 * After resolving subject:
 *   L1: Capability must be approved
 *   EntitlementService: boolean → requireAccess / metered → requireAndConsume
 */
const globalBillingMiddleware = middleware(async ({ ctx, next, path }) => {
    // Skip if billing guard not initialized yet (during startup)
    if (!isBillingGuardReady()) return next({ ctx });

    // Only intercept plugin API routes
    const pluginMatch = path.match(/^pluginApis\.([^.]+)\.(.+)$/);
    if (!pluginMatch) return next({ ctx });

    const normalizedPluginId = pluginMatch[1]!;
    // Use full procedure path for lookups (handles nested routers correctly)
    // e.g., "pluginApis.hello-world.admin.users.list" → fullProcedurePath = "admin.users.list"
    const fullProcedurePath = pluginMatch[2]!;

    // Resolve original pluginId for manifest lookup
    const originalPluginId = resolvePluginId(normalizedPluginId);
    if (!originalPluginId) return next({ ctx });

    // Four-layer resolution: try full path first, then last segment as fallback
    let resolution = resolveBillingSubject(
        normalizedPluginId,
        originalPluginId,
        fullProcedurePath,
    );
    // Fallback: if full path didn't resolve a subject, try last segment
    if (!resolution.free && !resolution.subject && resolution.source === 'default') {
        const lastSegment = fullProcedurePath.includes('.')
            ? fullProcedurePath.substring(fullProcedurePath.lastIndexOf('.') + 1)
            : null;
        if (lastSegment && lastSegment !== fullProcedurePath) {
            const fallback = resolveBillingSubject(
                normalizedPluginId,
                originalPluginId,
                lastSegment,
            );
            if (fallback.free || fallback.subject) {
                resolution = fallback;
            }
        }
    }

    // "free" at any layer → bypass all billing
    if (resolution.free) return next({ ctx });

    // Subject resolved → enforce entitlement
    if (resolution.subject) {
        const orgId = ctx.organizationId;
        const userId = ctx.userId;

        // No org context → cannot check entitlement, skip
        if (!orgId) return next({ ctx });

        try {
            const { entitlementService } = getBillingContext();

            try {
                await entitlementService.requireAndConsumeProcedure(
                    orgId,
                    userId ?? 'system',
                    path,
                );
                return next({ ctx });
            } catch (error) {
                if (!(error instanceof EntitlementDeniedError)) {
                    throw error;
                }
            }

            // L1: EntitlementService validates capability is approved + checks quota
            // boolean → requireAccess (existence check only)
            // metered → requireAndConsume (check + waterfall deduction)
            await entitlementService.requireAndConsume(
                orgId,
                userId ?? 'system',
                resolution.subject,
            );
        } catch (error) {
            if (error instanceof EntitlementDeniedError) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: `[Billing] ${error.message}`,
                    cause: error,
                });
            }
            throw error;
        }

        return next({ ctx });
    }

    // No subject resolved → apply default policy
    const policy = getBillingDefaultPolicy();
    if (policy === 'allow') return next({ ctx });

    if (policy === 'audit') {
        console.warn(
            `[Billing:audit] Undeclared billing for pluginApis.${normalizedPluginId}.${fullProcedurePath}` +
            ` (orgId=${ctx.organizationId})`
        );
        // Fire-and-forget audit log
        const orgId = ctx.organizationId;
        if (orgId) {
            db.insert(auditLogs).values({
                actorType: 'system',
                actorId: 'billing-guard',
                organizationId: orgId,
                action: 'billing.undeclared.audit',
                resource: `pluginApis.${normalizedPluginId}.${fullProcedurePath}`,
                result: 'allow',
                reason: 'Default policy: audit',
                metadata: {
                    pluginId: originalPluginId,
                    procedureName: fullProcedurePath,
                    source: 'billing-guard',
                },
            }).catch((err: unknown) => {
                console.error('[Billing:audit] Failed to write audit log:', err);
            });
        }
        return next({ ctx });
    }

    // policy === 'deny'
    throw new TRPCError({
        code: 'FORBIDDEN',
        message: `[Billing] No billing subject configured for ${normalizedPluginId}.${fullProcedurePath}. Configure via Admin UI.`,
    });
});

/**
 * Base procedure with audit + infra policy support
 * All procedures inherit from this to get automatic audit context and infra policy enforcement.
 */
const procedureBase = t.procedure
    .use(globalAuditMiddleware)
    .use(globalInfraPolicyMiddleware);

/**
 * Public procedure - no authentication required, but with audit + infra policy support
 */
export const publicProcedure = procedureBase;

/**
 * Permission Kernel instance for middleware
 */
const permissionKernel = new PermissionKernel();

/**
 * Middleware to require a specific permission
 *
 * Usage:
 * ```ts
 * router({
 *   sensitiveAction: protectedProcedure
 *     .use(requirePermission('core:users:manage'))
 *     .mutation(async ({ ctx }) => { ... })
 * })
 * ```
 */
export const requirePermission = (capability: string) => {
    return middleware(async ({ ctx, next }) => {
        try {
            // Pass tRPC context directly to PermissionKernel
            // This avoids relying on AsyncLocalStorage which may not be set
            // Include userRoles for CASL permission checks
            // Note: explicitCtx is the 4th parameter (capability, subjectOrScope, subjectInstance, explicitCtx)
            await permissionKernel.require(capability, undefined, undefined, {
                requestId: ctx.requestId,
                userId: ctx.userId,
                organizationId: ctx.organizationId,
                userRole: ctx.userRole,
                userRoles: (ctx as { userRoles?: string[] }).userRoles,
                currentTeamId: (ctx as { currentTeamId?: string }).currentTeamId,
            });
            return next({ ctx });
        } catch (error) {
            if (error instanceof PermissionDeniedError) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: `Permission denied: ${capability}`,
                    cause: error,
                });
            }
            throw error;
        }
    });
};

/**
 * Protected procedure - requires authentication, with audit support
 * Throws UNAUTHORIZED if no userId in context
 */
export const protectedProcedure = procedureBase.use(
    middleware(async ({ ctx, next }) => {
        if (!ctx.userId) {
            throw new TRPCError({
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
            });
        }
        return next({ ctx });
    })
).use(
    /**
     * Global Permission Middleware (v2: Registry-Aware)
     *
     * Resolution priority:
     * 1. Admin override (rbac.override.{path}) — highest
     * 2. meta.permission (developer declared in code)
     * 3. PermissionRegistry lookup (startup scan) — explicit/auto-crud
     * 4. Default Policy (audit/deny/allow) — fallback for pending procedures
     *
     * Writes resolved permissionMeta into AsyncLocalStorage for ScopedDb ABAC injection.
     */
    middleware(async ({ meta, ctx, next, path }) => {
        let permissionToEnforce: { action: string; subject: string } | undefined;

        // Resolve from registry (includes admin overrides as Priority 1)
        const resolved = path ? resolvePermissionForPath(path) : null;

        if (resolved?.source === 'admin') {
            // Priority 1: Admin override — overrides developer meta.permission
            permissionToEnforce = { action: resolved.action, subject: resolved.subject };
        } else if (meta?.permission) {
            // Priority 2: Developer declared meta.permission
            permissionToEnforce = meta.permission as { action: string; subject: string };
        } else if (resolved) {
            if (resolved.source === 'pending') {
                // Priority 4: Default Policy for pending procedures
                const policy = getRbacDefaultPolicy();
                if (policy === 'allow') {
                    return next({ ctx });
                }
                if (policy === 'audit') {
                    console.warn(
                        `[RBAC:audit] Pending permission on '${path}': ` +
                        `action='${resolved.action}', subject='${resolved.subject}'`
                    );
                    return next({ ctx });
                }
                // policy === 'deny' → block unconfigured procedure
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: `[RBAC] Permission not configured for '${path}'. Configure via Admin UI.`,
                });
            }
            // Priority 3: Registry entry (explicit or auto-crud)
            permissionToEnforce = { action: resolved.action, subject: resolved.subject };
        }

        if (!permissionToEnforce) {
            return next({ ctx });
        }

        const { action, subject } = permissionToEnforce;

        try {
            await permissionKernel.require(action, subject, undefined, {
                requestId: ctx.requestId,
                userId: ctx.userId,
                organizationId: ctx.organizationId,
                userRole: ctx.userRole,
                userRoles: (ctx as { userRoles?: string[] }).userRoles,
                currentTeamId: (ctx as { currentTeamId?: string }).currentTeamId,
            });
        } catch (error) {
            if (error instanceof PermissionDeniedError) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: `[RBAC] Permission denied: user role does not have '${action}' permission on '${subject}'`,
                    cause: error,
                });
            }
            throw error;
        }

        // Bridge permissionMeta into AsyncLocalStorage for ScopedDb ABAC injection
        const currentContext = requestContextStorage.getStore();
        if (currentContext) {
            (currentContext as any).permissionMeta = permissionToEnforce;
        } else {
            console.warn('[tRPC Permission] No AsyncLocalStorage context, cannot store permissionMeta');
        }

        return next({ ctx });
    })
).use(
    /**
     * Global Billing Middleware (Plugin API Entitlement Check)
     *
     * Runs AFTER auth + RBAC per spec: Permission Check → Usage Validation → Consume → Execute.
     * Only applies to plugin API routes (pluginApis.{pluginId}.{procedure}).
     */
    globalBillingMiddleware
);
