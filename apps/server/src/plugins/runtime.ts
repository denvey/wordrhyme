import { Injectable, Logger } from '@nestjs/common';
import type { PluginContext } from '@wordrhyme/plugin';

/**
 * Plugin execution result
 */
export interface PluginExecutionResult<T = unknown> {
    success: boolean;
    result?: T | undefined;
    error?: Error | undefined;
    duration: number;
}

/**
 * Configuration for LogicalIsolationRuntime
 */
export interface RuntimeConfig {
    /** Timeout for lifecycle hooks in milliseconds (default: 30000) */
    lifecycleTimeout: number;
    /** Timeout for request handlers in milliseconds (default: 10000) */
    requestTimeout: number;
}

const DEFAULT_CONFIG: RuntimeConfig = {
    lifecycleTimeout: 30000,  // 30 seconds for lifecycle hooks
    requestTimeout: 10000,    // 10 seconds for request handlers
};

/**
 * LogicalIsolationRuntime - MVP plugin runtime adapter
 * 
 * Implements in-process execution with:
 * - try/catch error boundaries
 * - Wall-time execution timeouts
 * - Error logging
 * 
 * This is a simplified runtime for MVP. Future versions will implement
 * Worker Thread or WASM isolation as per RUNTIME_GOVERNANCE.md.
 */
@Injectable()
export class LogicalIsolationRuntime {
    private readonly logger = new Logger(LogicalIsolationRuntime.name);
    private config: RuntimeConfig;

    constructor() {
        this.config = DEFAULT_CONFIG;
    }

    /**
     * Execute a lifecycle hook with timeout and error boundary
     */
    async executeLifecycleHook(
        pluginId: string,
        hookName: string,
        hookFn: (ctx: PluginContext) => Promise<void> | void,
        ctx: PluginContext
    ): Promise<PluginExecutionResult<void>> {
        const startTime = Date.now();

        try {
            // Execute with timeout
            await this.withTimeout(
                Promise.resolve(hookFn(ctx)),
                this.config.lifecycleTimeout,
                `${pluginId}.${hookName}`
            );

            const duration = Date.now() - startTime;
            this.logger.log(`✅ ${pluginId}.${hookName} completed in ${duration}ms`);

            return { success: true, duration };
        } catch (error) {
            const duration = Date.now() - startTime;
            const err = error instanceof Error ? error : new Error(String(error));

            this.logger.error(
                `❌ ${pluginId}.${hookName} failed after ${duration}ms: ${err.message}`,
                err.stack
            );

            return { success: false, error: err, duration };
        }
    }

    /**
     * Execute a request handler with timeout and error boundary
     */
    async executeHandler<T>(
        pluginId: string,
        handlerName: string,
        handlerFn: () => Promise<T> | T
    ): Promise<PluginExecutionResult<T>> {
        const startTime = Date.now();

        try {
            const result = await this.withTimeout(
                Promise.resolve(handlerFn()),
                this.config.requestTimeout,
                `${pluginId}.${handlerName}`
            );

            const duration = Date.now() - startTime;
            return { success: true, result, duration };
        } catch (error) {
            const duration = Date.now() - startTime;
            const err = error instanceof Error ? error : new Error(String(error));

            this.logger.error(`❌ ${pluginId}.${handlerName} failed: ${err.message}`);
            return { success: false, error: err, duration };
        }
    }

    /**
     * Wrap a promise with a timeout
     */
    private withTimeout<T>(
        promise: Promise<T>,
        timeoutMs: number,
        operationName: string
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new PluginTimeoutError(
                    `Plugin operation '${operationName}' timed out after ${timeoutMs}ms`
                ));
            }, timeoutMs);

            promise
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    /**
     * Update runtime configuration
     */
    configure(config: Partial<RuntimeConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

/**
 * Error thrown when plugin execution times out
 */
export class PluginTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PluginTimeoutError';
    }
}
