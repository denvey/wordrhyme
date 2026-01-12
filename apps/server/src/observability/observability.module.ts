/**
 * Observability Module
 *
 * Core observability infrastructure for WordRhyme CMS.
 * Provides structured logging, request tracing, metrics, and error tracking.
 */
import { Module, Global, DynamicModule } from '@nestjs/common';
import { LoggerService } from './logger.service.js';
import { TraceService } from './trace.service.js';
import { MetricsServiceImpl } from './metrics.service.js';
import { ErrorTrackerService, LocalErrorBackend } from './error-tracker.service.js';
import { ObservabilityInterceptor } from './observability.interceptor.js';
import { MetricsController } from './metrics.controller.js';
import { createLoggerAdapter, type AdapterType } from './adapters/index.js';

@Global()
@Module({})
export class ObservabilityModule {
    static forRoot(options?: {
        logAdapter?: AdapterType;
    }): DynamicModule {
        const logAdapter = options?.logAdapter ?? (process.env['LOG_ADAPTER'] as AdapterType) ?? 'nestjs';

        return {
            module: ObservabilityModule,
            controllers: [MetricsController],
            providers: [
                // Logger adapter provider
                {
                    provide: 'LOGGER_ADAPTER',
                    useFactory: () => createLoggerAdapter(logAdapter),
                },
                // Core services
                LoggerService,
                TraceService,
                MetricsServiceImpl,
                {
                    provide: 'METRICS_SERVICE',
                    useExisting: MetricsServiceImpl,
                },
                // Error tracking
                LocalErrorBackend,
                ErrorTrackerService,
                {
                    provide: 'ERROR_TRACKER',
                    useExisting: ErrorTrackerService,
                },
                // Interceptor
                ObservabilityInterceptor,
            ],
            exports: [
                'LOGGER_ADAPTER',
                LoggerService,
                TraceService,
                MetricsServiceImpl,
                'METRICS_SERVICE',
                ErrorTrackerService,
                'ERROR_TRACKER',
                ObservabilityInterceptor,
            ],
        };
    }
}
