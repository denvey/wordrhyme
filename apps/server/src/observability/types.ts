/**
 * Observability Types
 *
 * Core type definitions for the observability system including:
 * - Logger adapters and interfaces
 * - Metrics types
 * - Trace context
 * - Plugin observability APIs
 */

// ============================================================================
// Logger Types
// ============================================================================

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
 * Log metadata for structured logging
 */
export type LogMeta = Record<string, unknown>;

/**
 * Core Logger Adapter Interface
 *
 * Internal interface for logger implementations (NestJS, Pino, etc.)
 * Supports all log levels including debug for Core use.
 */
export interface LoggerAdapter {
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext, trace?: string): void;

    /**
     * Create a child logger with bound context
     * All logs from the child will include the base context
     */
    createChild(baseContext: LogContext): LoggerAdapter;

    /**
     * Set metadata that will be included in all subsequent logs
     */
    setMetadata(key: string, value: unknown): void;
}

/**
 * Plugin Logger Interface (Restricted)
 *
 * Per OBSERVABILITY_GOVERNANCE §3.3:
 * - info, warn, error: Always available
 * - debug: Only available when explicitly enabled by tenant admin
 */
export interface PluginLogger {
    info(message: string, meta?: LogMeta): void;
    warn(message: string, meta?: LogMeta): void;
    error(message: string, meta?: LogMeta): void;
    /**
     * Debug logging - only available when debug mode is enabled
     * Calls are silently ignored when debug mode is disabled
     */
    debug?(message: string, meta?: LogMeta): void;
}

/**
 * Plugin Debug Configuration
 *
 * Tenant admin controlled debug mode with mandatory expiry
 */
export interface PluginDebugConfig {
    pluginId: string;
    tenantId: string;
    enabled: boolean;
    expiresAt: Date;
    enabledBy: string;
    reason: string | undefined;
}

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Allowed labels for plugin metrics
 *
 * Per OBSERVABILITY_GOVERNANCE §4.1:
 * Only these labels are allowed to prevent cardinality explosion
 */
export type AllowedLabels = {
    model?: string;
    type?: string;
    status?: 'success' | 'failure';
};

/**
 * Plugin Metrics Interface (Restricted)
 *
 * Per OBSERVABILITY_GOVERNANCE §4.1:
 * - Only increment() for discrete event counters
 * - No histogram/gauge/observe/set methods
 */
export interface PluginMetrics {
    /**
     * Increment a counter metric
     * @param name - Metric name (will be prefixed with plugin_)
     * @param labels - Optional labels (whitelist enforced)
     * @param value - Increment value (default: 1)
     */
    increment(name: string, labels?: AllowedLabels, value?: number): void;
}

/**
 * Core Metrics Service Interface
 *
 * Full metrics API for Core use only
 */
export interface MetricsService {
    // Counter
    incrementCounter(name: string, labels?: Record<string, string>, value?: number): void;

    // Histogram
    observeHistogram(name: string, value: number, labels?: Record<string, string>): void;

    // Gauge
    setGauge(name: string, value: number, labels?: Record<string, string>): void;
    incrementGauge(name: string, labels?: Record<string, string>, value?: number): void;
    decrementGauge(name: string, labels?: Record<string, string>, value?: number): void;

    // Plugin-scoped metrics (restricted)
    createPluginMetrics(pluginId: string, tenantId: string): PluginMetrics;

    // Prometheus exposition
    getMetrics(): Promise<string>;
}

// ============================================================================
// Trace Types
// ============================================================================

/**
 * W3C Trace Context
 *
 * Format: traceparent = 00-{traceId}-{spanId}-{flags}
 * - traceId: 32 hex chars (128-bit)
 * - spanId: 16 hex chars (64-bit)
 */
export interface TraceContext {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    sampled: boolean;
}

/**
 * Plugin Trace API (Read-Only)
 *
 * Per OBSERVABILITY_GOVERNANCE §5:
 * Plugins can only read trace context, cannot create spans
 */
export interface PluginTraceContext {
    getTraceId(): string | undefined;
    getSpanId(): string | undefined;
}

// ============================================================================
// Error Tracking Types
// ============================================================================

/**
 * Error context for error tracking
 */
export interface ErrorContext {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    user?: { id: string; email?: string };
    level?: 'fatal' | 'error' | 'warning' | 'info';
}

/**
 * Error Tracker Interface
 *
 * Abstraction layer for error tracking backends (local, Sentry, etc.)
 */
export interface ErrorTracker {
    captureException(error: Error, context?: ErrorContext): void;
    captureMessage(message: string, level: 'info' | 'warning' | 'error'): void;
    setUser(user: { id: string; email?: string }): void;
    setTag(key: string, value: string): void;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Log format options
 */
export type LogFormat = 'json' | 'pretty';

/**
 * Log level options
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger adapter type
 */
export type LogAdapterType = 'nestjs' | 'pino';

/**
 * Error tracker backend type
 */
export type ErrorTrackerType = 'local' | 'sentry';

/**
 * Observability Configuration
 */
export interface ObservabilityConfig {
    // Logging
    logLevel: LogLevel;
    logFormat: LogFormat;
    logAdapter: LogAdapterType;

    // Metrics
    metricsEnabled: boolean;
    metricsPath: string;
    metricsAuthToken?: string;

    // Error Tracking
    errorTracker: ErrorTrackerType;
    sentryDsn?: string;

    // Health Monitoring
    healthDegradedErrorRate: number;
    healthSuspendedErrorCount: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_OBSERVABILITY_CONFIG: ObservabilityConfig = {
    logLevel: 'info',
    logFormat: 'json',
    logAdapter: 'nestjs',
    metricsEnabled: true,
    metricsPath: '/metrics',
    errorTracker: 'local',
    healthDegradedErrorRate: 0.1,
    healthSuspendedErrorCount: 5,
};
