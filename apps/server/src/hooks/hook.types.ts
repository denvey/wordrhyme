/**
 * Hook System Type Definitions
 *
 * Core types for the WordRhyme Hook System.
 * Per EVENT_HOOK_GOVERNANCE.md (Frozen v1)
 */

/**
 * Hook Priority Enum
 * Controls execution order within a hook
 */
export enum HookPriority {
  EARLIEST = 0,      // System-level, plugins should not use
  EARLY = 25,        // Plugins needing early execution
  NORMAL = 50,       // Default priority
  LATE = 75,         // Plugins needing late execution
  LATEST = 100,      // Final execution (e.g., logging)
}

/**
 * Hook Type
 */
export type HookType = 'action' | 'filter';

/**
 * Hook Definition - Core declares extension points
 */
export interface HookDefinition {
  id: string;
  type: HookType;
  description: string;
  defaultTimeout: number;  // ms
}

/**
 * Hook Context - Passed to handlers
 */
export interface HookContext {
  hookId: string;
  traceId: string;
  pluginId: string;
  organizationId: string;
  userId?: string;
}

/**
 * Circuit Breaker State
 */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * Handler Statistics
 */
export interface HandlerStats {
  callCount: number;
  errorCount: number;      // Consecutive errors
  avgDuration: number;     // Moving average (ms)
  lastRunAt?: Date;
}

/**
 * Circuit Breaker Config
 */
export interface CircuitBreakerConfig {
  state: CircuitBreakerState;
  threshold: number;       // Default: 5
  cooldownMs: number;      // Default: 5 minutes (300000)
  trippedAt?: Date;
}

/**
 * Runtime Hook Handler - In-memory representation
 */
export interface RuntimeHookHandler {
  id: string;
  hookId: string;
  pluginId: string;
  organizationId?: string;  // Tenant/Organization ID (undefined = system-level)
  priority: HookPriority;
  enabled: boolean;

  // Actual function reference
  fn: (data: unknown, ctx: HookContext) => Promise<unknown> | unknown;

  // Metadata for debugging
  source: string;
  functionName: string;

  // Execution config
  timeout: number;

  // Runtime statistics
  stats: HandlerStats;

  // Circuit breaker
  circuitBreaker: CircuitBreakerConfig;
}

/**
 * Hook Handler Manifest - From plugin manifest.json
 */
export interface HookHandlerManifest {
  hookId: string;
  handler: string;         // "src/hooks.ts#onUserCreate"
  priority?: HookPriority;
  timeout?: number;
}

/**
 * Hook Registry Entry
 */
export interface HookRegistryEntry {
  definition: HookDefinition;
  handlers: RuntimeHookHandler[];  // Sorted by priority
}

/**
 * Hook Execution Result
 */
export interface HookExecutionResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: Error;
  duration: number;
}

/**
 * Hook Abort Error - Thrown by filters to block operations
 */
export class HookAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HookAbortError';
  }
}

/**
 * Hook Timeout Error
 */
export class HookTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HookTimeoutError';
  }
}

/**
 * Hook Validation Error
 */
export class HookValidationError extends Error {
  constructor(
    public readonly hookId: string,
    public readonly pluginId: string,
    message: string
  ) {
    super(message);
    this.name = 'HookValidationError';
  }
}
