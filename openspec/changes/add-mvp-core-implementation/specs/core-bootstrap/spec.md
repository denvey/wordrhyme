# Core Bootstrap Specification

## ADDED Requirements

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

## Implementation Details

### File Structure

```
apps/server/src/bootstrap/
├── phases.ts            # 阶段定义常量
├── kernel.ts            # Kernel 状态机
└── orchestrator.ts      # 启动编排器
```

### Phase Definitions

```typescript
// apps/server/src/bootstrap/phases.ts
export const BOOTSTRAP_PHASES = [
  'system-config',             // Phase 1
  'context-providers',         // Phase 2
  'plugin-manifest-scanning',  // Phase 3
  'plugin-dependency-graph',   // Phase 4
  'capability-initialization', // Phase 5
  'plugin-module-registration',// Phase 6
  'http-server-start',         // Phase 7
] as const;

export type BootstrapPhase = typeof BOOTSTRAP_PHASES[number];
export type KernelState = 'booting' | 'running' | 'reloading' | 'shutdown';
```

### Kernel State Machine

```typescript
// apps/server/src/bootstrap/kernel.ts
import { EventEmitter } from 'events';
import { KernelState, BootstrapPhase } from './phases';

export class Kernel extends EventEmitter {
  private _state: KernelState = 'booting';
  private _currentPhase: BootstrapPhase | null = null;

  get state(): KernelState { return this._state; }
  get currentPhase(): BootstrapPhase | null { return this._currentPhase; }

  transitionTo(newState: KernelState): void {
    const oldState = this._state;
    this._state = newState;
    console.log(`[Kernel] State: ${oldState} → ${newState}`);
    this.emit('stateChange', { from: oldState, to: newState });
  }

  setPhase(phase: BootstrapPhase): void {
    this._currentPhase = phase;
    console.log(`[Kernel] Phase: ${phase}`);
    this.emit('phaseStart', { phase });
  }

  completePhase(phase: BootstrapPhase): void {
    console.log(`[Kernel] Phase complete: ${phase}`);
    this.emit('phaseComplete', { phase });
  }
}

export const kernel = new Kernel();
```

### Bootstrap Orchestrator

```typescript
// apps/server/src/bootstrap/orchestrator.ts
import { kernel } from './kernel';
import { BOOTSTRAP_PHASES, BootstrapPhase } from './phases';
import { env } from '../config/env';
import { pluginManager } from '../plugins/plugin-manager';

export class BootstrapOrchestrator {
  private phaseHandlers: Map<BootstrapPhase, () => Promise<void>>;

  constructor() {
    this.phaseHandlers = new Map([
      ['system-config', this.phaseSystemConfig.bind(this)],
      ['context-providers', this.phaseContextProviders.bind(this)],
      ['plugin-manifest-scanning', this.phasePluginScanning.bind(this)],
      ['plugin-dependency-graph', this.phaseDependencyGraph.bind(this)],
      ['capability-initialization', this.phaseCapabilityInit.bind(this)],
      ['plugin-module-registration', this.phasePluginRegistration.bind(this)],
      ['http-server-start', this.phaseHttpStart.bind(this)],
    ]);
  }

  async execute(): Promise<void> {
    console.log('[Bootstrap] Starting...');
    kernel.transitionTo('booting');

    for (const phase of BOOTSTRAP_PHASES) {
      kernel.setPhase(phase);
      try {
        await this.phaseHandlers.get(phase)!();
        kernel.completePhase(phase);
      } catch (error) {
        console.error(`[Bootstrap] Phase ${phase} failed:`, error);
        if (this.isCriticalPhase(phase)) {
          process.exit(1);
        }
      }
    }

    kernel.transitionTo('running');
    console.log('[Bootstrap] Complete');
  }

  private isCriticalPhase(phase: BootstrapPhase): boolean {
    return ['system-config', 'http-server-start'].includes(phase);
  }

  private async phaseSystemConfig(): Promise<void> {
    console.log(`  DB: ${env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  }

  private async phaseContextProviders(): Promise<void> {
    console.log('  ALS context provider ready');
  }

  private async phasePluginScanning(): Promise<void> {
    const plugins = await pluginManager.scanPlugins();
    console.log(`  Found ${plugins.length} plugins`);
  }

  private async phaseDependencyGraph(): Promise<void> {
    const order = await pluginManager.resolveDependencies();
    console.log(`  Load order: ${order.join(' → ')}`);
  }

  private async phaseCapabilityInit(): Promise<void> {
    console.log('  Capabilities initialized');
  }

  private async phasePluginRegistration(): Promise<void> {
    await pluginManager.loadAllPlugins();
  }

  private async phaseHttpStart(): Promise<void> {
    console.log(`  HTTP ready on port ${env.PORT}`);
  }
}

export const bootstrapOrchestrator = new BootstrapOrchestrator();
```

