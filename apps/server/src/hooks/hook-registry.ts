/**
 * Hook Registry
 *
 * Central registry for all hook definitions and handlers.
 * Per EVENT_HOOK_GOVERNANCE.md (Frozen v1)
 */

import { Injectable } from '@nestjs/common';
import {
  HookDefinition,
  RuntimeHookHandler,
  HookRegistryEntry,
} from './hook.types';

/**
 * Hook Registry
 *
 * Central registry for all hook definitions and handlers.
 * Maintains handlers sorted by priority for efficient execution.
 */
@Injectable()
export class HookRegistry {
  private readonly hooks = new Map<string, HookRegistryEntry>();
  private readonly handlerIndex = new Map<string, RuntimeHookHandler>();

  /**
   * Define a new hook (Core only)
   */
  defineHook(definition: HookDefinition): void {
    if (this.hooks.has(definition.id)) {
      throw new Error(`Hook '${definition.id}' is already defined`);
    }

    this.hooks.set(definition.id, {
      definition,
      handlers: [],
    });
  }

  /**
   * Check if a hook is defined
   */
  hasHook(hookId: string): boolean {
    return this.hooks.has(hookId);
  }

  /**
   * Get hook definition
   */
  getDefinition(hookId: string): HookDefinition | undefined {
    return this.hooks.get(hookId)?.definition;
  }

  /**
   * Register a handler for a hook
   */
  registerHandler(handler: RuntimeHookHandler): void {
    const entry = this.hooks.get(handler.hookId);
    if (!entry) {
      throw new Error(`Hook '${handler.hookId}' is not defined`);
    }

    // Add to handlers list
    entry.handlers.push(handler);

    // Sort by priority (ascending)
    entry.handlers.sort((a, b) => a.priority - b.priority);

    // Index by handler ID for fast lookup
    this.handlerIndex.set(handler.id, handler);
  }

  /**
   * Unregister a handler by ID
   */
  unregisterHandler(handlerId: string): boolean {
    const handler = this.handlerIndex.get(handlerId);
    if (!handler) {
      return false;
    }

    const entry = this.hooks.get(handler.hookId);
    if (entry) {
      entry.handlers = entry.handlers.filter(h => h.id !== handlerId);
    }

    this.handlerIndex.delete(handlerId);
    return true;
  }

  /**
   * Unregister all handlers for a plugin
   */
  unregisterPluginHandlers(pluginId: string): void {
    const handlersToRemove: string[] = [];

    for (const [handlerId, handler] of this.handlerIndex) {
      if (handler.pluginId === pluginId) {
        handlersToRemove.push(handlerId);
      }
    }

    for (const handlerId of handlersToRemove) {
      this.unregisterHandler(handlerId);
    }
  }

  /**
   * Get all handlers for a hook (already sorted by priority)
   */
  getHandlers(hookId: string): RuntimeHookHandler[] {
    return this.hooks.get(hookId)?.handlers ?? [];
  }

  /**
   * Get handler by ID
   */
  getHandler(handlerId: string): RuntimeHookHandler | undefined {
    return this.handlerIndex.get(handlerId);
  }

  /**
   * Get all defined hooks
   */
  getAllHooks(): HookDefinition[] {
    return Array.from(this.hooks.values()).map(e => e.definition);
  }

  /**
   * Get total handler count
   */
  getTotalHandlerCount(): number {
    return this.handlerIndex.size;
  }

  /**
   * Clear all hooks and handlers (for testing)
   */
  clear(): void {
    this.hooks.clear();
    this.handlerIndex.clear();
  }
}
