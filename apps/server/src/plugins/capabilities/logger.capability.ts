/**
 * Logger Capability Implementation
 *
 * Provides scoped logging for plugins with:
 * - Automatic plugin ID and tenant ID injection
 * - Controlled debug mode (tenant admin enabled)
 * - Structured JSON logging
 */
import type { PluginLogger } from '@wordrhyme/plugin';
import {
    LoggerService,
    createPluginLogger as createObservabilityPluginLogger,
} from '../../observability/index.js';

// Singleton logger service instance
let loggerServiceInstance: LoggerService | null = null;

/**
 * Get or create the logger service instance
 */
function getLoggerService(): LoggerService {
    if (!loggerServiceInstance) {
        loggerServiceInstance = new LoggerService();
    }
    return loggerServiceInstance;
}

/**
 * Create a scoped logger for a plugin
 *
 * @param pluginId - Plugin identifier
 * @param tenantId - Optional tenant identifier
 */
export function createPluginLogger(pluginId: string, tenantId?: string): PluginLogger {
    const logger = getLoggerService();

    // Use observability system's plugin logger if tenantId is available
    if (tenantId) {
        return createObservabilityPluginLogger(pluginId, tenantId, logger);
    }

    // Fallback for cases without tenant context
    const childLogger = logger.createChild({ pluginId });

    return {
        info(message: string, meta?: Record<string, unknown>): void {
            childLogger.info(message, meta);
        },

        warn(message: string, meta?: Record<string, unknown>): void {
            childLogger.warn(message, meta);
        },

        error(message: string, meta?: Record<string, unknown>): void {
            childLogger.error(message, meta);
        },

        debug(message: string, meta?: Record<string, unknown>): void {
            // Debug is always available when no tenant context
            // (development/testing mode)
            childLogger.debug(message, meta);
        },
    };
}
