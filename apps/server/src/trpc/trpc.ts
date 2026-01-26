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
 * Base procedure with audit support
 * All procedures inherit from this to get automatic audit context
 */
const procedureWithAudit = t.procedure.use(globalAuditMiddleware);

/**
 * Public procedure - no authentication required, but with audit support
 */
export const publicProcedure = procedureWithAudit;

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
export const protectedProcedure = procedureWithAudit.use(
    middleware(async ({ ctx, next }) => {
        if (!ctx.userId) {
            throw new TRPCError({
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
            });
        }
        return next({ ctx });
    })
);
