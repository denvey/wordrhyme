/**
 * Pino Logger Adapter Plugin
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
 */
import pino, { type Logger, type LoggerOptions } from 'pino';

/**
 * Log context interface (matches Core)
 */
export interface LogContext {
    readonly requestId?: string;
    readonly traceId?: string;
    readonly spanId?: string;
    readonly tenantId?: string;
    readonly pluginId?: string;
    readonly userId?: string;
    [key: string]: unknown;
}

/**
 * Logger Adapter Interface (matches Core)
 */
export interface LoggerAdapter {
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext, trace?: string): void;
    createChild(baseContext: LogContext): LoggerAdapter;
    setMetadata(key: string, value: unknown): void;
}

/**
 * Pino Logger Adapter Configuration
 */
export interface PinoAdapterConfig {
    level?: string;
    serviceName?: string;
    pretty?: boolean;
    pinoOptions?: Partial<LoggerOptions>;
}

/**
 * PinoLoggerAdapter - High-performance Pino-based logger
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

    createChild(baseContext: LogContext): LoggerAdapter {
        const mergedBaseContext = {
            ...this.baseContext,
            ...baseContext,
        };

        const childPino = this.logger.child(baseContext as Record<string, unknown>);

        return PinoLoggerAdapter.fromLogger(
            childPino,
            mergedBaseContext,
            { ...this.metadata }
        );
    }

    setMetadata(key: string, value: unknown): void {
        this.metadata[key] = value;
    }

    getPinoLogger(): Logger {
        return this.logger;
    }

    flush(): void {
        this.logger.flush();
    }
}
