/**
 * Plugin Logger Implementation
 *
 * Provides scoped logging for plugins with:
 * - Automatic pluginId/tenantId injection
 * - Controlled debug mode (tenant admin enabled with expiry)
 * - Log level restrictions per OBSERVABILITY_GOVERNANCE §3.3
 */
import type { PluginLogger, LogMeta, PluginDebugConfig } from './types.js';
import { LoggerService } from './logger.service.js';

/**
 * In-memory store for plugin debug configurations
 * In production, this should be backed by Redis or database
 */
const debugConfigs = new Map<string, PluginDebugConfig>();

/**
 * Get debug config key
 */
function getDebugConfigKey(pluginId: string, tenantId: string): string {
    return `${tenantId}:${pluginId}`;
}

/**
 * Check if debug mode is enabled for a plugin
 */
export function isDebugEnabled(pluginId: string, tenantId: string): boolean {
    const key = getDebugConfigKey(pluginId, tenantId);
    const config = debugConfigs.get(key);

    if (!config || !config.enabled) {
        return false;
    }

    // Check expiry
    if (new Date() > config.expiresAt) {
        // Auto-disable expired debug mode
        debugConfigs.delete(key);
        return false;
    }

    return true;
}

/**
 * Enable debug mode for a plugin (tenant admin only)
 *
 * @param config - Debug configuration
 * @returns The enabled debug configuration
 * @throws Error if expiry exceeds 24 hours
 */
export function enablePluginDebug(config: PluginDebugConfig): PluginDebugConfig {
    const maxExpiry = new Date();
    maxExpiry.setHours(maxExpiry.getHours() + 24);

    if (config.expiresAt > maxExpiry) {
        throw new Error('Debug mode expiry cannot exceed 24 hours');
    }

    const key = getDebugConfigKey(config.pluginId, config.tenantId);
    debugConfigs.set(key, config);
    return config;
}

/**
 * Disable debug mode for a plugin
 * @returns true if debug mode was previously enabled
 */
export function disablePluginDebug(pluginId: string, tenantId: string): boolean {
    const key = getDebugConfigKey(pluginId, tenantId);
    const existed = debugConfigs.has(key);
    debugConfigs.delete(key);
    return existed;
}

/**
 * Get debug configuration for a plugin
 */
export function getPluginDebugConfig(pluginId: string, tenantId: string): PluginDebugConfig | undefined {
    const key = getDebugConfigKey(pluginId, tenantId);
    return debugConfigs.get(key);
}

/**
 * Create a plugin-scoped logger
 *
 * @param pluginId - Plugin identifier
 * @param tenantId - Tenant identifier
 * @param logger - Core logger service
 * @returns PluginLogger with restricted API
 */
export function createPluginLogger(
    pluginId: string,
    tenantId: string,
    logger: LoggerService
): PluginLogger {
    // Create child logger with bound context
    const childLogger = logger.createChild({
        pluginId,
        tenantId,
    });

    return {
        info(message: string, meta?: LogMeta): void {
            childLogger.info(message, meta);
        },

        warn(message: string, meta?: LogMeta): void {
            childLogger.warn(message, meta);
        },

        error(message: string, meta?: LogMeta): void {
            childLogger.error(message, meta);
        },

        /**
         * Debug logging - only works when debug mode is enabled
         */
        debug(message: string, meta?: LogMeta): void {
            if (isDebugEnabled(pluginId, tenantId)) {
                childLogger.debug(message, meta);
            }
            // Silently ignore when debug mode is disabled
        },
    };
}
