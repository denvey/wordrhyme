/**
 * Pino Logger Adapter
 *
 * High-performance logging implementation using Pino.
 * Designed for production SaaS and high-concurrency scenarios.
 *
 * Features:
 * - Asynchronous logging (non-blocking)
 * - Structured JSON output
 * - pino-pretty integration for development
 * - Child logger support with context binding
 * - Automatic environment detection
 *
 * @example
 * ```typescript
 * // In LOG_ADAPTER=pino mode, Core will dynamically import this adapter
 * const adapter = new PinoLoggerAdapter();
 * adapter.info('User logged in', { userId: '123' });
 * ```
 */
import pino, { type Logger, type LoggerOptions } from 'pino';
import type { LoggerAdapter, LogContext } from './types.js';

/**
 * Pino Logger Adapter Configuration
 */
export interface PinoAdapterConfig {
    /**
     * Log level (default: from LOG_LEVEL env or 'info')
     */
    level?: string;

    /**
     * Service name for log identification
     */
    serviceName?: string;

    /**
     * Enable pretty printing (default: auto-detect from NODE_ENV)
     */
    pretty?: boolean;

    /**
     * Additional pino options
     */
    pinoOptions?: Partial<LoggerOptions>;
}

/**
 * PinoLoggerAdapter - High-performance Pino-based logger
 *
 * Implements the LoggerAdapter interface for use with WordRhyme Core.
 */
export class PinoLoggerAdapter implements LoggerAdapter {
    private logger: Logger;
    private baseContext: LogContext = {};
    private metadata: Record<string, unknown> = {};

    constructor(config: PinoAdapterConfig = {}) {
        const isDev = process.env['NODE_ENV'] === 'development';
        const level = config.level || process.env['LOG_LEVEL'] || 'info';
        const serviceName = config.serviceName || 'wordrhyme-core';
        const usePretty = config.pretty ?? isDev;

        const pinoOptions: LoggerOptions = {
            level,
            formatters: {
                level: (label: string) => ({ level: label }),
                bindings: (bindings: Record<string, unknown>) => ({
                    pid: bindings['pid'],
                    hostname: bindings['hostname'],
                }),
            },
            base: {
                service: serviceName,
            },
            timestamp: pino.stdTimeFunctions.isoTime,
            ...config.pinoOptions,
        };

        // Use pino-pretty for development
        if (usePretty) {
            pinoOptions.transport = {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                },
            };
        }

        this.logger = pino(pinoOptions);
    }

    /**
     * Create a PinoLoggerAdapter with an existing pino logger instance
     * Used internally for child logger creation
     */
    private static fromLogger(
        logger: Logger,
        baseContext: LogContext = {},
        metadata: Record<string, unknown> = {}
    ): PinoLoggerAdapter {
        const adapter = Object.create(PinoLoggerAdapter.prototype) as PinoLoggerAdapter;
        adapter.logger = logger;
        adapter.baseContext = baseContext;
        adapter.metadata = metadata;
        return adapter;
    }

    /**
     * Merge all context sources into a single object
     */
    private mergeContext(context?: LogContext): Record<string, unknown> {
        return {
            ...this.baseContext,
            ...this.metadata,
            ...context,
        };
    }

    debug(message: string, context?: LogContext): void {
        this.logger.debug(this.mergeContext(context), message);
    }

    info(message: string, context?: LogContext): void {
        this.logger.info(this.mergeContext(context), message);
    }

    warn(message: string, context?: LogContext): void {
        this.logger.warn(this.mergeContext(context), message);
    }

    error(message: string, context?: LogContext, trace?: string): void {
        const mergedContext = this.mergeContext(context);
        if (trace) {
            (mergedContext as Record<string, unknown>)['stack'] = trace;
        }
        this.logger.error(mergedContext, message);
    }

    /**
     * Create a child logger with bound context
     *
     * The child logger inherits parent context and metadata,
     * with the provided baseContext merged in.
     */
    createChild(baseContext: LogContext): LoggerAdapter {
        const mergedBaseContext = {
            ...this.baseContext,
            ...baseContext,
        };

        // Create Pino child logger with the context
        const childPino = this.logger.child(baseContext as Record<string, unknown>);

        return PinoLoggerAdapter.fromLogger(
            childPino,
            mergedBaseContext,
            { ...this.metadata }
        );
    }

    /**
     * Set metadata that will be included in all subsequent logs
     */
    setMetadata(key: string, value: unknown): void {
        this.metadata[key] = value;
    }

    /**
     * Get the underlying Pino logger instance
     * Useful for advanced usage or testing
     */
    getPinoLogger(): Logger {
        return this.logger;
    }

    /**
     * Flush the logger (useful before process exit)
     */
    flush(): void {
        this.logger.flush();
    }
}
