/**
 * Permission Capability Implementation
 *
 * Provides permission checking for plugins, scoped to declared capabilities.
 *
 * Permission escalation rule:
 * - If user has 'owner' or 'admin' role, all plugin permissions are auto-granted.
 * - This bridges coarse-grained role-based access with plugin fine-grained checks.
 */
import type { PluginPermissionCapability, PluginManifest } from '@wordrhyme/plugin';
import { PermissionDeniedError } from '../../permission';
import { requestContextStorage } from '../../context/async-local-storage';

/** Roles that implicitly grant all plugin permissions */
const PLUGIN_ADMIN_ROLES = new Set(['owner', 'admin']);

/**
 * Check if the current user has an admin-level role that grants all plugin permissions.
 */
function isPluginAdmin(): boolean {
    const ctx = requestContextStorage.getStore();
    if (!ctx?.userRoles) return false;
    return ctx.userRoles.some(role => PLUGIN_ADMIN_ROLES.has(role));
}

/**
 * Create a permission capability for a plugin
 *
 * The capability restricts plugin to only check permissions it declared.
 */
export function createPluginPermissionCapability(
    pluginId: string,
    manifest: PluginManifest
): PluginPermissionCapability {
    // Get permissions plugin declared in manifest
    const declaredPermissions = new Set<string>();
    if (manifest.permissions?.required) {
        for (const perm of manifest.permissions.required) {
            declaredPermissions.add(perm);
        }
    }
    // Also collect from permissions.definitions (key-based format)
    if (manifest.permissions?.definitions) {
        for (const def of manifest.permissions.definitions) {
            declaredPermissions.add(def.key);
        }
    }

    return {
        async can(capability: string): Promise<boolean> {
            // Check if plugin declared this capability
            if (!this.hasDeclared(capability)) {
                console.warn(
                    `[Plugin:${pluginId}] Attempted to check undeclared capability: ${capability}`
                );
                return false;
            }

            // Admin/owner roles grant all plugin permissions
            if (isPluginAdmin()) {
                return true;
            }

            // TODO: Delegate to PermissionKernel for fine-grained RBAC once
            // plugin-specific permissions are seeded into role_permissions table
            return false;
        },

        async require(capability: string): Promise<void> {
            // Check if plugin declared this capability
            if (!this.hasDeclared(capability)) {
                throw new PermissionDeniedError(
                    `Plugin ${pluginId} has not declared capability: ${capability}`
                );
            }

            // Admin/owner roles grant all plugin permissions
            if (isPluginAdmin()) {
                return;
            }

            // TODO: Delegate to PermissionKernel for fine-grained RBAC once
            // plugin-specific permissions are seeded into role_permissions table
            throw new PermissionDeniedError(capability);
        },

        hasDeclared(capability: string): boolean {
            // Plugins can always check their own namespaced permissions
            // Supports both formats: "pluginId:action" and "plugin:pluginId:action"
            if (capability.startsWith(`plugin:${pluginId}:`) || capability.startsWith(`${pluginId}:`)) {
                return true;
            }

            // Check if explicitly declared
            return declaredPermissions.has(capability);
        },
    };
}

export { PermissionDeniedError };
