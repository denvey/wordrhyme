/**
 * Hooks tRPC Router
 *
 * Unified API for Hook system monitoring and management.
 * Data scope is automatically controlled by HookRegistry via AsyncLocalStorage:
 * - Platform organization (organizationId = 'platform'): See all hooks across all organizations
 * - Tenant organization: See only hooks for current organization
 *
 * SECURITY: HookRegistry automatically retrieves organization context from AsyncLocalStorage.
 * No manual context passing needed - prevents human error completely.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, requirePermission } from '../trpc';
import type { HookRegistry } from '../../hooks/hook-registry';
import type { RuntimeHookHandler } from '../../hooks/hook.types';
import { requestContextStorage } from '../../context/async-local-storage';

/**
 * Input schemas
 */
const hookIdInput = z.object({
    hookId: z.string().min(1),
});

const handlerIdInput = z.object({
    handlerId: z.string().min(1),
});

// Singleton instance (will be set by module)
let hookRegistry: HookRegistry;

export function setHookRegistry(registry: HookRegistry) {
    hookRegistry = registry;
}

/**
 * Serialize handler for API response (omit function)
 * Automatically includes organizationId for platform view only
 */
function serializeHandler(handler: RuntimeHookHandler) {
    const ctx = requestContextStorage.getStore();
    const isPlatform = ctx?.organizationId === 'platform';

    const base = {
        id: handler.id,
        hookId: handler.hookId,
        pluginId: handler.pluginId,
        functionName: handler.functionName,
        priority: handler.priority,
        timeout: handler.timeout,
        enabled: handler.enabled,
        stats: {
            callCount: handler.stats.callCount,
            errorCount: handler.stats.errorCount,
            avgDuration: handler.stats.avgDuration,
            lastRunAt: handler.stats.lastRunAt?.toISOString() ?? null,
        },
        circuitBreaker: {
            state: handler.circuitBreaker.state,
            threshold: handler.circuitBreaker.threshold,
            cooldownMs: handler.circuitBreaker.cooldownMs,
            trippedAt: handler.circuitBreaker.trippedAt?.toISOString() ?? null,
        },
    };

    // Include organizationId for platform view only
    if (isPlatform) {
        return {
            ...base,
            organizationId: handler.organizationId ?? null,
        };
    }

    return base;
}

/**
 * Hooks Router
 *
 * All methods automatically use AsyncLocalStorage for organization context.
 * No manual context passing needed.
 */
export const hooksRouter = router({
    /**
     * List all defined hooks
     * Scope: Automatically controlled by HookRegistry via AsyncLocalStorage
     */
    list: protectedProcedure
        .use(requirePermission('hooks:read'))
        .query(async () => {
            const hooks = hookRegistry.getAllHooks();

            return hooks.map(hook => ({
                id: hook.id,
                type: hook.type,
                description: hook.description,
                defaultTimeout: hook.defaultTimeout,
                // HookRegistry automatically filters by organization context
                handlerCount: hookRegistry.getHandlers(hook.id).length,
            }));
        }),

    /**
     * Get handlers for a specific hook
     * Scope: Automatically controlled by HookRegistry via AsyncLocalStorage
     */
    getHandlers: protectedProcedure
        .input(hookIdInput)
        .use(requirePermission('hooks:read'))
        .query(async ({ input }) => {
            const definition = hookRegistry.getDefinition(input.hookId);

            if (!definition) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: `Hook '${input.hookId}' not found`,
                });
            }

            // HookRegistry automatically filters by organization context
            const handlers = hookRegistry.getHandlers(input.hookId);

            return {
                hook: {
                    id: definition.id,
                    type: definition.type,
                    description: definition.description,
                    defaultTimeout: definition.defaultTimeout,
                },
                // serializeHandler automatically detects platform view
                handlers: handlers.map(serializeHandler),
            };
        }),

    /**
     * Get hook system statistics
     * Scope: Automatically controlled by HookRegistry via AsyncLocalStorage
     */
    stats: protectedProcedure
        .use(requirePermission('hooks:read'))
        .query(async () => {
            const hooks = hookRegistry.getAllHooks();
            // HookRegistry automatically filters by organization context
            const totalHandlers = hookRegistry.getTotalHandlerCount();

            // Count hooks by type
            const actionHooks = hooks.filter(h => h.type === 'action').length;
            const filterHooks = hooks.filter(h => h.type === 'filter').length;

            // Count handlers by circuit breaker state
            let closedCount = 0;
            let openCount = 0;
            let halfOpenCount = 0;

            for (const hook of hooks) {
                // HookRegistry automatically filters by organization context
                for (const handler of hookRegistry.getHandlers(hook.id)) {
                    switch (handler.circuitBreaker.state) {
                        case 'closed':
                            closedCount++;
                            break;
                        case 'open':
                            openCount++;
                            break;
                        case 'half-open':
                            halfOpenCount++;
                            break;
                    }
                }
            }

            // Get hooks with most handlers
            const hooksByHandlerCount = hooks
                .map(h => ({
                    id: h.id,
                    // HookRegistry automatically filters by organization context
                    handlerCount: hookRegistry.getHandlers(h.id).length,
                }))
                .filter(h => h.handlerCount > 0)
                .sort((a, b) => b.handlerCount - a.handlerCount)
                .slice(0, 10);

            return {
                totalHooks: hooks.length,
                actionHooks,
                filterHooks,
                totalHandlers,
                circuitBreakerStats: {
                    closed: closedCount,
                    open: openCount,
                    halfOpen: halfOpenCount,
                },
                topHooksByHandlers: hooksByHandlerCount,
            };
        }),

    /**
     * Reset circuit breaker for a handler
     * Permission: Requires manage permission
     * Scope: Automatically controlled by HookRegistry via AsyncLocalStorage
     */
    resetCircuitBreaker: protectedProcedure
        .input(handlerIdInput)
        .use(requirePermission('hooks:manage'))
        .mutation(async ({ input }) => {
            // HookRegistry automatically checks organization access
            const handler = hookRegistry.getHandler(input.handlerId);

            if (!handler) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: `Handler '${input.handlerId}' not found or access denied`,
                });
            }

            // Reset circuit breaker
            handler.circuitBreaker.state = 'closed';
            delete handler.circuitBreaker.trippedAt;
            handler.stats.errorCount = 0;

            return {
                success: true,
                // serializeHandler automatically detects platform view
                handler: serializeHandler(handler),
            };
        }),

    /**
     * Get a specific handler by ID
     * Scope: Automatically controlled by HookRegistry via AsyncLocalStorage
     */
    getHandler: protectedProcedure
        .input(handlerIdInput)
        .use(requirePermission('hooks:read'))
        .query(async ({ input }) => {
            // HookRegistry automatically checks organization access
            const handler = hookRegistry.getHandler(input.handlerId);

            if (!handler) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: `Handler '${input.handlerId}' not found or access denied`,
                });
            }

            // serializeHandler automatically detects platform view
            return serializeHandler(handler);
        }),
});
