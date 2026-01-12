/**
 * Observability Module Exports
 */

// Types
export * from './types.js';

// Services
export { LoggerService } from './logger.service.js';
export { TraceService } from './trace.service.js';
export { MetricsServiceImpl } from './metrics.service.js';
export { ErrorTrackerService, LocalErrorBackend } from './error-tracker.service.js';

// Plugin Logger
export {
    createPluginLogger,
    isDebugEnabled,
    enablePluginDebug,
    disablePluginDebug,
    getPluginDebugConfig,
} from './plugin-logger.js';

// Adapters
export { createLoggerAdapter, NestJSLoggerAdapter } from './adapters/index.js';

// Interceptor & Controller
export { ObservabilityInterceptor } from './observability.interceptor.js';
export { MetricsController } from './metrics.controller.js';

// Decorators
export { Traced, withSpan, type TracedOptions } from './traced.decorator.js';

// Health Monitoring
export {
    PluginHealthMonitor,
    getHealthMonitor,
    DEFAULT_HEALTH_CONFIG,
    type PluginHealthState,
    type PluginHealthStatus,
    type HealthConfig,
} from './plugin-health-monitor.js';

// Module
export { ObservabilityModule } from './observability.module.js';
