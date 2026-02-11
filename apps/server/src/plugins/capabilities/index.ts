/**
 * Capability Provider
 *
 * Creates and manages capabilities for plugins.
 * Capabilities are injected in fixed order: Logger → Permission → Data
 */
import type { PluginContext, PluginManifest } from '@wordrhyme/plugin';
import { createPluginLogger } from './logger.capability';
import { createPluginPermissionCapability } from './permission.capability';
import { createPluginDataCapability } from './data.capability';

/**
 * Create a full PluginContext with all capabilities
 */
export function createCapabilitiesForPlugin(
    pluginId: string,
    manifest: PluginManifest,
    requestContext?: {
        tenantId?: string;
        userId?: string;
    }
): PluginContext {
    // 1. Logger Capability (always available)
    const logger = createPluginLogger(pluginId);

    // 2. Permission Capability (always available)
    const permissions = createPluginPermissionCapability(pluginId, manifest);

    // 3. Database Capability (available if plugin has db capabilities declared)
    const hasDbCapability = manifest.capabilities?.data !== undefined;
    const db = hasDbCapability
        ? createPluginDataCapability(pluginId, requestContext?.tenantId)
        : undefined;

    return {
        pluginId,
        tenantId: requestContext?.tenantId,
        userId: requestContext?.userId,
        logger,
        permissions,
        db,
    };
}

/**
 * Re-export capability creators for direct use
 */
export { createPluginLogger } from './logger.capability';
export { createPluginPermissionCapability, PermissionDeniedError } from './permission.capability';
export { createPluginDataCapability } from './data.capability';

