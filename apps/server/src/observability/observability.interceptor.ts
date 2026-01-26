/**
 * Observability Interceptor
 *
 * NestJS interceptor for automatic request instrumentation:
 * - Trace context initialization
 * - Request duration metrics
 * - Error tracking
 */
import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { TraceService } from './trace.service.js';
import { MetricsServiceImpl } from './metrics.service.js';
import { LoggerService } from './logger.service.js';
import { ErrorTrackerService } from './error-tracker.service.js';
import { requestContextStorage, type RequestContext } from '../context/async-local-storage';

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
    constructor(
        private readonly traceService: TraceService,
        private readonly metricsService: MetricsServiceImpl,
        private readonly logger: LoggerService,
        private readonly errorTracker: ErrorTrackerService
    ) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const startTime = process.hrtime.bigint();
        const contextType = context.getType();

        // Only handle HTTP requests
        if (contextType !== 'http') {
            return next.handle();
        }

        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();

        // Extract or create trace context
        const traceContext = this.traceService.extractOrCreate(request.headers);

        // Get existing request context or create minimal one
        const existingContext = requestContextStorage.getStore();

        // Merge trace context into request context
        const updatedContext: RequestContext = {
            ...(existingContext ?? {
                requestId: crypto.randomUUID(),
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            }),
            traceId: traceContext.traceId,
            spanId: traceContext.spanId,
            parentSpanId: traceContext.parentSpanId,
        };

        // Extract route info for metrics
        const method = request.method;
        const route = request.routerPath ?? request.url?.split('?')[0] ?? 'unknown';
        const organizationId = updatedContext.organizationId ?? 'unknown';

        // Log request start
        this.logger.debug('Request started', {
            method,
            route,
            traceId: traceContext.traceId,
            spanId: traceContext.spanId,
        });

        // Run within updated context
        return new Observable((subscriber) => {
            requestContextStorage.run(updatedContext, () => {
                next.handle().pipe(
                    tap(() => {
                        // Record successful request metrics
                        const durationNs = process.hrtime.bigint() - startTime;
                        const durationSec = Number(durationNs) / 1e9;
                        const status = response.statusCode?.toString() ?? '200';

                        this.metricsService.observeHistogram(
                            'http_request_duration_seconds',
                            durationSec,
                            { method, route, status, organizationId }
                        );

                        this.metricsService.incrementCounter(
                            'http_requests_total',
                            { method, route, status, organizationId }
                        );

                        this.logger.debug('Request completed', {
                            method,
                            route,
                            status,
                            durationMs: Math.round(durationSec * 1000),
                            traceId: traceContext.traceId,
                        });
                    }),
                    catchError((error) => {
                        // Record error metrics
                        const durationNs = process.hrtime.bigint() - startTime;
                        const durationSec = Number(durationNs) / 1e9;
                        const status = error.status?.toString() ?? '500';

                        this.metricsService.observeHistogram(
                            'http_request_duration_seconds',
                            durationSec,
                            { method, route, status, organizationId }
                        );

                        this.metricsService.incrementCounter(
                            'http_requests_total',
                            { method, route, status, organizationId }
                        );

                        // Capture error
                        this.errorTracker.captureException(error, {
                            tags: { method, route, status },
                        });

                        this.logger.error('Request failed', {
                            method,
                            route,
                            status,
                            error: error.message,
                            durationMs: Math.round(durationSec * 1000),
                            traceId: traceContext.traceId,
                        });

                        return throwError(() => error);
                    })
                ).subscribe(subscriber);
            });
        });
    }
}
