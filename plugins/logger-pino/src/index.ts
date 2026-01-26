/**
 * Pino Logger Adapter Plugin Entry Point
 *
 * Exports the logger adapter for dynamic loading by WordRhyme Core.
 */
import { PinoLoggerAdapter } from './adapter.js';

/**
 * Factory function to create the logger adapter
 * Called by Core when loading the plugin
 */
export function createLoggerAdapter() {
    return new PinoLoggerAdapter();
}

// Default export for manifest.json exports
export default createLoggerAdapter;

// Named exports for advanced usage
export { PinoLoggerAdapter } from './adapter.js';
export type { PinoAdapterConfig, LoggerAdapter, LogContext } from './adapter.js';
