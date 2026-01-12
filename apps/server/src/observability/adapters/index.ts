/**
 * Logger Adapter Factory
 *
 * Dynamically selects and loads logger adapter based on LOG_ADAPTER env var.
 */
import type { LoggerAdapter } from '../types.js';
import { NestJSLoggerAdapter } from './nestjs-logger.adapter.js';

export type AdapterType = 'nestjs' | 'pino';

/**
 * Create a logger adapter based on configuration
 *
 * @param type - Adapter type (defaults to LOG_ADAPTER env var or 'nestjs')
 * @returns LoggerAdapter instance
 * @throws Error if Pino adapter is requested but not installed
 */
export function createLoggerAdapter(type?: AdapterType): LoggerAdapter {
    const adapterType = type ?? (process.env['LOG_ADAPTER'] as AdapterType) ?? 'nestjs';

    switch (adapterType) {
        case 'pino':
            try {
                // Dynamic import for optional Pino adapter
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { PinoLoggerAdapter } = require('@wordrhyme/logger-pino');
                return new PinoLoggerAdapter();
            } catch {
                throw new Error(
                    'Pino adapter requires: pnpm add @wordrhyme/logger-pino\n' +
                    'Or use the default NestJS adapter by setting LOG_ADAPTER=nestjs'
                );
            }

        case 'nestjs':
        default:
            return new NestJSLoggerAdapter();
    }
}

export { NestJSLoggerAdapter };
