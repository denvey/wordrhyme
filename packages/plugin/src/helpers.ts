/**
 * Plugin Runtime Helpers (Client-Side)
 *
 * Utilities for plugins to use logger and permission capabilities.
 * These are convenience wrappers that work within plugin context.
 */

import type { PluginContext, PluginLogger, PluginPermissionCapability } from './types';

/**
 * Create a scoped logger for a plugin
 *
 * @example
 * ```ts
 * import { createLogger } from '@wordrhyme/plugin';
 *
 * const logger = createLogger('com.vendor.my-plugin');
 * logger.info('Plugin started');
 * ```
 */
export function createLogger(pluginId: string): PluginLogger {
    return {
        info: (msg, meta) => console.log(`[${pluginId}]`, msg, meta ?? ''),
        warn: (msg, meta) => console.warn(`[${pluginId}]`, msg, meta ?? ''),
        error: (msg, meta) => console.error(`[${pluginId}]`, msg, meta ?? ''),
        debug: (msg, meta) => console.debug(`[${pluginId}]`, msg, meta ?? ''),
    };
}

/**
 * Check if a permission is granted in the context
 *
 * @example
 * ```ts
 * import { checkPermission } from '@wordrhyme/plugin';
 *
 * async function myHandler(ctx: PluginContext) {
 *   if (await checkPermission(ctx, 'content:read:*')) {
 *     // User has permission
 *   }
 * }
 * ```
 */
export async function checkPermission(
    ctx: PluginContext,
    capability: string
): Promise<boolean> {
    return ctx.permissions.can(capability);
}

/**
 * Require a permission - throws if denied
 *
 * @example
 * ```ts
 * import { requirePermission } from '@wordrhyme/plugin';
 *
 * async function protectedHandler(ctx: PluginContext) {
 *   await requirePermission(ctx, 'admin:manage:*');
 *   // Only executes if permission granted
 * }
 * ```
 */
export async function requirePermission(
    ctx: PluginContext,
    capability: string
): Promise<void> {
    return ctx.permissions.require(capability);
}

/**
 * Check if plugin declared a capability in its manifest
 *
 * @example
 * ```ts
 * import { hasCapability } from '@wordrhyme/plugin';
 *
 * function checkDeclared(ctx: PluginContext) {
 *   if (hasCapability(ctx, 'content:write:*')) {
 *     // Plugin declared this capability
 *   }
 * }
 * ```
 */
export function hasCapability(
    ctx: PluginContext,
    capability: string
): boolean {
    return ctx.permissions.hasDeclared(capability);
}
