import { Injectable } from '@nestjs/common';
import { PermissionKernel } from './permission-kernel';

/**
 * PermissionService - Plugin permission capability provider
 * 
 * Creates scoped permission capabilities for plugins.
 * Plugin permissions are automatically namespaced with `plugin:{pluginId}:`.
 */
@Injectable()
export class PermissionService {
    constructor(private readonly permissionKernel: PermissionKernel) { }

    /**
     * Create a permission capability for a plugin
     * 
     * @param pluginId - The plugin's unique identifier
     * @returns PermissionCapability with auto-namespaced methods
     */
    createPluginCapability(pluginId: string): PluginPermissionCapability {
        return {
            can: async (capability: string): Promise<boolean> => {
                const fullCapability = this.resolvePluginCapability(pluginId, capability);
                return this.permissionKernel.can(fullCapability);
            },

            require: async (capability: string): Promise<void> => {
                const fullCapability = this.resolvePluginCapability(pluginId, capability);
                return this.permissionKernel.require(fullCapability);
            },
        };
    }

    /**
     * Resolve plugin capability to full namespaced format
     * 
     * - `settings.read` → `plugin:com.vendor.plugin:settings.read`
     * - `plugin:other:thing` → `plugin:other:thing` (already namespaced, but will be denied)
     * - `core:users:manage` → `core:users:manage` (Core capability, plugin can check it)
     */
    private resolvePluginCapability(pluginId: string, capability: string): string {
        // If already in plugin namespace or core namespace, use as-is
        if (capability.startsWith('plugin:') || capability.startsWith('core:')) {
            return capability;
        }

        // Otherwise, namespace to this plugin
        // Convert shorthand like `settings.read` to `plugin:{pluginId}:settings.read`
        // Note: We need to convert the dot syntax to colon syntax
        const parts = capability.split('.');
        if (parts.length === 2) {
            return `plugin:${pluginId}:${parts[0]}:${parts[1]}`;
        }

        // If already in colon format, just add plugin prefix
        return `plugin:${pluginId}:${capability}`;
    }
}

/**
 * Plugin permission capability interface
 */
export interface PluginPermissionCapability {
    /**
     * Check if current user has the capability
     */
    can(capability: string): Promise<boolean>;

    /**
     * Require the capability - throws PermissionDeniedError if not allowed
     */
    require(capability: string): Promise<void>;
}
