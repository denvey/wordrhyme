# Implementation Tasks

## 1. Core Infrastructure Setup

- [x] 1.1 Create `apps/server/src/observability/` module directory
- [x] 1.2 Install dependencies: `prom-client` for Prometheus metrics
- [x] 1.3 Enhance `RequestContext` interface with `traceId`, `spanId`, `parentSpanId` fields
- [x] 1.4 Create `ObservabilityModule` with NestJS module definition

## 2. Pluggable Logger Adapter Architecture

- [x] 2.1 Define `LoggerAdapter` interface with methods: `debug`, `info`, `warn`, `error`, `createChild`
- [x] 2.2 Define `LogContext` interface for structured context fields
- [x] 2.3 Create `LoggerModule` with dynamic adapter selection via `LOG_ADAPTER` env var
- [x] 2.4 Implement adapter factory with dynamic import and clear error messages
- [x] 2.5 Create adapter registration mechanism for future custom adapters
- [ ] 2.6 Add unit tests for adapter interface compliance
- [ ] 2.7 Add integration tests for adapter switching

## 3. NestJS Default Logger Adapter

- [x] 3.1 Create `NestJSLoggerAdapter` implementing `LoggerAdapter` interface
- [x] 3.2 Implement JSON formatting for `LOG_FORMAT=json` mode
- [x] 3.3 Implement pretty formatting for development mode
- [x] 3.4 Implement `createChild()` with context binding
- [x] 3.5 Add automatic context injection from AsyncLocalStorage
- [ ] 3.6 Add unit tests for NestJS adapter
- [x] 3.7 Verify zero additional dependencies required

## 4. Pino Logger Adapter Package (@wordrhyme/logger-pino)

- [x] 4.1 Create `packages/logger-pino/` package directory
- [x] 4.2 Initialize package.json with dependencies: `pino`, `nestjs-pino`, `pino-pretty`
- [x] 4.3 Create `PinoLoggerAdapter` implementing `LoggerAdapter` interface
- [x] 4.4 Configure Pino with optimal JSON formatters
- [x] 4.5 Implement Pino child logger for `createChild()`
- [x] 4.6 Add `pino-pretty` integration for development mode (auto-detect `NODE_ENV`)
- [x] 4.7 Integrate with Fastify's native Pino support
- [x] 4.8 Add async logging configuration for non-blocking output
- [x] 4.9 Export adapter class for dynamic loading by Core
- [ ] 4.10 Add performance benchmarks (target: < 0.5ms per log)
- [ ] 4.11 Add unit tests for Pino adapter
- [x] 4.12 Add README with installation and usage instructions
- [x] 4.13 Configure package build and publish scripts

## 5. Structured Logging System

- [x] 5.1 Create `LoggerService` class wrapping the selected adapter
- [x] 5.2 Implement log level filtering based on environment config
- [x] 5.3 Create automatic context injection from AsyncLocalStorage
- [x] 5.4 Add plugin attribution logic (auto-inject `pluginId` from context)
- [x] 5.5 Update existing `logger.capability.ts` to use new LoggerService
- [ ] 5.6 Add unit tests for structured logging with different log levels
- [ ] 5.7 Add integration test for plugin log attribution

## 6. Request Tracing Implementation

- [x] 6.1 Create `TraceService` class for TraceId/SpanId generation
- [x] 6.2 Implement HTTP middleware to initialize trace context on request entry
- [x] 6.3 Implement W3C `traceparent` header parsing (version-traceId-spanId-flags format)
- [x] 6.4 Generate new trace when no `traceparent` header present
- [x] 6.5 Create `@Traced()` decorator for automatic span creation in service methods (Core only)
- [x] 6.6 Update `async-local-storage.ts` context to include trace fields
- [x] 6.7 Inject trace context into tRPC context (modify `apps/server/src/trpc/context.ts`)
- [ ] 6.8 Add trace propagation tests across Core → Plugin → Core boundaries
- [ ] 6.9 Document trace header format and propagation rules

## 7. Metrics Collection System

- [x] 7.1 Create `MetricsService` class using `prom-client`
- [x] 7.2 Implement Prometheus exposition endpoint at `/metrics` (with auth)
- [x] 7.3 Add HTTP request duration histogram with automatic labeling (Core only)
- [x] 7.4 Add plugin capability invocation counter metric
- [x] 7.5 Create plugin metrics API: `ctx.metrics.increment()` only (per governance §4.1)
- [x] 7.6 Implement label whitelist validation (only allow: model, type, status)
- [x] 7.7 Reject plugin attempts to use histogram/gauge/observe/set methods
- [x] 7.8 Implement automatic tenant/plugin label injection
- [x] 7.9 Add metric namespace enforcement (Core vs Plugin metrics)
- [ ] 7.10 Create metrics scraping integration test with sample Prometheus config
- [ ] 7.11 Document available metrics and their labels

## 8. Error Tracking Integration

- [x] 8.1 Create `ErrorTrackerService` abstraction layer
- [x] 8.2 Implement local file backend for error logging (default for self-hosted)
- [ ] 8.3 Add optional Sentry backend integration (for SaaS)
- [x] 8.4 Create global exception filter that captures uncaught errors
- [x] 8.5 Implement manual error reporting API: `errorTracker.captureError()`
- [x] 8.6 Add automatic context enrichment (trace, tenant, plugin attribution)
- [x] 8.7 Create plugin error isolation logic
- [x] 8.8 Add error tracking configuration via environment variables
- [ ] 8.9 Write tests for error capture and context enrichment

## 9. Plugin API Integration (Governance Compliant)

- [x] 9.1 Update `@wordrhyme/plugin` package with new `PluginContext` types
- [x] 9.2 Define `PluginLogger` interface with `info`, `warn`, `error`, and optional `debug` (controlled)
- [x] 9.3 Implement `PluginDebugConfig` for tenant admin controlled debug enablement
- [x] 9.4 Create API endpoint `POST /api/plugins/{pluginId}/debug` for enabling debug mode
- [x] 9.5 Implement debug mode expiry mechanism (max 24 hours, auto-disable)
- [x] 9.6 Define `PluginMetrics` interface with only `increment()` method (no histogram/gauge per §4.1)
- [x] 9.7 Implement label whitelist enforcement in `PluginMetrics`
- [x] 9.8 Add `ctx.trace` API with read-only `getTraceId()`, `getSpanId()` methods
- [x] 9.9 Ensure plugins cannot create spans or modify trace context (per §5)
- [x] 9.10 Update plugin capability factory to inject restricted observability services
- [ ] 9.11 Add plugin API usage examples in documentation
- [ ] 9.12 Create sample plugin demonstrating compliant metrics and logging usage
- [ ] 9.13 Add validation that plugins cannot import observability libs directly
- [ ] 9.14 Add tests for governance compliance (controlled debug, restrict histogram, etc.)

## 10. NestJS Integration

- [x] 10.1 Create `ObservabilityInterceptor` for automatic request instrumentation
- [x] 10.2 Register interceptor globally in `app.module.ts`
- [ ] 10.3 Add Fastify request ID plugin integration
- [x] 10.4 Update `main.ts` to initialize observability middleware
- [x] 10.5 Add graceful shutdown for metrics flushing
- [ ] 10.6 Create NestJS health check endpoint that includes observability status

## 11. Configuration System

- [x] 11.1 Define environment variables for observability config
- [x] 11.2 Create `ObservabilityConfig` interface and validation schema
- [x] 11.3 Implement runtime config loading from env vars
- [x] 11.4 Add config defaults for development vs production
- [ ] 11.5 Document all configuration options in README
- [ ] 11.6 Add config validation tests

## 12. Multi-Tenant Isolation

- [ ] 12.1 Implement tenant-scoped log filtering in log query API
- [x] 12.2 Add tenant label to all metrics automatically
- [ ] 12.3 Create tenant isolation tests for logs and metrics
- [ ] 12.4 Add cross-tenant access prevention tests
- [ ] 12.5 Document tenant isolation guarantees

## 13. Health Monitoring & Degradation

- [x] 13.1 Create `PluginHealthMonitor` service
- [x] 13.2 Implement error rate calculation (sliding window)
- [x] 13.3 Define health state machine: healthy → degraded → suspended
- [x] 13.4 Add health transition thresholds (configurable)
- [x] 13.5 Create health status API endpoint: `GET /api/plugins/{id}/health`
- [x] 13.6 Implement rate limiting for degraded plugins
- [x] 13.7 Implement circuit breaker for suspended plugins
- [x] 13.8 Add health status UI in admin panel
- [ ] 13.9 Add health monitoring tests with error injection

## 14. Testing & Validation

- [ ] 14.1 Create unit tests for all new observability services
- [ ] 14.2 Add integration tests for trace propagation (W3C traceparent only)
- [ ] 14.3 Add integration tests for metrics collection
- [ ] 14.4 Add E2E test for complete observability flow
- [ ] 14.5 Add performance benchmarks for logging overhead
- [ ] 14.6 Test with multiple concurrent tenants
- [ ] 14.7 Test error tracking under high load
- [ ] 14.8 Validate compliance with `OBSERVABILITY_GOVERNANCE.md`
- [ ] 14.9 Test adapter switching between NestJS and Pino
- [ ] 14.10 Test plugin debug mode enablement and expiry

## 15. Documentation & Examples

- [ ] 15.1 Create observability architecture diagram
- [ ] 15.2 Write plugin developer guide for using observability APIs
- [ ] 15.3 Document metrics naming conventions
- [ ] 15.4 Create trace visualization guide (with Jaeger/Zipkin)
- [ ] 15.5 Write production deployment guide for observability
- [ ] 15.6 Create troubleshooting guide for common observability issues
- [ ] 15.7 Add example Prometheus/Grafana dashboard configurations
- [ ] 15.8 Document SaaS vs self-hosted observability differences
- [ ] 15.9 Document logger adapter selection guide (NestJS default vs @wordrhyme/logger-pino)

## 16. Migration & Rollout

- [ ] 16.1 Create migration guide for existing plugins
- [x] 16.2 Add backward compatibility layer for old logger API
- [ ] 16.3 Create feature flag for gradual rollout
- [ ] 16.4 Plan phased rollout: dev → staging → production
- [ ] 16.5 Create rollback plan in case of issues
- [ ] 16.6 Monitor production metrics after rollout
