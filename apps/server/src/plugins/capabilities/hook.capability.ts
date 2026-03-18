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
 * @returns PluginHookCapability instance
 */
export function createHookCapability(
  pluginId: string,
  organizationId: string | undefined,
  registry: HookRegistry,
  executor?: HookExecutor
): PluginHookCapability {
  const registeredHandlers: string[] = [];
  const adaptHandler = (handler: unknown) =>
    handler as unknown as (data: unknown, ctx: HookContext) => Promise<unknown> | unknown;

  return {
    addAction<T = unknown>(
      hookId: string,
      handler: (data: T, ctx: PluginContext) => void | Promise<void>,
      options?: HookHandlerOptions
    ): () => void {
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
    },

    addFilter<T = unknown>(
      hookId: string,
      handler: (data: T, ctx: PluginContext) => T | Promise<T>,
      options?: HookHandlerOptions
    ): () => void {
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
    },

    async emit(hookId: string, payload: unknown): Promise<void> {
      if (!executor) {
        throw new Error('Hook emit not available in this context (no executor)');
      }

      // Validate that the hook exists and is an action hook
      const definition = registry.getDefinition(hookId);
      if (!definition) {
        throw new Error(`Unknown hook: ${hookId}. Only Core-defined hooks can be emitted.`);
      }
      if (definition.type !== 'action') {
        throw new Error(`Hook ${hookId} is a ${definition.type} hook. Only action hooks can be emitted by plugins.`);
      }

      const ctx: HookContext = {
        hookId,
        traceId: `${pluginId}:emit:${Date.now()}`,
        pluginId,
        organizationId: organizationId ?? '',
      };

      await executor.executeAction(hookId, payload, ctx);
    },

    async listHooks(): Promise<Array<{
      id: string;
      type: 'action' | 'filter';
      description: string;
    }>> {
      return registry.getAllHooks().map(hook => ({
        id: hook.id,
        type: hook.type,
        description: hook.description,
      }));
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
