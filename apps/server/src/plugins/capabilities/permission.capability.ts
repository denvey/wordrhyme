/**
 * Permission Capability Implementation
 *
 * Provides permission checking for plugins, delegating to PermissionKernel
 * for CASL-based RBAC evaluation.
 *
 * This ensures plugin permissions follow the same model as core permissions:
 * - Roles with `manage:all` (e.g., owner/admin) automatically gain all plugin permissions
 * - Fine-grained permissions are evaluated via CASL rules in role_permissions table
 */
import type {
  PluginPermissionCapability,
  PluginManifest,
} from "@wordrhyme/plugin";
import { PermissionDeniedError } from "../../permission";
import { parseCapability } from "../../permission/capability-parser";
import type { PermissionKernel } from "../../permission/permission-kernel";
import type { PermissionContext } from "../../permission/permission.types";

/**
 * Create a permission capability for a plugin
 *
 * Delegates permission checks to PermissionKernel using explicitCtx,
 * following the same pattern as core route middleware (trpc.ts).
 */
export function createPluginPermissionCapability(
  pluginId: string,
  manifest: PluginManifest,
  permissionKernel: PermissionKernel,
  permissionContext: PermissionContext
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
          `[Plugin:${pluginId}] Attempted to check undeclared capability: ${capability}`,
        );
        return false;
      }

      // Delegate to PermissionKernel with explicit context
      // parseCapability handles plugin format: "plugin:pluginId:resource.action"
      const parsed = parseCapability(capability);
      return permissionKernel.can(
        parsed.action,
        parsed.subject,
        undefined,
        permissionContext,
      );
    },

    async require(capability: string): Promise<void> {
      // Check if plugin declared this capability
      if (!this.hasDeclared(capability)) {
        throw new PermissionDeniedError(
          `Plugin ${pluginId} has not declared capability: ${capability}`,
        );
      }

      // Delegate to PermissionKernel with explicit context
      const parsed = parseCapability(capability);
      await permissionKernel.require(
        parsed.action,
        parsed.subject,
        undefined,
        permissionContext,
      );
    },

    hasDeclared(capability: string): boolean {
      // Plugins can always check their own namespaced permissions
      // Supports both formats: "pluginId:action" and "plugin:pluginId:action"
      if (
        capability.startsWith(`plugin:${pluginId}:`) ||
        capability.startsWith(`${pluginId}:`)
      ) {
        return true;
      }

      // Check if explicitly declared
      return declaredPermissions.has(capability);
    },
  };
}

export { PermissionDeniedError };
