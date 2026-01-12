/**
 * Logger Service
 *
 * Main logging service that wraps the selected adapter and provides
 * log level filtering and automatic context injection.
 */
import { Injectable, Inject, Optional } from '@nestjs/common';
import type { LoggerAdapter, LogContext, LogLevel } from './types.js';
import { createLoggerAdapter } from './adapters/index.js';

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

@Injectable()
export class LoggerService implements LoggerAdapter {
    private readonly adapter: LoggerAdapter;
    private readonly minLevel: number;

    constructor(
        @Optional() @Inject('LOGGER_ADAPTER') adapter?: LoggerAdapter
    ) {
        this.adapter = adapter ?? createLoggerAdapter();
        const configLevel = (process.env['LOG_LEVEL'] as LogLevel) ?? 'info';
        this.minLevel = LOG_LEVELS[configLevel] ?? LOG_LEVELS.info;
    }

    debug(message: string, context?: LogContext): void {
        if (this.minLevel <= LOG_LEVELS.debug) {
            this.adapter.debug(message, context);
        }
    }

    info(message: string, context?: LogContext): void {
        if (this.minLevel <= LOG_LEVELS.info) {
            this.adapter.info(message, context);
        }
    }

    warn(message: string, context?: LogContext): void {
        if (this.minLevel <= LOG_LEVELS.warn) {
            this.adapter.warn(message, context);
        }
    }

    error(message: string, context?: LogContext, trace?: string): void {
        // Error is always logged
        this.adapter.error(message, context, trace);
    }

    createChild(baseContext: LogContext): LoggerAdapter {
        return this.adapter.createChild(baseContext);
    }

    setMetadata(key: string, value: unknown): void {
        this.adapter.setMetadata(key, value);
    }

    /**
     * Create a scoped logger for a specific component
     */
    forContext(name: string): LoggerAdapter {
        return this.createChild({ component: name });
    }
}
