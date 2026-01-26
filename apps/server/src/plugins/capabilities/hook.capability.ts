/**
 * Hook Capability Provider
 *
 * Creates PluginHookCapability instances for plugins.
 * Bridges the plugin SDK types with the core Hook system.
 */

import { HookRegistry } from '../../hooks/hook-registry';
import { HookPriority, RuntimeHookHandler, HookContext } from '../../hooks/hook.types';
import type { PluginHookCapability, HookHandlerOptions, PluginContext } from '@wordrhyme/plugin';

/**
 * Create hook capability for a plugin
 *
 * @param pluginId - The plugin ID
 * @param organizationId - The organization ID (undefined for system-level)
 * @param registry - The HookRegistry instance
 * @returns PluginHookCapability instance
 */
export function createHookCapability(
  pluginId: string,
  organizationId: string | undefined,
  registry: HookRegistry
): PluginHookCapability {
  const registeredHandlers: string[] = [];

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
        handler as (data: unknown, ctx: HookContext) => Promise<unknown>,
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
        handler as (data: unknown, ctx: HookContext) => Promise<unknown>,
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
    organizationId,  // Add organizationId
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
