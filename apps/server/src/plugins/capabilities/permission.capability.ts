/**
 * Permission Capability Implementation
 *
 * Provides permission checking for plugins, scoped to declared capabilities.
 */
import type { PluginPermissionCapability, PluginManifest } from '@wordrhyme/plugin';
import { PermissionKernel, PermissionDeniedError } from '../../permission';

/**
 * Create a permission capability for a plugin
 *
 * The capability restricts plugin to only check permissions it declared.
 */
export function createPluginPermissionCapability(
    pluginId: string,
    manifest: PluginManifest
): PluginPermissionCapability {
    const permissionKernel = new PermissionKernel();

    // Get permissions plugin declared in manifest
    const declaredPermissions = new Set<string>();
    if (manifest.permissions?.required) {
        for (const perm of manifest.permissions.required) {
            declaredPermissions.add(perm);
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

            // Delegate to PermissionKernel
            return permissionKernel.can(capability);
        },

        async require(capability: string): Promise<void> {
            // Check if plugin declared this capability
            if (!this.hasDeclared(capability)) {
                throw new PermissionDeniedError(
                    `Plugin ${pluginId} has not declared capability: ${capability}`
                );
            }

            // Delegate to PermissionKernel
            return permissionKernel.require(capability);
        },

        hasDeclared(capability: string): boolean {
            // Plugins can always check their own defined permissions
            if (capability.startsWith(`${pluginId}:`)) {
                return true;
            }

            // Check if explicitly declared
            return declaredPermissions.has(capability);
        },
    };
}

export { PermissionDeniedError };
