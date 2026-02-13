import { AsyncLocalStorage } from 'node:async_hooks';
import {
    runWithAuditContext,
    createAuditContextData,
} from '../audit/audit-context.js';
import { scheduleAuditFlush } from '../audit/audit-flush.js';

/**
 * Actor Type for audit logging
 */
export type ActorType = 'user' | 'system' | 'plugin' | 'api-token';

/**
 * Request Context - Stored in AsyncLocalStorage
 *
 * Available throughout the request lifecycle.
 */
export interface RequestContext {
    requestId: string;
    organizationId?: string;
    userId?: string;
    userRole?: string;
    /** Array of all role names assigned to the user (org + team levels) */
    userRoles?: string[];
    /** Current team ID for team-level context switching */
    currentTeamId?: string;
    /** Array of all team IDs the user belongs to (for LBAC) */
    teamIds?: string[];
    locale: string;
    currency: string;
    timezone: string;

    // Audit-related fields
    /** Client IP address */
    ip?: string | undefined;
    /** User agent string */
    userAgent?: string | undefined;
    /** Distributed trace ID (from traceparent header or generated) */
    traceId?: string | undefined;
    /** Span ID for distributed tracing */
    spanId?: string | undefined;
    /** Parent span ID for trace hierarchy */
    parentSpanId?: string | undefined;
    /** Session ID for tracking user sessions */
    sessionId?: string | undefined;
    /** Actor type for audit logging */
    actorType?: ActorType | undefined;
    /** API token ID if authenticated via API token */
    apiTokenId?: string | undefined;

    // Permission-related fields (set by globalPermissionMiddleware)
    /** Permission metadata for current request (action + subject from tRPC meta) */
    permissionMeta?: { action: string; subject: string } | undefined;
    /** Whether this is a system context (bypasses security filters) */
    isSystemContext?: boolean | undefined;
}

/**
 * AsyncLocalStorage instance for request context
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get current request context
 *
 * @throws Error if called outside of request scope
 */
export function getContext(): RequestContext {
    const ctx = requestContextStorage.getStore();
    if (!ctx) {
        throw new Error('Request context not available. Are you calling this outside of a request?');
    }
    return ctx;
}

/**
 * Run code with a specific context
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
    return requestContextStorage.run(context, fn);
}

/**
 * Create default context (for development/testing)
 */
export function createDefaultContext(overrides?: Partial<RequestContext>): RequestContext {
    return {
        requestId: crypto.randomUUID(),
        locale: 'en-US',
        currency: 'USD',
        timezone: 'UTC',
        ...overrides,
    };
}

/**
 * Create system context for trusted operations (startup, migrations, seeds, etc.)
 *
 * System context bypasses tenant isolation and LBAC filters
 * but preserves Layer 1 audit logging through ScopedDb.
 */
export function createSystemContext(overrides?: Partial<RequestContext>): RequestContext {
    return createDefaultContext({
        actorType: 'system',
        isSystemContext: true,
        ...overrides,
    });
}

/**
 * Run a function as system context with coupled audit ALS.
 *
 * Sets up both RequestContext ALS (isSystemContext=true) and
 * AuditContext ALS (for Layer 1 audit collection), then
 * auto-flushes pending audit logs in finally block.
 *
 * Use this for trusted operations outside request lifecycle:
 * - Server startup (onModuleInit)
 * - better-auth callbacks
 * - Migrations, seeds, plugin loading
 *
 * @param reason - Label for audit trail (e.g., 'plugin-scan', 'auth-callback')
 * @param fn - Async function to execute under system context
 *
 * @example
 * ```typescript
 * await runAsSystem('plugin-scan', async () => {
 *   await pluginManager.scanAndLoadPlugins();
 * });
 * ```
 */
export async function runAsSystem<T>(
    reason: string,
    fn: () => Promise<T>,
): Promise<T> {
    const ctx = createSystemContext({ requestId: `system:${reason}:${crypto.randomUUID()}` });
    const auditData = createAuditContextData(
        undefined, // no tRPC meta
        'system',  // actorId
        undefined, // no client IP
        undefined, // no organizationId (system-wide)
    );

    return runWithContext(ctx, () =>
        runWithAuditContext(auditData, async () => {
            try {
                return await fn();
            } finally {
                // Auto-flush audit logs collected during system operation
                scheduleAuditFlush();
            }
        }),
    );
}
