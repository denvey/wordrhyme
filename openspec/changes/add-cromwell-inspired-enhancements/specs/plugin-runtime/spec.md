## ADDED Requirements

### Requirement: Plugin Safe Reload with Health Check

After a PM2 Rolling Reload triggered by plugin install/update/uninstall (a code/manifest change per PLUGIN_CONTRACT.md §4.3), the system SHALL send an HTTP health-check probe to each newly started worker instance during the startup sequence. Health check failure SHALL trigger automatic rollback to the previous plugin state. The entire process SHALL maintain zero downtime. This is a **startup-time validation step**, not a runtime hot-swap mechanism.

```typescript
interface HealthCheckConfig {
  endpoint: string;      // default: '/api/health'
  timeout: number;       // default: 3000ms
  retries: number;       // default: 2
  retryDelay: number;    // default: 1000ms
}

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  plugins: {
    loaded: number;
    failed: string[];    // plugin IDs that failed to load
  };
  uptime: number;
}
```

#### Scenario: Healthy reload completes successfully
- **WHEN** a plugin is installed and Rolling Reload is triggered
- **AND** the new worker responds to `/api/health` with `status: "healthy"`
- **THEN** traffic is routed to the new worker
- **AND** the old worker is terminated after a grace period
- **AND** an audit log entry is created: "Plugin install: {pluginId} — reload successful"

#### Scenario: Unhealthy reload triggers rollback
- **WHEN** a plugin is installed and Rolling Reload is triggered
- **AND** the new worker responds to `/api/health` with `status: "unhealthy"` or times out
- **THEN** the new worker is terminated
- **AND** the plugin is reverted to its previous state (removed if new install, restored if update)
- **AND** the plugin is marked as `crashed` in the database
- **AND** an audit log entry is created: "Plugin install: {pluginId} — reload failed, rolled back"
- **AND** the old workers continue serving traffic (zero downtime)

#### Scenario: Health check reports degraded state
- **WHEN** the health check response has `status: "degraded"` with `plugins.failed: ["com.vendor.broken"]`
- **THEN** the reload proceeds (degraded is acceptable)
- **AND** the failed plugin is marked as `crashed`
- **AND** other plugins continue to function normally
- **AND** an audit log entry is created with the degraded plugin list

#### Scenario: Health check retries on timeout
- **WHEN** the first health check request times out (>3000ms)
- **THEN** the system retries after 1000ms
- **AND** retries up to 2 additional times
- **AND** only marks as failed after all retries are exhausted
