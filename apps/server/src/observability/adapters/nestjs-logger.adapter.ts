/**
 * NestJS Default Logger Adapter
 *
 * Zero-dependency logger adapter using NestJS built-in Logger.
 * Supports both JSON and pretty formatting.
 */
import { Logger } from '@nestjs/common';
import type { LoggerAdapter, LogContext } from '../types.js';
import { getContext } from '../../context/async-local-storage.js';

export class NestJSLoggerAdapter implements LoggerAdapter {
    private readonly logger: Logger;
    private baseContext: LogContext = {};
    private metadata: Record<string, unknown> = {};

    constructor(context?: string) {
        this.logger = new Logger(context ?? 'App');
    }

    debug(message: string, context?: LogContext): void {
        const merged = this.mergeContext(context);
        this.logger.debug(this.formatMessage(message, merged));
    }

    info(message: string, context?: LogContext): void {
        const merged = this.mergeContext(context);
        this.logger.log(this.formatMessage(message, merged));
    }

    warn(message: string, context?: LogContext): void {
        const merged = this.mergeContext(context);
        this.logger.warn(this.formatMessage(message, merged));
    }

    error(message: string, context?: LogContext, trace?: string): void {
        const merged = this.mergeContext(context);
        this.logger.error(this.formatMessage(message, merged), trace);
    }

    createChild(baseContext: LogContext): LoggerAdapter {
        const child = new NestJSLoggerAdapter(
            baseContext.pluginId ? `Plugin:${baseContext.pluginId}` : undefined
        );
        child.baseContext = { ...this.baseContext, ...baseContext };
        child.metadata = { ...this.metadata };
        return child;
    }

    setMetadata(key: string, value: unknown): void {
        this.metadata[key] = value;
    }

    /**
     * Merge context from multiple sources:
     * 1. AsyncLocalStorage request context (auto-injected)
     * 2. Base context from parent logger
     * 3. Call-time context
     * 4. Metadata
     */
    private mergeContext(callContext?: LogContext): LogContext {
        // Get auto-injected context from AsyncLocalStorage
        const autoContext: Record<string, unknown> = {};
        try {
            const reqCtx = getContext();
            if (reqCtx.requestId) autoContext['requestId'] = reqCtx.requestId;
            if (reqCtx.traceId) autoContext['traceId'] = reqCtx.traceId;
            if (reqCtx.tenantId) autoContext['tenantId'] = reqCtx.tenantId;
            if (reqCtx.userId) autoContext['userId'] = reqCtx.userId;
        } catch {
            // Outside request scope - no auto context
        }

        return {
            ...autoContext,
            ...this.baseContext,
            ...this.metadata,
            ...callContext,
        } as LogContext;
    }

    /**
     * Format message based on LOG_FORMAT environment variable
     */
    private formatMessage(message: string, context: LogContext): string {
        const logFormat = process.env['LOG_FORMAT'] ?? 'json';

        if (logFormat === 'json') {
            // JSON format for log aggregators
            const logEntry = {
                msg: message,
                time: Date.now(),
                ...this.filterEmptyValues(context),
            };
            return JSON.stringify(logEntry);
        }

        // Pretty format for development
        const contextStr = this.formatContextPretty(context);
        return contextStr ? `${message} ${contextStr}` : message;
    }

    /**
     * Filter out undefined/null values from context
     */
    private filterEmptyValues(context: LogContext): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(context)) {
            if (value !== undefined && value !== null) {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Format context for pretty printing
     */
    private formatContextPretty(context: LogContext): string {
        const filtered = this.filterEmptyValues(context);
        const entries = Object.entries(filtered);
        if (entries.length === 0) return '';

        return entries
            .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
            .join(' ');
    }
}
