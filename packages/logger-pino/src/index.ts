/**
 * @wordrhyme/logger-pino
 *
 * High-performance Pino logger adapter for WordRhyme observability system.
 *
 * Installation:
 * ```bash
 * pnpm add @wordrhyme/logger-pino
 * ```
 *
 * Configuration:
 * ```bash
 * LOG_ADAPTER=pino  # Enable Pino adapter in WordRhyme Core
 * ```
 *
 * The adapter is automatically loaded by Core when LOG_ADAPTER=pino.
 *
 * @example
 * ```typescript
 * // Direct usage (rare, usually Core handles this)
 * import { PinoLoggerAdapter } from '@wordrhyme/logger-pino';
 *
 * const logger = new PinoLoggerAdapter({
 *   level: 'debug',
 *   serviceName: 'my-service',
 * });
 *
 * logger.info('Application started', { version: '1.0.0' });
 * ```
 */

// Main adapter class
export { PinoLoggerAdapter, type PinoAdapterConfig } from './pino-adapter.js';

// Types (for consumers who need to type their own implementations)
export type { LoggerAdapter, LogContext } from './types.js';
