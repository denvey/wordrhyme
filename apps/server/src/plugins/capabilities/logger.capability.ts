/**
 * Logger Capability Implementation
 *
 * Provides scoped logging for plugins with automatic plugin ID prefix.
 */
import { Logger } from '@nestjs/common';
import type { PluginLogger } from '@wordrhyme/plugin';

/**
 * Create a scoped logger for a plugin
 */
export function createPluginLogger(pluginId: string): PluginLogger {
    const logger = new Logger(`Plugin:${pluginId}`);

    return {
        info(message: string, meta?: Record<string, unknown>): void {
            if (meta) {
                logger.log(message, meta);
            } else {
                logger.log(message);
            }
        },

        warn(message: string, meta?: Record<string, unknown>): void {
            if (meta) {
                logger.warn(message, meta);
            } else {
                logger.warn(message);
            }
        },

        error(message: string, meta?: Record<string, unknown>): void {
            if (meta) {
                logger.error(message, meta);
            } else {
                logger.error(message);
            }
        },

        debug(message: string, meta?: Record<string, unknown>): void {
            if (meta) {
                logger.debug(message, meta);
            } else {
                logger.debug(message);
            }
        },
    };
}
