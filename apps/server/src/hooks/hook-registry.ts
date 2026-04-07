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
import { requestContextStorage } from '../context/async-local-storage';

/**
 * Organization Context for data access
 * - 'platform': Platform admin view (see all data)
 * - string: Tenant admin view (see only their organization)
 */
export type OrganizationContext = 'platform' | string;

/**
 * Hook Registry
 *
 * Central registry for all hook definitions and handlers.
 * Maintains handlers sorted by priority for efficient execution.
 *
 * SECURITY: All data access methods automatically enforce organization-level isolation.
 * Organization context is retrieved from AsyncLocalStorage (like scoped-db).
 * Platform organization ('platform') can see all data.
 * Other organizations can only see their own data.
 *
 * IMPORTANT: Methods have TWO signatures:
 * 1. No parameters: Automatically gets orgContext from AsyncLocalStorage (normal usage)
 * 2. With __unsafeOrgContext: For testing/sudo operations ONLY (bypasses ALS)
 */
@Injectable()
export class HookRegistry {
  private readonly hooks = new Map<string, HookRegistryEntry>();
  private readonly handlerIndex = new Map<string, RuntimeHookHandler>();

  /**
   * Get current organization context from AsyncLocalStorage
   * SECURITY: This is the ONLY source of truth for organization context
   *
   * @param explicitContext - Optional explicit context (for testing/sudo ONLY)
   * @returns Organization context
   * @throws Error if no context available and no explicit context provided
   */
  private getOrganizationContext(explicitContext?: OrganizationContext): OrganizationContext {
    // If explicit context provided (testing/sudo mode), use it
    if (explicitContext !== undefined) {
      return explicitContext;
    }

    // Get context from AsyncLocalStorage
    const ctx = requestContextStorage.getStore();
    if (!ctx?.organizationId) {
      throw new Error(
        'Organization context required. This method must be called within a request context. ' +
        'If you are in a test, pass __unsafeOrgContext parameter.'
      );
    }

    // Convert to OrganizationContext type
    return ctx.organizationId === 'platform' ? 'platform' : ctx.organizationId;
  }

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
   * Auto-defines the hook if it doesn't exist (lazy registration)
   */
  registerHandler(handler: RuntimeHookHandler): void {
    let entry = this.hooks.get(handler.hookId);

    // Auto-define hook if not exists
    if (!entry) {
      const definition: HookDefinition = {
        id: handler.hookId,
        type: 'action',
        description: `Auto-registered by ${handler.pluginId}`,
        defaultTimeout: 5000,
      };
      entry = { definition, handlers: [] };
      this.hooks.set(handler.hookId, entry);
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
   * Filter handlers by organization context
   * SECURITY: This is the ONLY place where organization filtering happens
   *
   * @param handlers - All handlers
   * @param orgContext - Organization context ('platform' or tenant ID)
   * @returns Filtered handlers
   */
  private filterByOrganization(
    handlers: RuntimeHookHandler[],
    orgContext: OrganizationContext
  ): RuntimeHookHandler[] {
    // Platform organization sees all handlers
    if (orgContext === 'platform') {
      return handlers;
    }

    // Tenant organization sees:
    // 1. System-level handlers (organizationId === undefined)
    // 2. Their own handlers (organizationId === orgContext)
    return handlers.filter(h =>
      h.organizationId === undefined || h.organizationId === orgContext
    );
  }

  /**
   * Get all handlers for a hook (already sorted by priority)
   * SECURITY: Automatically filters by organization context from AsyncLocalStorage
   *
   * @param hookId - Hook ID
   * @param __unsafeOrgContext - INTERNAL USE ONLY: Explicit context for testing/sudo operations
   * @returns Handlers visible to the current organization
   */
  getHandlers(hookId: string, __unsafeOrgContext?: OrganizationContext): RuntimeHookHandler[] {
    const orgContext = this.getOrganizationContext(__unsafeOrgContext);
    const allHandlers = this.hooks.get(hookId)?.handlers ?? [];
    return this.filterByOrganization(allHandlers, orgContext);
  }

  /**
   * Get handler by ID
   * SECURITY: Automatically checks organization access from AsyncLocalStorage
   *
   * @param handlerId - Handler ID
   * @param __unsafeOrgContext - INTERNAL USE ONLY: Explicit context for testing/sudo operations
   * @returns Handler if accessible, undefined otherwise
   */
  getHandler(handlerId: string, __unsafeOrgContext?: OrganizationContext): RuntimeHookHandler | undefined {
    const orgContext = this.getOrganizationContext(__unsafeOrgContext);
    const handler = this.handlerIndex.get(handlerId);
    if (!handler) {
      return undefined;
    }

    // Platform organization can access any handler
    if (orgContext === 'platform') {
      return handler;
    }

    // Tenant organization can only access:
    // 1. System-level handlers (organizationId === undefined)
    // 2. Their own handlers (organizationId === orgContext)
    if (handler.organizationId === undefined || handler.organizationId === orgContext) {
      return handler;
    }

    return undefined;
  }

  /**
   * Get all defined hooks
   */
  getAllHooks(): HookDefinition[] {
    return Array.from(this.hooks.values()).map(e => e.definition);
  }

  /**
   * Get total handler count
   * SECURITY: Automatically filters by organization context from AsyncLocalStorage
   *
   * @param __unsafeOrgContext - INTERNAL USE ONLY: Explicit context for testing/sudo operations
   * @returns Total count visible to the current organization
   */
  getTotalHandlerCount(__unsafeOrgContext?: OrganizationContext): number {
    const orgContext = this.getOrganizationContext(__unsafeOrgContext);

    if (orgContext === 'platform') {
      return this.handlerIndex.size;
    }

    // Count handlers for specific organization
    let count = 0;
    for (const handler of this.handlerIndex.values()) {
      if (handler.organizationId === undefined || handler.organizationId === orgContext) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get handlers by organization ID
   * SECURITY: Automatically filters by organization context from AsyncLocalStorage
   *
   * @param __unsafeOrgContext - INTERNAL USE ONLY: Explicit context for testing/sudo operations
   * @returns All handlers visible to the current organization
   */
  getHandlersByOrganization(__unsafeOrgContext?: OrganizationContext): RuntimeHookHandler[] {
    const orgContext = this.getOrganizationContext(__unsafeOrgContext);

    const handlers: RuntimeHookHandler[] = [];
    for (const handler of this.handlerIndex.values()) {
      if (orgContext === 'platform' ||
          handler.organizationId === undefined ||
          handler.organizationId === orgContext) {
        handlers.push(handler);
      }
    }
    return handlers;
  }

  /**
   * Clear all hooks and handlers (for testing)
   */
  clear(): void {
    this.hooks.clear();
    this.handlerIndex.clear();
  }
}
