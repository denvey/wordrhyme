/**
 * Pino Logger Adapter Types
 *
 * Re-defines the LoggerAdapter interface for standalone package usage.
 * These types mirror the Core observability types.
 */

/**
 * Log context with automatic and custom fields
 */
export interface LogContext {
    // Auto-injected fields (readonly, cannot be overwritten)
    readonly requestId?: string;
    readonly traceId?: string;
    readonly spanId?: string;
    readonly tenantId?: string;
    readonly pluginId?: string;
    readonly userId?: string;

    // Custom fields
    [key: string]: unknown;
}

/**
 * Core Logger Adapter Interface
 *
 * This interface must match the Core observability LoggerAdapter interface.
 */
export interface LoggerAdapter {
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext, trace?: string): void;

    /**
     * Create a child logger with bound context
     */
    createChild(baseContext: LogContext): LoggerAdapter;

    /**
     * Set metadata that will be included in all subsequent logs
     */
    setMetadata(key: string, value: unknown): void;
}
