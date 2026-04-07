/**
 * Hook Capability Provider
 *
 * Creates PluginHookCapability instances for plugins.
 * Bridges the plugin SDK types with the core Hook system.
 *
 * Supports:
 * - addAction/addFilter: Register handlers for Core-defined hooks
 * - emit: Trigger action hooks (per EVENT_HOOK_GOVERNANCE §7.1 Core-Mediated Events)
 * - listHooks: Discover available hooks
 */

import { HookRegistry } from '../../hooks/hook-registry';
import { HookExecutor } from '../../hooks/hook-executor';
import { HookPriority, RuntimeHookHandler, HookContext } from '../../hooks/hook.types';
import type { PluginHookCapability, HookHandlerOptions, PluginContext } from '@wordrhyme/plugin';

/**
 * Create hook capability for a plugin
 *
 * @param pluginId - The plugin ID
 * @param organizationId - The organization ID (undefined for system-level)
 * @param registry - The HookRegistry instance
 * @param executor - The HookExecutor instance (for emit)
 * @param trpcCallerFactory - Optional factory for auto-mapping emit to tRPC procedures
 * @returns PluginHookCapability instance
 */
export function createHookCapability(
  pluginId: string,
  organizationId: string | undefined,
  registry: HookRegistry,
  executor?: HookExecutor,
  trpcCallerFactory?: (hookId: string, data: unknown) => Promise<unknown>,
): PluginHookCapability {
  const registeredHandlers: string[] = [];
  const adaptHandler = (handler: unknown) =>
    handler as unknown as (data: unknown, ctx: HookContext) => Promise<unknown> | unknown;

  function registerHandler(hookId: string, handler: unknown, options?: HookHandlerOptions): () => void {
    const runtimeHandler = createRuntimeHandler(
      pluginId,
      organizationId,
      hookId,
      adaptHandler(handler),
      options
    );

    registry.registerHandler(runtimeHandler);
    registeredHandlers.push(runtimeHandler.id);

    return () => {
      registry.unregisterHandler(runtimeHandler.id);
      const idx = registeredHandlers.indexOf(runtimeHandler.id);
      if (idx >= 0) registeredHandlers.splice(idx, 1);
    };
  }

  function createCtx(hookId: string, method: string): HookContext {
    return {
      hookId,
      traceId: `${pluginId}:${method}:${Date.now()}`,
      pluginId,
      organizationId: organizationId ?? '',
    };
  }

  return {
    // ── Primary API ──

    on(hookId: string, handler: (data: any, ctx: any) => Promise<unknown> | unknown, options?: HookHandlerOptions) {
      return registerHandler(hookId, handler, options);
    },

    async emit<T = unknown>(hookId: string, data: T, options?: { pipe?: boolean }): Promise<T> {
      if (!executor) {
        throw new Error('Hook emit not available in this context (no executor)');
      }

      // If no handlers registered for this hook, try tRPC fallback
      const definition = registry.getDefinition(hookId);
      if (!definition) {
        // No hook definition → try auto-mapping to tRPC procedure
        if (trpcCallerFactory) {
          try {
            const result = await trpcCallerFactory(hookId, data);
            return result as T;
          } catch (error) {
            if (
              typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              error.code === 'HOOK_TRPC_ROUTE_NOT_FOUND'
            ) {
              return data;
            }
            throw error;
          }
        }
        return data;
      }

      const ctx = createCtx(hookId, 'emit');

      if (options?.pipe) {
        // Pipe mode: serial pipeline, return transformed data
        return executor.executeFilter<T>(hookId, data, ctx);
      }

      // Default: parallel execution
      // Collect first non-undefined return value from handlers
      const handlers = (executor as any).getActiveHandlers?.(hookId, ctx.organizationId) ?? [];
      if (handlers.length === 0) return data;

      const results = await Promise.allSettled(
        handlers.map(async (handler: RuntimeHookHandler) => {
          try {
            return await (executor as any).executeHandler(handler, structuredClone(data), ctx);
          } catch {
            return { success: false };
          }
        })
      );

      // Return first successful result that has a return value
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value?.success && result.value.result !== undefined) {
          return result.value.result as T;
        }
      }

      return data;
    },

    async listHooks() {
      return registry.getAllHooks().map(hook => ({
        id: hook.id,
        description: hook.description,
      }));
    },

    // ── Deprecated aliases (backward compatibility) ──

    addAction(hookId, handler, options?) {
      return registerHandler(hookId, handler, options);
    },

    addFilter(hookId, handler, options?) {
      return registerHandler(hookId, handler, options);
    },

    async applyFilter<T = unknown>(hookId: string, initialValue: T): Promise<T> {
      if (!executor) {
        throw new Error('Hook applyFilter not available in this context (no executor)');
      }
      if (!registry.getDefinition(hookId)) return initialValue;
      return executor.executeFilter<T>(hookId, initialValue, createCtx(hookId, 'applyFilter'));
    },
  };
}

/**
 * Create runtime handler from plugin handler
 */
function createRuntimeHandler(
  pluginId: string,
  organizationId: string | undefined,
  hookId: string,
  fn: (data: unknown, ctx: HookContext) => Promise<unknown> | unknown,
  options?: HookHandlerOptions
): RuntimeHookHandler {
  const handlerId = `${pluginId}:${hookId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  return {
    id: handlerId,
    hookId,
    pluginId,
    priority: options?.priority ?? HookPriority.NORMAL,
    enabled: true,
    fn,
    source: `plugin:${pluginId}`,
    functionName: fn.name || 'anonymous',
    timeout: options?.timeout ?? 5000,
    stats: {
      callCount: 0,
      errorCount: 0,
      avgDuration: 0,
    },
    circuitBreaker: {
      state: 'closed',
      threshold: 5,
      cooldownMs: 300000,  // 5 minutes
    },
    ...(organizationId ? { organizationId } : {}),
  };
}

/**
 * Cleanup all handlers registered by a plugin
 *
 * Called when a plugin is disabled or uninstalled.
 *
 * @param pluginId - The plugin ID
 * @param registry - The HookRegistry instance
 */
export function cleanupPluginHooks(pluginId: string, registry: HookRegistry): void {
  registry.unregisterPluginHandlers(pluginId);
}
