# core-bootstrap Specification

## Purpose
TBD - created by archiving change add-mvp-core-implementation. Update Purpose after archive.
## Requirements
### Requirement: Deterministic Bootstrap Flow

The system SHALL execute a deterministic bootstrap sequence following the 7 phases defined in `CORE_BOOTSTRAP_FLOW.md`. The order MUST be: (1) System Config & Kernel, (2) Context Providers, (3) Plugin Manifest Scanning, (4) Plugin Dependency Graph, (5) Capability Initialization, (6) Plugin Module Registration, (7) HTTP Server Start.

#### Scenario: Successful cold start
- **WHEN** the server starts for the first time with no plugins installed
- **THEN** all 7 bootstrap phases execute in order
- **AND** the Kernel state transitions to `running`
- **AND** the HTTP server is listening on the configured port

#### Scenario: Successful warm start with plugins
- **WHEN** the server restarts with 2 valid plugins installed
- **THEN** both plugins are scanned in Phase 3
- **AND** both plugins are loaded in Phase 6
- **AND** lifecycle hooks (`onEnable`) are called for both plugins
- **AND** the system reaches `running` state

#### Scenario: Invalid plugin rejected
- **WHEN** a plugin manifest has invalid JSON schema
- **THEN** the plugin is marked as `invalid` in Phase 3
- **AND** the plugin is NOT loaded in Phase 6
- **AND** the system continues to `running` state (does not crash)

---

### Requirement: Kernel State Management

The Kernel SHALL maintain a state machine with states: `booting`, `running`, `reloading`. State transitions MUST be logged. The Kernel MUST provide read-only access to the current state.

#### Scenario: State transitions during startup
- **WHEN** the server process starts
- **THEN** Kernel state is `booting`
- **WHEN** all bootstrap phases complete successfully
- **THEN** Kernel state transitions to `running`

#### Scenario: State transitions during reload
- **WHEN** a reload signal is received
- **THEN** Kernel state transitions to `reloading`
- **WHEN** reload completes
- **THEN** Kernel state returns to `running`

---

### Requirement: Phase Ordering Enforcement

Bootstrap phases MUST execute sequentially. Phase N+1 SHALL NOT start until Phase N completes. Plugin code MUST NOT execute before Phase 5 (Capability Initialization) completes.

#### Scenario: Context available before plugin load
- **WHEN** Phase 2 (Context Providers) completes
- **THEN** tenant, user, locale, currency, timezone contexts are registered
- **WHEN** Phase 6 (Plugin Module Registration) starts
- **THEN** plugins can access context via Capability API

#### Scenario: Phase failure isolation
- **WHEN** Phase 1 (System Config) fails to load environment variables
- **THEN** the system SHALL log error and exit (critical failure)
- **WHEN** Phase 3 (Plugin Manifest Scanning) encounters 1 invalid plugin
- **THEN** the system SHALL mark that plugin invalid and continue
- **AND** other phases proceed normally

---

### Requirement: Bootstrap Logging

Each bootstrap phase MUST log its start and completion. Errors in any phase MUST be logged with context (phase name, error details). Logs SHALL be structured (JSON format) for observability.

#### Scenario: Successful bootstrap logging
- **WHEN** the system boots successfully
- **THEN** logs contain entries for each phase start
- **AND** logs contain entries for each phase completion
- **AND** log entries include timestamps and phase names

#### Scenario: Error logging
- **WHEN** Phase 3 encounters an invalid plugin
- **THEN** a structured log entry is created with:
  - `level: "error"`
  - `phase: "plugin-manifest-scanning"`
  - `pluginId: <id>`
  - `reason: <validation error>`

---

