/**
 * Capability Provider
 *
 * Creates and manages capabilities for plugins.
 * Capabilities are injected in fixed order: Logger → Permission → Data → Settings → Media → Metrics → Trace
 */
import type { PluginContext, PluginManifest } from '@wordrhyme/plugin';
import { createPluginLogger } from './logger.capability';
import { createPluginPermissionCapability } from './permission.capability';
import { createPluginDataCapability } from './data.capability';
import { createPluginSettingsCapability } from './settings.capability';
import { createPluginMediaCapability } from './media.capability';
import { createPluginMetrics } from './metrics.capability';
import { createPluginTrace } from './trace.capability';
import { createPluginStorageCapability } from './storage.capability';
import type { SettingsService } from '../../settings/settings.service';
import type { FeatureFlagService } from '../../settings/feature-flag.service';
import type { PermissionKernel } from '../../permission/permission-kernel';
import type { PermissionContext } from '../../permission/permission.types';
import type { StorageProviderRegistry } from '../../file-storage/storage-provider.registry';
import type { MediaService } from '../../media/media.service';

/**
 * Create a full PluginContext with all capabilities
 */
export function createCapabilitiesForPlugin(
    pluginId: string,
    manifest: PluginManifest,
    requestContext?: {
        organizationId?: string;
        userId?: string;
        requestId?: string;
        userRole?: string;
        userRoles?: string[];
        currentTeamId?: string;
    },
    services?: {
        settingsService?: SettingsService | undefined;
        featureFlagService?: FeatureFlagService | undefined;
        permissionKernel?: PermissionKernel | undefined;
        storageProviderRegistry?: StorageProviderRegistry | undefined;
        mediaService?: MediaService | undefined;
    }
): PluginContext {
    const organizationId = requestContext?.organizationId;

    // 1. Logger Capability (always available)
    const logger = createPluginLogger(pluginId, organizationId);

    // 2. Permission Capability (always available)
    // Build PermissionContext for CASL evaluation
    const permissionContext: PermissionContext = {
        requestId: requestContext?.requestId ?? 'unknown',
        userId: requestContext?.userId,
        organizationId,
        userRole: requestContext?.userRole,
        userRoles: requestContext?.userRoles,
        currentTeamId: requestContext?.currentTeamId,
    };
    const kernel = services?.permissionKernel!;
    const permissions = createPluginPermissionCapability(pluginId, manifest, kernel, permissionContext);

    // 3. Database Capability (available if plugin has db capabilities declared)
    const hasDbCapability = manifest.capabilities?.data !== undefined;
    const db = hasDbCapability
        ? createPluginDataCapability(pluginId, organizationId)
        : undefined;

    // 4. Settings Capability (requires services to be injected)
    // If services not provided, create a stub that throws on use
    const settings = services?.settingsService && services?.featureFlagService
        ? createPluginSettingsCapability(
            pluginId,
            organizationId,
            services.settingsService,
            services.featureFlagService
        )
        : createSettingsCapabilityStub();

    // 5. Media Capability (available if mediaService is injected)
    const media = services?.mediaService
        ? createPluginMediaCapability(pluginId, organizationId, services.mediaService)
        : undefined;

    // 6. Metrics Capability (available if organizationId is provided)
    const metrics = organizationId ? createPluginMetrics(pluginId, organizationId) : undefined;

    // 7. Trace Capability (always available)
    const trace = createPluginTrace(pluginId);

    // 8. Storage Capability (available if plugin declares storage.provider and registry is injected)
    const hasStorageCapability = manifest.capabilities?.storage?.provider === true;
    const storage = (hasStorageCapability && services?.storageProviderRegistry)
        ? createPluginStorageCapability(pluginId, manifest, services.storageProviderRegistry)
        : undefined;

    return {
        pluginId,
        tenantId: organizationId,
        userId: requestContext?.userId,
        logger,
        permissions,
        db,
        settings,
        media,
        storage,
        metrics,
        trace,
    };
}

/**
 * Create a stub settings capability that throws when used
 * Used when services are not injected (e.g., during plugin loading)
 */
function createSettingsCapabilityStub(): PluginContext['settings'] {
    const notAvailable = () => {
        throw new Error('Settings capability not available in this context');
    };

    return {
        get: notAvailable,
        set: notAvailable,
        delete: notAvailable,
        list: notAvailable,
        isFeatureEnabled: notAvailable,
    };
}

/**
 * Re-export capability creators for direct use
 */
export { createPluginLogger } from './logger.capability';
export { createPluginPermissionCapability, PermissionDeniedError } from './permission.capability';
export { createPluginDataCapability } from './data.capability';
export { createPluginSettingsCapability } from './settings.capability';
export { createPluginMediaCapability } from './media.capability';
export { createPluginMetrics } from './metrics.capability';
export { createPluginTrace } from './trace.capability';

