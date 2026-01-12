/**
 * Hook Trace Type Definitions
 *
 * Types for debugging and execution tracing.
 */

import { HookPriority } from './hook.types';

/**
 * Trace Entry Status
 */
export type TraceEntryStatus = 'success' | 'error' | 'skipped' | 'timeout';

/**
 * Hook Trace Entry - One step in the pipeline
 */
export interface HookTraceEntry {
  step: number;
  pluginId: string;
  handlerName: string;
  priority: HookPriority;

  // Snapshots (lean mode for large objects)
  inputSnapshot: unknown;
  outputSnapshot?: unknown;

  duration: number;
  status: TraceEntryStatus;
  error?: string;
}

/**
 * Hook Execution Trace - Full pipeline trace
 */
export interface HookExecutionTrace {
  hookId: string;
  traceId: string;
  timestamp: Date;

  initialValue: unknown;
  finalValue: unknown;
  entries: HookTraceEntry[];
  totalDuration: number;
}

/**
 * Snapshot Mode
 */
export type SnapshotMode = 'full' | 'lean';

/**
 * Lean Snapshot Options
 */
export interface LeanSnapshotOptions {
  maxStringLength: number;  // Default: 100
  maxArrayLength: number;   // Default: 5
  maxDepth: number;         // Default: 3
}

/**
 * Default lean snapshot options
 */
export const DEFAULT_LEAN_OPTIONS: LeanSnapshotOptions = {
  maxStringLength: 100,
  maxArrayLength: 5,
  maxDepth: 3,
};
