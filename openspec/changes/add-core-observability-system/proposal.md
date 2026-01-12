# Change: Add Core Observability System

## Why

WordRhyme CMS currently has basic logging capability for plugins, but lacks a comprehensive observability system required for production SaaS operations. We need:

- **Structured Logging** with JSON formatting and consistent log levels
- **Request Tracing** with TraceId/SpanId propagation across Core and Plugin boundaries
- **Performance Metrics** compatible with Prometheus for monitoring and alerting
- **Error Tracking** integration to capture and aggregate errors for debugging

Without a unified observability system, we cannot:
- Debug cross-plugin request flows effectively
- Monitor system health and performance in production
- Meet SaaS audit and compliance requirements
- Provide plugin developers with proper debugging tools
- Support the billing/metering system with accurate usage metrics

## What Changes

### Core Observability Infrastructure
- Implement structured JSON logging with level-based filtering (debug/info/warn/error)
- Create Request Context propagation using AsyncLocalStorage with TraceId/SpanId
- Build Metrics collection system compatible with Prometheus exposition format
- Integrate Error Tracking service for centralized error aggregation
- Implement automatic context injection (tenantId, pluginId, userId, etc.)

### Plugin Isolation & Attribution
- Enforce plugin-scoped logging through Observability API
- Automatically attribute all logs/metrics/traces to originating plugin
- Prevent plugins from accessing other plugins' observability data
- Implement TraceId propagation across Plugin → Core → Plugin boundaries

### NestJS Integration
- Create NestJS Logger interceptor for automatic request context injection
- Implement HTTP middleware for TraceId generation and propagation
- Add NestJS metrics decorators for automatic endpoint instrumentation
- Integrate with existing `RequestContext` from `async-local-storage.ts`

### Governance Compliance
- Align implementation with `OBSERVABILITY_GOVERNANCE.md` contracts
- Enforce plugin restrictions (no direct stdout, no custom exporters)
- Support both SaaS (centralized) and self-hosted (local) deployments
- Enable future AI plugin governance through metrics attribution

## Impact

### Affected Specs
- **NEW**: `core-observability` - Complete observability system specification
- **MODIFIED**: `plugin-api` - Enhanced with metrics and tracing context
- **MODIFIED**: `nestjs-integration` - Add observability interceptors and middleware

### Affected Code
- `apps/server/src/plugins/capabilities/logger.capability.ts` - Enhance with structured logging
- `apps/server/src/context/async-local-storage.ts` - Add TraceId/SpanId to RequestContext
- `apps/server/src/trpc/context.ts` - Inject trace context into tRPC
- `apps/server/src/main.ts` - Add observability middleware
- `packages/plugin/src/types.ts` - Add Metrics API to PluginContext
- **NEW**: `apps/server/src/observability/` - Core observability module

### Dependencies
- Add `pino` (fast JSON logger) or use built-in NestJS logger with custom formatter
- Add `prom-client` for Prometheus metrics exposition
- Add `opentelemetry` SDK (optional, for advanced tracing)
- Consider Sentry/Rollbar SDK for error tracking (optional)

### Breaking Changes
- **None** - This is an additive change. Existing plugin logger API remains compatible.
- Plugin logger will be enhanced with automatic trace context injection (transparent to plugins)

### Migration Notes
- Existing plugins using `ctx.logger` will automatically benefit from trace context
- No plugin code changes required
- Configuration required for production deployments (log levels, metrics endpoints)

## Open Questions

1. **Logging Library Choice**: Use Pino (high performance) vs enhance NestJS built-in logger?
   - Recommendation: Start with enhanced NestJS logger, switch to Pino if performance bottleneck

2. **Error Tracking**: Integrate Sentry immediately or build abstraction layer first?
   - Recommendation: Build abstraction, allow Sentry as optional backend

3. **Tracing Scope**: Implement full OpenTelemetry traces or start with TraceId propagation only?
   - Recommendation: Start with TraceId/SpanId propagation, add full OTEL spans in v2

4. **Metrics Storage**: Where to persist historical metrics in self-hosted mode?
   - Recommendation: Prometheus pull model (self-hosted scrapes endpoint), no persistent storage in Core
