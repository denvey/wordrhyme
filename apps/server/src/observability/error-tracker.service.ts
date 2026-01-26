/**
 * Error Tracker Service
 *
 * Abstraction layer for error tracking backends.
 * Supports local file logging and optional Sentry integration.
 */
import { Injectable, Inject, Optional } from '@nestjs/common';
import type { ErrorTracker, ErrorContext } from './types.js';
import { LoggerService } from './logger.service.js';
import { getContext } from '../context/async-local-storage';

/**
 * Local File Error Backend (Default)
 *
 * Logs errors to the logger service for self-hosted deployments.
 */
@Injectable()
export class LocalErrorBackend implements ErrorTracker {
    constructor(private readonly logger: LoggerService) { }

    captureException(error: Error, context?: ErrorContext): void {
        const enrichedContext = this.enrichContext(context);
        this.logger.error(
            `[Error Captured] ${error.message}`,
            {
                ...enrichedContext,
                stack: error.stack,
                errorName: error.name,
            },
            error.stack
        );
    }

    captureMessage(message: string, level: 'info' | 'warning' | 'error'): void {
        const enrichedContext = this.enrichContext();
        switch (level) {
            case 'info':
                this.logger.info(`[Message] ${message}`, enrichedContext);
                break;
            case 'warning':
                this.logger.warn(`[Message] ${message}`, enrichedContext);
                break;
            case 'error':
                this.logger.error(`[Message] ${message}`, enrichedContext);
                break;
        }
    }

    setUser(_user: { id: string; email?: string }): void {
        // No-op for local backend - user is captured from context
    }

    setTag(_key: string, _value: string): void {
        // No-op for local backend
    }

    /**
     * Enrich context with request information from AsyncLocalStorage
     */
    private enrichContext(context?: ErrorContext): Record<string, unknown> {
        let reqContext: Record<string, unknown> = {};
        try {
            const ctx = getContext();
            reqContext = {
                requestId: ctx.requestId,
                traceId: ctx.traceId,
                organizationId: ctx.organizationId,
                userId: ctx.userId,
            };
        } catch {
            // Outside request scope
        }

        return {
            ...reqContext,
            ...context?.extra,
            tags: context?.tags,
            level: context?.level ?? 'error',
        };
    }
}

/**
 * Error Tracker Service
 *
 * Main service that delegates to the configured backend.
 */
@Injectable()
export class ErrorTrackerService implements ErrorTracker {
    private readonly backend: ErrorTracker;

    constructor(
        @Optional() @Inject('ERROR_BACKEND') backend?: ErrorTracker,
        @Optional() logger?: LoggerService
    ) {
        // Use provided backend or create local backend
        this.backend = backend ?? new LocalErrorBackend(
            logger ?? new LoggerService()
        );
    }

    captureException(error: Error, context?: ErrorContext): void {
        this.backend.captureException(error, context);
    }

    captureMessage(message: string, level: 'info' | 'warning' | 'error'): void {
        this.backend.captureMessage(message, level);
    }

    setUser(user: { id: string; email?: string }): void {
        this.backend.setUser(user);
    }

    setTag(key: string, value: string): void {
        this.backend.setTag(key, value);
    }

    /**
     * Create a plugin-scoped error tracker
     * Automatically adds pluginId to all error contexts
     */
    forPlugin(pluginId: string, organizationId: string): ErrorTracker {
        const self = this;
        return {
            captureException(error: Error, context?: ErrorContext): void {
                self.captureException(error, {
                    ...context,
                    tags: {
                        ...context?.tags,
                        pluginId,
                        organizationId,
                    },
                });
            },
            captureMessage(message: string, level: 'info' | 'warning' | 'error'): void {
                self.captureMessage(`[${pluginId}] ${message}`, level);
            },
            setUser(user: { id: string; email?: string }): void {
                self.setUser(user);
            },
            setTag(key: string, value: string): void {
                self.setTag(key, value);
            },
        };
    }
}
