import { AsyncLocalStorage } from 'node:async_hooks';

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
