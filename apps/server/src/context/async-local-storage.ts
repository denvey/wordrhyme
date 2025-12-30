import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request Context - Stored in AsyncLocalStorage
 *
 * Available throughout the request lifecycle.
 */
export interface RequestContext {
    requestId: string;
    tenantId?: string;
    organizationId?: string;
    userId?: string;
    userRole?: string;
    locale: string;
    currency: string;
    timezone: string;
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
