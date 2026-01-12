# Specification: Core Observability

## ADDED Requirements

### Requirement: Structured Logging

The Core SHALL provide a structured logging system that outputs JSON-formatted logs with consistent schema. All logs MUST include standard fields: `timestamp`, `level`, `message`, `context`, and optional `metadata`. Log levels MUST be: `debug`, `info`, `warn`, `error`.

#### Scenario: Core logging with structured output
- **WHEN** Core components log a message
- **THEN** the log output is JSON-formatted
- **AND** includes `timestamp`, `level`, `message`, `context` fields
- **AND** includes automatic request context fields: `requestId`, `tenantId`, `userId` (when available)

#### Scenario: Plugin logging with attribution
- **WHEN** a plugin logs via `ctx.logger.info('message', { key: 'value' })`
- **THEN** the log output includes `pluginId` and `pluginVersion` automatically
- **AND** includes all request context fields from AsyncLocalStorage
- **AND** the plugin cannot override or forge `pluginId`, `tenantId`, or `userId` fields

#### Scenario: Log level filtering
- **WHEN** log level is set to `warn`
- **THEN** only `warn` and `error` logs are output
- **AND** `info` and `debug` logs are suppressed

### Requirement: Request Tracing Context

The Core SHALL implement request tracing using `traceId` and `spanId` that propagate across all execution boundaries (HTTP → Core → Plugin → Core). TraceId MUST be generated at the request entry point and stored in AsyncLocalStorage. The system SHALL only support W3C `traceparent` header format.

#### Scenario: HTTP request trace initialization with W3C traceparent
- **WHEN** an HTTP request enters the system with a `traceparent` header
- **THEN** the `traceId` and `spanId` are extracted from the W3C traceparent format
- **AND** the trace context is stored in `RequestContext` via AsyncLocalStorage
- **AND** the `traceId` is included in all subsequent logs and metrics

#### Scenario: HTTP request trace generation
- **WHEN** an HTTP request enters the system without a `traceparent` header
- **THEN** a unique `traceId` is generated (W3C compatible 32 hex chars)
- **AND** a unique `spanId` is generated (16 hex chars)
- **AND** the trace context is stored in `RequestContext`

#### Scenario: Cross-boundary trace propagation
- **WHEN** Core calls a Plugin capability
- **THEN** the current `traceId` and `spanId` are accessible to the Plugin (read-only)
- **AND** Plugin logs automatically include the `traceId`
- **AND** when Plugin execution returns to Core, the trace context is preserved

#### Scenario: Nested span creation (Core only)
- **WHEN** a Core service method starts execution
- **THEN** a new `spanId` is generated as a child of the current span
- **AND** the parent `spanId` is recorded for hierarchy tracking
- **AND** all logs within that span include both `traceId` and `spanId`
- **AND** plugins cannot create spans (per governance §5)

### Requirement: Performance Metrics Collection

The Core SHALL provide a metrics system compatible with Prometheus exposition format. Metrics MUST support counter and histogram types. All metrics MUST be automatically labeled with `tenantId`, `pluginId` (when applicable), and `capability` (when applicable).

#### Scenario: HTTP request duration metric
- **WHEN** an HTTP request completes
- **THEN** a histogram metric `http_request_duration_seconds` is recorded
- **AND** the metric includes labels: `method`, `route`, `status`, `tenantId`

#### Scenario: Plugin capability invocation metric
- **WHEN** a plugin capability is invoked (e.g., database query, API call)
- **THEN** a counter metric `plugin_capability_invocations_total` is incremented
- **AND** the metric includes labels: `pluginId`, `capability`, `tenantId`, `success` (boolean)

#### Scenario: Prometheus metrics endpoint
- **WHEN** a Prometheus scraper requests `/metrics`
- **THEN** the endpoint returns metrics in Prometheus text exposition format
- **AND** includes all Core and Plugin metrics
- **AND** the endpoint is protected by authentication/authorization

### Requirement: Error Tracking Integration

The Core SHALL provide an abstraction layer for error tracking that captures exceptions with full context. The system MUST support pluggable backends (e.g., Sentry, Rollbar, local file) and MUST automatically enrich errors with request context, trace IDs, and plugin attribution.

#### Scenario: Uncaught exception capture
- **WHEN** an uncaught exception occurs in Core or Plugin code
- **THEN** the exception is captured by the error tracker
- **AND** includes `traceId`, `spanId`, `requestId`, `tenantId`, `userId`, `pluginId`
- **AND** includes stack trace and error message
- **AND** the exception is logged at `error` level

#### Scenario: Manual error reporting
- **WHEN** code explicitly reports an error via `errorTracker.captureError(error, context)`
- **THEN** the error is sent to the configured backend
- **AND** includes all automatic context fields plus custom `context` data
- **AND** the error is associated with the current trace

#### Scenario: Plugin error isolation
- **WHEN** a plugin throws an error
- **THEN** the error is attributed to that specific `pluginId`
- **AND** the error is visible in the plugin's health dashboard
- **AND** the error does not expose other plugins' data

### Requirement: Plugin Observability API

The Core SHALL expose observability capabilities to plugins through the `PluginContext` API. Plugins MUST only access observability via this API and MUST NOT directly import logging/metrics/tracing libraries. Plugin observability capabilities are intentionally restricted per OBSERVABILITY_GOVERNANCE.md.

#### Scenario: Plugin accesses logger
- **WHEN** a plugin calls `ctx.logger.info(message, meta)`
- **THEN** the log is automatically enriched with `pluginId`, `traceId`, `tenantId`
- **AND** the plugin cannot modify or remove these fields
- **AND** the log level respects the system-wide configuration

#### Scenario: Plugin logger level restriction
- **WHEN** a plugin attempts to call `ctx.logger.debug(message)`
- **THEN** the call is ignored unless debug mode is explicitly enabled for that plugin
- **AND** debug mode can only be enabled by tenant admin via API
- **AND** debug mode has a mandatory expiry time (max 24 hours)
- **AND** enabling debug mode is logged for audit purposes
- **AND** this controlled mechanism prevents log flooding per governance §3.3

#### Scenario: Plugin debug mode enablement
- **WHEN** a tenant admin calls `POST /api/plugins/{pluginId}/debug` with expiry time
- **THEN** debug logging is enabled for that plugin in that tenant
- **AND** the enablement is recorded with: enabledBy, reason, expiresAt
- **AND** after expiry, debug mode is automatically disabled
- **AND** the plugin's `ctx.logger.debug()` calls start outputting logs

#### Scenario: Plugin reports metric
- **WHEN** a plugin calls `ctx.metrics.increment('content.generated', { model: 'gpt-4' })`
- **THEN** a counter metric is recorded with automatic labels: `pluginId`, `tenantId`
- **AND** the metric name is validated against allowed patterns
- **AND** the metric is namespaced under `plugin_` prefix

#### Scenario: Plugin metrics type restriction
- **WHEN** a plugin attempts to use histogram, gauge, or custom time-series metrics
- **THEN** the operation is rejected with a clear error message
- **AND** plugins are only allowed to use `increment()` for discrete event counters
- **AND** this restriction ensures metrics are usable for billing per governance §4.1

#### Scenario: Plugin metrics label restriction
- **WHEN** a plugin provides custom labels to `ctx.metrics.increment()`
- **THEN** only whitelisted label keys are accepted (e.g., `model`, `type`, `status`)
- **AND** arbitrary label dimensions are rejected to prevent cardinality explosion
- **AND** label values are validated and sanitized

#### Scenario: Plugin accesses trace context (read-only)
- **WHEN** a plugin calls `ctx.trace.getTraceId()`
- **THEN** the current request's `traceId` is returned
- **AND** the plugin can use it for external API calls
- **AND** the plugin cannot modify the trace context, create spans, or inject baggage

### Requirement: Observability Configuration

The Core SHALL support runtime configuration of observability behavior via environment variables and config files. Configuration MUST include: log level, log format (JSON/text), metrics endpoint path, error tracker backend, and sampling rates.

#### Scenario: Environment-based log level
- **WHEN** `LOG_LEVEL=warn` is set in environment
- **THEN** only `warn` and `error` logs are output
- **AND** the configuration applies to both Core and Plugin logs

#### Scenario: Metrics endpoint configuration
- **WHEN** `METRICS_ENDPOINT=/internal/metrics` is configured
- **THEN** Prometheus metrics are exposed at that path
- **AND** the default `/metrics` path is disabled

#### Scenario: Error tracker backend selection
- **WHEN** `ERROR_TRACKER=sentry` and `SENTRY_DSN=...` are configured
- **THEN** errors are sent to Sentry
- **AND** the DSN is kept secure and not exposed to plugins

### Requirement: Multi-Tenant Observability Isolation

The Core SHALL ensure that observability data is tenant-scoped. Plugins MUST only access logs and metrics for the current tenant context. Cross-tenant data leakage MUST be prevented by automatic filtering based on `RequestContext.tenantId`.

#### Scenario: Plugin queries own logs
- **WHEN** a plugin in Tenant A requests its logs via API
- **THEN** only logs with `tenantId=A` and `pluginId={plugin}` are returned
- **AND** logs from other tenants or plugins are excluded

#### Scenario: Metrics scoped to tenant
- **WHEN** generating metrics for Tenant A
- **THEN** all metrics include `tenantId=A` label
- **AND** metrics are aggregated per-tenant for billing purposes

#### Scenario: Trace context preserves tenant
- **WHEN** a request spans multiple plugins
- **THEN** all trace spans include the same `tenantId`
- **AND** switching tenant context is not allowed mid-request

### Requirement: Health and Degradation Monitoring

The Core SHALL monitor plugin health based on observability signals (error rate, warning count, latency). Plugins SHALL transition through states: `healthy`, `degraded`, `suspended` based on thresholds. Health state MUST be exposed via API and used for circuit breaker logic.

#### Scenario: Plugin error rate triggers degradation
- **WHEN** a plugin's error rate exceeds 10% over 5 minutes
- **THEN** the plugin state transitions to `degraded`
- **AND** an alert is triggered for the tenant admin
- **AND** the plugin continues to execute with rate limiting

#### Scenario: Plugin suspended due to critical errors
- **WHEN** a plugin throws uncaught exceptions repeatedly (5 in 1 minute)
- **THEN** the plugin state transitions to `suspended`
- **AND** new requests to the plugin are blocked
- **AND** existing requests are allowed to complete

#### Scenario: Health status API
- **WHEN** calling `GET /api/plugins/{pluginId}/health`
- **THEN** the response includes: state, error rate, warning count, latency p99
- **AND** includes recent error samples (last 10 errors)

### Requirement: Pluggable Logger Adapter Architecture

The Core SHALL implement a pluggable logger adapter architecture that allows switching between different logging backends without code changes. The system MUST provide a default adapter (NestJS built-in) that requires zero additional dependencies, and MUST support optional high-performance adapters via separate packages.

#### Scenario: Default logger works without additional dependencies
- **WHEN** the system starts with default configuration (no `LOG_ADAPTER` env var)
- **THEN** the NestJS built-in logger is used
- **AND** no additional npm packages are required
- **AND** structured JSON output is available via `LOG_FORMAT=json`

#### Scenario: Adapter selection via environment variable
- **WHEN** `LOG_ADAPTER=pino` is set in environment
- **THEN** the Pino adapter is loaded dynamically
- **AND** if `@wordrhyme/logger-pino` package is not installed, a clear error message is shown
- **AND** the error message includes the installation command: `pnpm add @wordrhyme/logger-pino`

#### Scenario: All adapters implement unified interface
- **WHEN** switching from one adapter to another
- **THEN** all existing logging code continues to work
- **AND** the `LoggerAdapter` interface methods remain consistent: `debug`, `info`, `warn`, `error` (for Core use)
- **AND** child logger creation via `createChild(context)` is supported by all adapters
- **AND** the `PluginLogger` interface only exposes `info`, `warn`, `error` (no debug per governance §3.3)

#### Scenario: Adapter-specific features are abstracted
- **WHEN** using the Pino adapter
- **THEN** Pino-specific features (child loggers, serializers) are utilized internally
- **AND** the public API remains adapter-agnostic
- **AND** plugins cannot detect which adapter is in use

### Requirement: Pino Logger Adapter Package

The Core SHALL provide an optional `@wordrhyme/logger-pino` package for high-performance production deployments. The package MUST bundle all Pino dependencies internally and MUST provide significant performance improvements over the default adapter while maintaining full compatibility with the `LoggerAdapter` interface.

#### Scenario: Pino adapter installation
- **WHEN** a user wants to use the Pino adapter
- **THEN** they install the package: `pnpm add @wordrhyme/logger-pino`
- **AND** set `LOG_ADAPTER=pino` in environment
- **AND** the system uses Pino for all logging operations
- **AND** no additional Pino-related packages need to be installed manually

#### Scenario: Pino adapter performance characteristics
- **WHEN** using the Pino adapter under high load
- **THEN** logging overhead is less than 0.5ms per log entry
- **AND** JSON serialization is optimized via Pino's native formatters
- **AND** async logging is used to prevent blocking the event loop

#### Scenario: Pino child logger for plugin isolation
- **WHEN** a plugin context is created
- **THEN** a Pino child logger is created with bound context: `pluginId`, `tenantId`, `traceId`
- **AND** the child logger inherits parent configuration (level, formatters)
- **AND** the plugin cannot access the parent logger directly

#### Scenario: Pino pretty printing in development
- **WHEN** `NODE_ENV=development` and Pino adapter is active
- **THEN** logs are formatted using `pino-pretty` for human readability
- **AND** colors and timestamps are included in output
- **AND** production mode uses raw JSON output for log aggregators

#### Scenario: Pino with Fastify integration
- **WHEN** the Pino adapter is used with Fastify HTTP server
- **THEN** Fastify's native Pino integration is utilized
- **AND** request/response logging is automatic
- **AND** request IDs are correlated with application logs

### Requirement: NestJS Default Logger Adapter

The Core SHALL provide a default logger adapter based on NestJS built-in Logger that requires zero additional dependencies. The default adapter MUST support structured JSON output and context injection while being suitable for development and lightweight production deployments.

#### Scenario: Zero-dependency default logging
- **WHEN** a new WordRhyme installation starts
- **THEN** logging works immediately without installing additional packages
- **AND** the NestJS Logger is used with enhanced formatting
- **AND** all observability context fields are included in logs

#### Scenario: JSON output mode for default adapter
- **WHEN** `LOG_FORMAT=json` is set with the default adapter
- **THEN** logs are output as JSON strings to stdout
- **AND** the JSON structure matches the standard `LogEntry` schema
- **AND** external log aggregators can parse the output

#### Scenario: Pretty output mode for development
- **WHEN** `LOG_FORMAT=pretty` or `NODE_ENV=development` with default adapter
- **THEN** logs are formatted for human readability
- **AND** colors are used for different log levels
- **AND** context fields are displayed in a readable format

#### Scenario: Child logger emulation
- **WHEN** `createChild(context)` is called on the default adapter
- **THEN** a new adapter instance is created with bound context
- **AND** all subsequent logs include the bound context fields
- **AND** the behavior matches Pino's child logger semantics
