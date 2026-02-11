## ADDED Requirements

### Requirement: Queue Job Namespace

All queue job names SHALL follow a strict namespace pattern.

Namespace patterns:
- `core:{module}:{action}` - Core system jobs
- `plugin:{pluginId}:{action}` - Plugin jobs

#### Scenario: Core job namespace
- **GIVEN** Core needs to schedule a notification archive job
- **WHEN** job is enqueued
- **THEN** job name is `core:notification:archive`

#### Scenario: Plugin job namespace
- **GIVEN** email plugin needs to schedule a send job
- **WHEN** plugin calls `ctx.queue.enqueue('send', data)`
- **THEN** job name is `plugin:com.acme.email:send`

#### Scenario: Invalid namespace rejected
- **GIVEN** a job with name `send-email` (no namespace)
- **WHEN** `QueueService.enqueue()` is called
- **THEN** the request is rejected with validation error

---

### Requirement: Plugin Job Limits

Each plugin SHALL be subject to configurable job limits.

Default limits:
| Limit | Default | Description |
|-------|---------|-------------|
| `maxConcurrency` | 5 | Max concurrent jobs per plugin |
| `maxRetries` | 3 | Max retry attempts per job |
| `maxJobsPerMinute` | 100 | Rate limit per plugin |
| `maxJobDataSize` | 64KB | Max job payload size |

#### Scenario: Rate limit exceeded
- **GIVEN** a plugin has enqueued 100 jobs in 1 minute
- **WHEN** plugin tries to enqueue another job
- **THEN** the request is rejected with `RATE_LIMIT_EXCEEDED` error

#### Scenario: Payload too large
- **GIVEN** a plugin tries to enqueue a job with 128KB payload
- **WHEN** `ctx.queue.enqueue()` is called
- **THEN** the request is rejected with `PAYLOAD_TOO_LARGE` error

#### Scenario: Custom limits per plugin
- **GIVEN** admin configures email plugin with `maxJobsPerMinute: 500`
- **WHEN** email plugin enqueues jobs
- **THEN** the custom limit of 500/minute applies

---

### Requirement: Plugin Job Exception Semantics

Plugin job handlers SHALL follow defined exception semantics.

| Handler Behavior | Result |
|------------------|--------|
| `return` (success) | Job marked complete |
| `throw Error` | Job retried (up to maxRetries) |
| `throw FatalJobError` | Job moved to dead-letter (no retry) |
| `ctx.queue.fail(reason)` | Job failed with reason (no retry) |

#### Scenario: Retryable error
- **GIVEN** a job handler throws a network timeout error
- **WHEN** the job fails
- **THEN** the job is retried with exponential backoff
- **AND** retry count is incremented

#### Scenario: Fatal error no retry
- **GIVEN** a job handler throws `FatalJobError('Invalid email address')`
- **WHEN** the job fails
- **THEN** the job is moved to dead-letter queue immediately
- **AND** no retry is attempted

#### Scenario: Explicit failure
- **GIVEN** a job handler calls `ctx.queue.fail('User not found')`
- **WHEN** the job is processed
- **THEN** the job is marked as failed with reason
- **AND** no retry is attempted

---

### Requirement: Tenant Isolation

All queue jobs SHALL include tenant context and enforce isolation.

#### Scenario: Tenant context required
- **GIVEN** a job is enqueued
- **WHEN** job data does not include `tenantId`
- **THEN** the request is rejected with validation error

#### Scenario: Tenant mismatch rejected
- **GIVEN** a plugin in tenant A context
- **WHEN** plugin tries to enqueue job with `tenantId: 'tenant-B'`
- **THEN** the request is rejected with `TENANT_MISMATCH` error

#### Scenario: Cross-tenant job forbidden
- **GIVEN** a job for tenant A is in the queue
- **WHEN** worker in tenant B context tries to process it
- **THEN** the job is skipped
- **AND** security warning is logged

---

### Requirement: Job Priority

The system SHALL support job priorities to prevent noisy neighbor issues.

Priority levels:
| Priority | Value | Use Case |
|----------|-------|----------|
| `critical` | 1 | System alerts, security notifications |
| `high` | 2 | Password reset, 2FA codes |
| `normal` | 3 | Comments, mentions, likes |
| `low` | 4 | Marketing, digests, bulk |

#### Scenario: Priority ordering
- **GIVEN** 1000 `low` priority jobs are queued
- **AND** 1 `high` priority job is added
- **WHEN** worker processes jobs
- **THEN** `high` priority job is processed before `low` priority jobs

#### Scenario: Password reset priority
- **GIVEN** a password reset notification is created
- **WHEN** job is enqueued
- **THEN** job priority is set to `high` (value 2)

---

### Requirement: Queue Service

The system SHALL provide a Redis-based job queue service (BullMQ) for async task processing.

The queue service SHALL support:
- Job enqueueing with optional priority and delay
- Automatic retries with exponential backoff
- Failed job handling with dead-letter queue
- Job progress tracking
- Tenant-scoped job namespacing

#### Scenario: Enqueue job successfully
- **GIVEN** the queue service is connected to Redis
- **WHEN** a Core job is enqueued with name `core:notification:send` and data `{ to: "user@example.com" }`
- **THEN** the job is added to the queue
- **AND** a job ID is returned

#### Scenario: Job processing with retry
- **GIVEN** a job handler is registered for `core:notification:send`
- **WHEN** the job fails on first attempt
- **THEN** the job is retried after exponential backoff delay
- **AND** the retry count is incremented

#### Scenario: Job max retries exceeded
- **GIVEN** a job has failed 3 times (max retries)
- **WHEN** the job fails again
- **THEN** the job is moved to dead-letter queue
- **AND** an error is logged

---

### Requirement: Worker Process

The system SHALL support flexible worker modes: In-Process (default) and Standalone (optional).

**In-Process Mode** (default):
- Worker runs inside web server process
- Zero configuration required
- Suitable for most deployments

**Standalone Mode** (optional):
- Worker runs as separate process
- Enabled via `WORKER_MODE=standalone` environment variable
- Suitable for high-load production scenarios

Workers SHALL:
- Connect to Redis on startup
- Register job handlers from Core and plugins
- Process jobs concurrently with configurable concurrency
- Gracefully shutdown on SIGTERM

#### Scenario: In-process worker startup
- **GIVEN** web server starts without `WORKER_MODE=standalone`
- **WHEN** the application initializes
- **THEN** worker starts in the same process
- **AND** connects to Redis
- **AND** registers all job handlers
- **AND** begins processing jobs

#### Scenario: Standalone worker startup
- **GIVEN** `WORKER_MODE=standalone` is set
- **AND** standalone worker process is started
- **WHEN** the worker initializes
- **THEN** it creates a headless NestJS application
- **AND** connects to Redis
- **AND** registers all job handlers

#### Scenario: Worker graceful shutdown
- **GIVEN** a worker is processing jobs
- **WHEN** SIGTERM is received
- **THEN** the worker stops accepting new jobs
- **AND** waits for active jobs to complete (up to timeout)
- **AND** then exits

---

### Requirement: Worker-Plugin Bootstrap

Worker SHALL bootstrap PluginManager to load plugin job handlers (both modes).

Worker bootstrap sequence:
1. Initialize database connection
2. Initialize PluginManager (loads all enabled plugins)
3. Initialize QueueWorker (registers all handlers)
4. Handle graceful shutdown

#### Scenario: Worker loads plugin handlers
- **GIVEN** email plugin is enabled with job handler
- **WHEN** worker starts (in-process or standalone)
- **THEN** PluginManager loads the plugin
- **AND** email plugin's `onEnable` hook runs
- **AND** plugin's job handlers are registered

#### Scenario: Standalone worker decoupled from web
- **GIVEN** standalone worker mode is active
- **AND** web server crashes
- **WHEN** worker is running
- **THEN** worker continues processing jobs independently
- **AND** no job loss occurs

---

### Requirement: Plugin Queue Capability

Plugins SHALL be able to enqueue jobs through the Plugin Context.

The queue capability SHALL:
- Namespace jobs by plugin ID to prevent conflicts
- Enforce rate limits per plugin
- Allow plugins to register job handlers

#### Scenario: Plugin enqueues job
- **GIVEN** a plugin has queue capability
- **WHEN** plugin calls `ctx.queue.enqueue('process-data', { id: '123' })`
- **THEN** a job is created with name `plugin:{pluginId}:process-data`
- **AND** the job is added to the queue

#### Scenario: Plugin rate limiting
- **GIVEN** a plugin has enqueued 100 jobs in 1 minute
- **WHEN** plugin tries to enqueue another job
- **THEN** the request is rejected with rate limit error
- **AND** the plugin receives error response

#### Scenario: Plugin registers job handler
- **GIVEN** a plugin is enabled
- **WHEN** plugin calls `ctx.queue.registerHandler('process-data', handler)`
- **THEN** the handler is registered for `plugin:{pluginId}:process-data`
- **AND** the worker processes jobs using this handler

---

### Requirement: Queue Health Monitoring

The system SHALL expose queue health metrics for monitoring.

Metrics SHALL include:
- Active job count
- Waiting job count
- Completed job count
- Failed job count
- Dead-letter queue size

#### Scenario: Health check endpoint
- **GIVEN** the server is running
- **WHEN** GET `/api/health/queue` is called
- **THEN** queue metrics are returned
- **AND** status indicates healthy/unhealthy based on thresholds

#### Scenario: High queue backlog alert
- **GIVEN** waiting job count exceeds threshold (default: 10000)
- **WHEN** health check runs
- **THEN** status indicates "degraded"
- **AND** warning is logged
