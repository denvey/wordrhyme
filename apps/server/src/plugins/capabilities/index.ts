/**
 * Capability Provider
 *
 * Creates and manages capabilities for plugins.
 * Capabilities are injected in fixed order: Logger → Permission → Data → Settings → Metrics → Trace
 */
import type { PluginContext, PluginManifest } from '@wordrhyme/plugin';
import { createPluginLogger } from './logger.capability';
import { createPluginPermissionCapability } from './permission.capability';
import { createPluginDataCapability } from './data.capability';
import { createPluginSettingsCapability } from './settings.capability';
import { createPluginMetrics } from './metrics.capability';
import { createPluginTrace } from './trace.capability';
import type { SettingsService } from '../../settings/settings.service';
import type { FeatureFlagService } from '../../settings/feature-flag.service';

/**
 * Create a full PluginContext with all capabilities
 */
export function createCapabilitiesForPlugin(
    pluginId: string,
    manifest: PluginManifest,
    requestContext?: {
        organizationId?: string;
        userId?: string;
    },
    services?: {
        settingsService?: SettingsService;
        featureFlagService?: FeatureFlagService;
    }
): PluginContext {
    const organizationId = requestContext?.organizationId;

    // 1. Logger Capability (always available)
    const logger = createPluginLogger(pluginId, organizationId);

    // 2. Permission Capability (always available)
    const permissions = createPluginPermissionCapability(pluginId, manifest);

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

    // 5. Metrics Capability (available if organizationId is provided)
    const metrics = organizationId ? createPluginMetrics(pluginId, organizationId) : undefined;

    // 6. Trace Capability (always available)
    const trace = createPluginTrace(pluginId);

    return {
        pluginId,
        organizationId,
        userId: requestContext?.userId,
        logger,
        permissions,
        db,
        settings,
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
export { createPluginMetrics } from './metrics.capability';
export { createPluginTrace } from './trace.capability';

