# Hook System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a WordPress-inspired but safety-constrained Hook system for WordRhyme CMS that allows plugins to extend Core functionality through Actions (async side-effects) and Filters (sync data transformations).

**Architecture:**
- HookRegistry stores hook definitions and runtime handlers in memory
- Actions execute in parallel (Promise.allSettled), Filters execute serially with defensive copying
- Circuit breaker pattern protects against misbehaving plugins
- Execution trace provides debugging visibility

**Tech Stack:** TypeScript, NestJS, Vitest, AJV (JSON Schema validation), structuredClone

**Design Document:** `docs/plans/2026-01-12-hook-system-design.md`

---

## Phase 1: Core Types & Interfaces

### Task 1.1: Create Hook Types

**Files:**
- Create: `apps/server/src/hooks/hook.types.ts`

**Step 1: Create the hook types file**

```typescript
// apps/server/src/hooks/hook.types.ts

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
  tenantId: string;
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
```

**Step 2: Verify file created**

Run: `ls -la apps/server/src/hooks/`
Expected: Directory with `hook.types.ts`

**Step 3: Commit**

```bash
git add apps/server/src/hooks/hook.types.ts
git commit -m "feat(hooks): add core hook type definitions"
```

---

### Task 1.2: Create Hook Trace Types

**Files:**
- Create: `apps/server/src/hooks/hook-trace.types.ts`

**Step 1: Create trace types file**

```typescript
// apps/server/src/hooks/hook-trace.types.ts

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
```

**Step 2: Commit**

```bash
git add apps/server/src/hooks/hook-trace.types.ts
git commit -m "feat(hooks): add trace type definitions"
```

---

## Phase 2: Hook Registry

### Task 2.1: Create Hook Registry with Tests (TDD)

**Files:**
- Create: `apps/server/src/__tests__/hooks/hook-registry.test.ts`
- Create: `apps/server/src/hooks/hook-registry.ts`

**Step 1: Write failing tests**

```typescript
// apps/server/src/__tests__/hooks/hook-registry.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { HookRegistry } from '../../hooks/hook-registry';
import { HookPriority, HookDefinition, RuntimeHookHandler } from '../../hooks/hook.types';

describe('HookRegistry', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  describe('defineHook', () => {
    it('should register a hook definition', () => {
      const definition: HookDefinition = {
        id: 'content.beforeCreate',
        type: 'filter',
        description: 'Before content creation',
        defaultTimeout: 5000,
      };

      registry.defineHook(definition);

      expect(registry.hasHook('content.beforeCreate')).toBe(true);
    });

    it('should throw if hook already defined', () => {
      const definition: HookDefinition = {
        id: 'content.beforeCreate',
        type: 'filter',
        description: 'Before content creation',
        defaultTimeout: 5000,
      };

      registry.defineHook(definition);

      expect(() => registry.defineHook(definition)).toThrow('already defined');
    });
  });

  describe('registerHandler', () => {
    beforeEach(() => {
      registry.defineHook({
        id: 'content.beforeCreate',
        type: 'filter',
        description: 'Before content creation',
        defaultTimeout: 5000,
      });
    });

    it('should register a handler for existing hook', () => {
      const handler = createMockHandler('content.beforeCreate', 'plugin-a');

      registry.registerHandler(handler);

      const handlers = registry.getHandlers('content.beforeCreate');
      expect(handlers).toHaveLength(1);
      expect(handlers[0].pluginId).toBe('plugin-a');
    });

    it('should throw if hook not defined', () => {
      const handler = createMockHandler('unknown.hook', 'plugin-a');

      expect(() => registry.registerHandler(handler)).toThrow('not defined');
    });

    it('should sort handlers by priority', () => {
      const handlerA = createMockHandler('content.beforeCreate', 'plugin-a', HookPriority.LATE);
      const handlerB = createMockHandler('content.beforeCreate', 'plugin-b', HookPriority.EARLY);
      const handlerC = createMockHandler('content.beforeCreate', 'plugin-c', HookPriority.NORMAL);

      registry.registerHandler(handlerA);
      registry.registerHandler(handlerB);
      registry.registerHandler(handlerC);

      const handlers = registry.getHandlers('content.beforeCreate');
      expect(handlers[0].pluginId).toBe('plugin-b');  // EARLY = 25
      expect(handlers[1].pluginId).toBe('plugin-c');  // NORMAL = 50
      expect(handlers[2].pluginId).toBe('plugin-a');  // LATE = 75
    });
  });

  describe('unregisterHandler', () => {
    it('should remove handler by id', () => {
      registry.defineHook({
        id: 'content.beforeCreate',
        type: 'filter',
        description: 'Test',
        defaultTimeout: 5000,
      });

      const handler = createMockHandler('content.beforeCreate', 'plugin-a');
      registry.registerHandler(handler);

      expect(registry.getHandlers('content.beforeCreate')).toHaveLength(1);

      registry.unregisterHandler(handler.id);

      expect(registry.getHandlers('content.beforeCreate')).toHaveLength(0);
    });
  });

  describe('unregisterPluginHandlers', () => {
    it('should remove all handlers for a plugin', () => {
      registry.defineHook({
        id: 'content.beforeCreate',
        type: 'filter',
        description: 'Test',
        defaultTimeout: 5000,
      });
      registry.defineHook({
        id: 'content.afterCreate',
        type: 'action',
        description: 'Test',
        defaultTimeout: 5000,
      });

      registry.registerHandler(createMockHandler('content.beforeCreate', 'plugin-a'));
      registry.registerHandler(createMockHandler('content.afterCreate', 'plugin-a'));
      registry.registerHandler(createMockHandler('content.beforeCreate', 'plugin-b'));

      registry.unregisterPluginHandlers('plugin-a');

      expect(registry.getHandlers('content.beforeCreate')).toHaveLength(1);
      expect(registry.getHandlers('content.afterCreate')).toHaveLength(0);
    });
  });
});

// Helper function
function createMockHandler(
  hookId: string,
  pluginId: string,
  priority: HookPriority = HookPriority.NORMAL
): RuntimeHookHandler {
  return {
    id: `${pluginId}-${hookId}-${Date.now()}`,
    hookId,
    pluginId,
    priority,
    enabled: true,
    fn: async (data) => data,
    source: 'test',
    functionName: 'testHandler',
    timeout: 5000,
    stats: {
      callCount: 0,
      errorCount: 0,
      avgDuration: 0,
    },
    circuitBreaker: {
      state: 'closed',
      threshold: 5,
      cooldownMs: 300000,
    },
  };
}
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/server && pnpm test -- --run src/__tests__/hooks/hook-registry.test.ts`
Expected: FAIL - module not found

**Step 3: Implement HookRegistry**

```typescript
// apps/server/src/hooks/hook-registry.ts

import { Injectable } from '@nestjs/common';
import {
  HookDefinition,
  RuntimeHookHandler,
  HookRegistryEntry,
} from './hook.types';

/**
 * Hook Registry
 *
 * Central registry for all hook definitions and handlers.
 * Maintains handlers sorted by priority for efficient execution.
 */
@Injectable()
export class HookRegistry {
  private readonly hooks = new Map<string, HookRegistryEntry>();
  private readonly handlerIndex = new Map<string, RuntimeHookHandler>();

  /**
   * Define a new hook (Core only)
   */
  defineHook(definition: HookDefinition): void {
    if (this.hooks.has(definition.id)) {
      throw new Error(`Hook '${definition.id}' is already defined`);
    }

    this.hooks.set(definition.id, {
      definition,
      handlers: [],
    });
  }

  /**
   * Check if a hook is defined
   */
  hasHook(hookId: string): boolean {
    return this.hooks.has(hookId);
  }

  /**
   * Get hook definition
   */
  getDefinition(hookId: string): HookDefinition | undefined {
    return this.hooks.get(hookId)?.definition;
  }

  /**
   * Register a handler for a hook
   */
  registerHandler(handler: RuntimeHookHandler): void {
    const entry = this.hooks.get(handler.hookId);
    if (!entry) {
      throw new Error(`Hook '${handler.hookId}' is not defined`);
    }

    // Add to handlers list
    entry.handlers.push(handler);

    // Sort by priority (ascending)
    entry.handlers.sort((a, b) => a.priority - b.priority);

    // Index by handler ID for fast lookup
    this.handlerIndex.set(handler.id, handler);
  }

  /**
   * Unregister a handler by ID
   */
  unregisterHandler(handlerId: string): boolean {
    const handler = this.handlerIndex.get(handlerId);
    if (!handler) {
      return false;
    }

    const entry = this.hooks.get(handler.hookId);
    if (entry) {
      entry.handlers = entry.handlers.filter(h => h.id !== handlerId);
    }

    this.handlerIndex.delete(handlerId);
    return true;
  }

  /**
   * Unregister all handlers for a plugin
   */
  unregisterPluginHandlers(pluginId: string): void {
    const handlersToRemove: string[] = [];

    for (const [handlerId, handler] of this.handlerIndex) {
      if (handler.pluginId === pluginId) {
        handlersToRemove.push(handlerId);
      }
    }

    for (const handlerId of handlersToRemove) {
      this.unregisterHandler(handlerId);
    }
  }

  /**
   * Get all handlers for a hook (already sorted by priority)
   */
  getHandlers(hookId: string): RuntimeHookHandler[] {
    return this.hooks.get(hookId)?.handlers ?? [];
  }

  /**
   * Get handler by ID
   */
  getHandler(handlerId: string): RuntimeHookHandler | undefined {
    return this.handlerIndex.get(handlerId);
  }

  /**
   * Get all defined hooks
   */
  getAllHooks(): HookDefinition[] {
    return Array.from(this.hooks.values()).map(e => e.definition);
  }

  /**
   * Get total handler count
   */
  getTotalHandlerCount(): number {
    return this.handlerIndex.size;
  }

  /**
   * Clear all hooks and handlers (for testing)
   */
  clear(): void {
    this.hooks.clear();
    this.handlerIndex.clear();
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/server && pnpm test -- --run src/__tests__/hooks/hook-registry.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add apps/server/src/__tests__/hooks/hook-registry.test.ts apps/server/src/hooks/hook-registry.ts
git commit -m "feat(hooks): implement HookRegistry with TDD"
```

---

## Phase 3: Hook Executor

### Task 3.1: Create Snapshot Utility

**Files:**
- Create: `apps/server/src/hooks/snapshot.util.ts`
- Create: `apps/server/src/__tests__/hooks/snapshot.util.test.ts`

**Step 1: Write failing tests**

```typescript
// apps/server/src/__tests__/hooks/snapshot.util.test.ts

import { describe, it, expect } from 'vitest';
import { createSnapshot, pruneLargeObjects } from '../../hooks/snapshot.util';

describe('Snapshot Utilities', () => {
  describe('pruneLargeObjects', () => {
    it('should truncate long strings', () => {
      const input = { text: 'a'.repeat(200) };
      const result = pruneLargeObjects(input, { maxStringLength: 50, maxArrayLength: 5, maxDepth: 3 });

      expect(result.text).toHaveLength(53);  // 50 + '...'
      expect(result.text).toContain('...');
    });

    it('should limit array length', () => {
      const input = { items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
      const result = pruneLargeObjects(input, { maxStringLength: 100, maxArrayLength: 3, maxDepth: 3 });

      expect(result.items).toHaveLength(4);  // 3 items + '[+7 more]'
      expect(result.items[3]).toBe('[+7 more]');
    });

    it('should limit object depth', () => {
      const input = { a: { b: { c: { d: { e: 'deep' } } } } };
      const result = pruneLargeObjects(input, { maxStringLength: 100, maxArrayLength: 5, maxDepth: 2 });

      expect(result.a.b).toBe('[Object depth exceeded]');
    });

    it('should handle null and primitives', () => {
      expect(pruneLargeObjects(null, { maxStringLength: 100, maxArrayLength: 5, maxDepth: 3 })).toBeNull();
      expect(pruneLargeObjects(42, { maxStringLength: 100, maxArrayLength: 5, maxDepth: 3 })).toBe(42);
      expect(pruneLargeObjects(true, { maxStringLength: 100, maxArrayLength: 5, maxDepth: 3 })).toBe(true);
    });
  });

  describe('createSnapshot', () => {
    it('should create full clone in full mode', () => {
      const input = { a: 1, b: { c: 2 } };
      const result = createSnapshot(input, 'full');

      expect(result).toEqual(input);
      expect(result).not.toBe(input);
      expect(result.b).not.toBe(input.b);
    });

    it('should create pruned clone in lean mode', () => {
      const input = { text: 'a'.repeat(200) };
      const result = createSnapshot(input, 'lean');

      expect(result.text.length).toBeLessThan(200);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/server && pnpm test -- --run src/__tests__/hooks/snapshot.util.test.ts`
Expected: FAIL

**Step 3: Implement snapshot utility**

```typescript
// apps/server/src/hooks/snapshot.util.ts

import { LeanSnapshotOptions, SnapshotMode, DEFAULT_LEAN_OPTIONS } from './hook-trace.types';

/**
 * Create a snapshot of data for tracing
 */
export function createSnapshot(
  data: unknown,
  mode: SnapshotMode,
  options: LeanSnapshotOptions = DEFAULT_LEAN_OPTIONS
): unknown {
  if (mode === 'full') {
    return structuredClone(data);
  }

  return pruneLargeObjects(data, options);
}

/**
 * Prune large objects for lean snapshots
 */
export function pruneLargeObjects(
  data: unknown,
  options: LeanSnapshotOptions,
  currentDepth: number = 0
): unknown {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return data;
  }

  // Handle primitives
  if (typeof data !== 'object') {
    if (typeof data === 'string' && data.length > options.maxStringLength) {
      return data.slice(0, options.maxStringLength) + '...';
    }
    return data;
  }

  // Check depth limit
  if (currentDepth >= options.maxDepth) {
    return '[Object depth exceeded]';
  }

  // Handle arrays
  if (Array.isArray(data)) {
    const pruned: unknown[] = [];
    const limit = Math.min(data.length, options.maxArrayLength);

    for (let i = 0; i < limit; i++) {
      pruned.push(pruneLargeObjects(data[i], options, currentDepth + 1));
    }

    if (data.length > options.maxArrayLength) {
      pruned.push(`[+${data.length - options.maxArrayLength} more]`);
    }

    return pruned;
  }

  // Handle objects
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = pruneLargeObjects(value, options, currentDepth + 1);
  }

  return result;
}
```

**Step 4: Run tests**

Run: `cd apps/server && pnpm test -- --run src/__tests__/hooks/snapshot.util.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/hooks/snapshot.util.ts apps/server/src/__tests__/hooks/snapshot.util.test.ts
git commit -m "feat(hooks): add snapshot utility for trace"
```

---

### Task 3.2: Create Hook Executor with Tests (TDD)

**Files:**
- Create: `apps/server/src/__tests__/hooks/hook-executor.test.ts`
- Create: `apps/server/src/hooks/hook-executor.ts`

**Step 1: Write failing tests**

```typescript
// apps/server/src/__tests__/hooks/hook-executor.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookExecutor } from '../../hooks/hook-executor';
import { HookRegistry } from '../../hooks/hook-registry';
import { HookPriority, HookContext, RuntimeHookHandler, HookAbortError } from '../../hooks/hook.types';

describe('HookExecutor', () => {
  let registry: HookRegistry;
  let executor: HookExecutor;

  const mockContext: HookContext = {
    hookId: 'test.hook',
    traceId: 'trace-123',
    pluginId: 'test-plugin',
    tenantId: 'tenant-1',
  };

  beforeEach(() => {
    registry = new HookRegistry();
    executor = new HookExecutor(registry);
  });

  describe('executeAction', () => {
    beforeEach(() => {
      registry.defineHook({
        id: 'user.afterLogin',
        type: 'action',
        description: 'After user login',
        defaultTimeout: 5000,
      });
    });

    it('should execute all handlers in parallel', async () => {
      const results: string[] = [];

      registry.registerHandler(createHandler('user.afterLogin', 'plugin-a', async () => {
        await delay(10);
        results.push('a');
      }));
      registry.registerHandler(createHandler('user.afterLogin', 'plugin-b', async () => {
        results.push('b');
      }));

      await executor.executeAction('user.afterLogin', { userId: '123' }, mockContext);

      expect(results).toContain('a');
      expect(results).toContain('b');
    });

    it('should not throw if a handler fails', async () => {
      registry.registerHandler(createHandler('user.afterLogin', 'plugin-a', async () => {
        throw new Error('Handler error');
      }));
      registry.registerHandler(createHandler('user.afterLogin', 'plugin-b', async () => {
        return 'ok';
      }));

      // Should not throw
      await expect(executor.executeAction('user.afterLogin', {}, mockContext)).resolves.toBeUndefined();
    });
  });

  describe('executeFilter', () => {
    beforeEach(() => {
      registry.defineHook({
        id: 'content.beforeCreate',
        type: 'filter',
        description: 'Before content creation',
        defaultTimeout: 5000,
      });
    });

    it('should execute handlers serially and pass data through pipeline', async () => {
      registry.registerHandler(createHandler('content.beforeCreate', 'plugin-a', async (data: any) => {
        return { ...data, addedByA: true };
      }, HookPriority.EARLY));

      registry.registerHandler(createHandler('content.beforeCreate', 'plugin-b', async (data: any) => {
        return { ...data, addedByB: true };
      }, HookPriority.NORMAL));

      const result = await executor.executeFilter(
        'content.beforeCreate',
        { title: 'Hello' },
        mockContext
      );

      expect(result).toEqual({
        title: 'Hello',
        addedByA: true,
        addedByB: true,
      });
    });

    it('should not mutate original data when handler throws', async () => {
      registry.registerHandler(createHandler('content.beforeCreate', 'plugin-a', async (data: any) => {
        data.mutated = true;  // Try to mutate
        throw new Error('Oops');
      }));

      const original = { title: 'Hello' };
      const result = await executor.executeFilter('content.beforeCreate', original, mockContext);

      expect(result).toEqual({ title: 'Hello' });
      expect(original).toEqual({ title: 'Hello' });  // Not mutated
    });

    it('should throw HookAbortError to caller', async () => {
      registry.registerHandler(createHandler('content.beforeCreate', 'plugin-a', async () => {
        throw new HookAbortError('Content blocked by policy');
      }));

      await expect(
        executor.executeFilter('content.beforeCreate', {}, mockContext)
      ).rejects.toThrow(HookAbortError);
    });

    it('should skip handler and continue if regular error', async () => {
      registry.registerHandler(createHandler('content.beforeCreate', 'plugin-a', async (data: any) => {
        return { ...data, fromA: true };
      }, HookPriority.EARLY));

      registry.registerHandler(createHandler('content.beforeCreate', 'plugin-b', async () => {
        throw new Error('Plugin B failed');
      }, HookPriority.NORMAL));

      registry.registerHandler(createHandler('content.beforeCreate', 'plugin-c', async (data: any) => {
        return { ...data, fromC: true };
      }, HookPriority.LATE));

      const result = await executor.executeFilter('content.beforeCreate', {}, mockContext);

      expect(result).toEqual({ fromA: true, fromC: true });
    });
  });

  describe('circuit breaker', () => {
    beforeEach(() => {
      registry.defineHook({
        id: 'test.hook',
        type: 'action',
        description: 'Test',
        defaultTimeout: 5000,
      });
    });

    it('should trip circuit breaker after threshold errors', async () => {
      const handler = createHandler('test.hook', 'plugin-a', async () => {
        throw new Error('Always fails');
      });
      handler.circuitBreaker.threshold = 3;

      registry.registerHandler(handler);

      // Execute 3 times to trip breaker
      for (let i = 0; i < 3; i++) {
        await executor.executeAction('test.hook', {}, mockContext);
      }

      expect(handler.circuitBreaker.state).toBe('open');
      expect(handler.stats.errorCount).toBe(3);
    });
  });
});

// Helpers
function createHandler(
  hookId: string,
  pluginId: string,
  fn: (data: unknown, ctx: HookContext) => Promise<unknown> | unknown,
  priority: HookPriority = HookPriority.NORMAL
): RuntimeHookHandler {
  return {
    id: `${pluginId}-${hookId}-${Date.now()}-${Math.random()}`,
    hookId,
    pluginId,
    priority,
    enabled: true,
    fn,
    source: 'test',
    functionName: 'testHandler',
    timeout: 5000,
    stats: {
      callCount: 0,
      errorCount: 0,
      avgDuration: 0,
    },
    circuitBreaker: {
      state: 'closed',
      threshold: 5,
      cooldownMs: 300000,
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/server && pnpm test -- --run src/__tests__/hooks/hook-executor.test.ts`
Expected: FAIL

**Step 3: Implement HookExecutor**

```typescript
// apps/server/src/hooks/hook-executor.ts

import { Injectable, Logger } from '@nestjs/common';
import { HookRegistry } from './hook-registry';
import {
  HookContext,
  RuntimeHookHandler,
  HookAbortError,
  HookTimeoutError,
} from './hook.types';

/**
 * Hook Executor
 *
 * Executes hooks with:
 * - Actions: Parallel async execution
 * - Filters: Serial pipeline with defensive copying
 * - Circuit breaker protection
 * - Timeout handling
 */
@Injectable()
export class HookExecutor {
  private readonly logger = new Logger(HookExecutor.name);

  constructor(private readonly registry: HookRegistry) {}

  /**
   * Execute an action hook (parallel, fire-and-forget)
   */
  async executeAction(
    hookId: string,
    payload: unknown,
    ctx: HookContext
  ): Promise<void> {
    const handlers = this.getActiveHandlers(hookId);
    if (handlers.length === 0) return;

    // Parallel execution
    await Promise.allSettled(
      handlers.map(handler => this.executeHandler(handler, payload, ctx))
    );
  }

  /**
   * Execute a filter hook (serial pipeline)
   */
  async executeFilter<T>(
    hookId: string,
    initialValue: T,
    ctx: HookContext
  ): Promise<T> {
    const handlers = this.getActiveHandlers(hookId);
    if (handlers.length === 0) return initialValue;

    let currentValue = initialValue;

    for (const handler of handlers) {
      try {
        // Defensive copy to prevent mutation
        const inputClone = structuredClone(currentValue);

        const result = await this.executeHandler(handler, inputClone, ctx);

        // Update value if execution succeeded
        if (result.success && result.result !== undefined) {
          currentValue = result.result as T;
        }
      } catch (error) {
        // Re-throw HookAbortError to caller
        if (error instanceof HookAbortError) {
          throw error;
        }

        // Log and continue for other errors
        this.logger.warn(
          `Filter handler failed: ${handler.pluginId}/${handler.functionName}`,
          error
        );
      }
    }

    return currentValue;
  }

  /**
   * Execute a single handler with timeout and circuit breaker
   */
  private async executeHandler(
    handler: RuntimeHookHandler,
    payload: unknown,
    ctx: HookContext
  ): Promise<{ success: boolean; result?: unknown }> {
    const start = performance.now();

    try {
      // Check circuit breaker
      if (this.shouldSkip(handler)) {
        return { success: false };
      }

      // Execute with timeout
      const result = await this.withTimeout(
        Promise.resolve(handler.fn(payload, { ...ctx, pluginId: handler.pluginId })),
        handler.timeout,
        handler
      );

      // Update stats on success
      this.updateStats(handler, performance.now() - start, true);

      // Reset circuit breaker on success
      this.resetCircuitBreaker(handler);

      return { success: true, result };
    } catch (error) {
      const duration = performance.now() - start;
      this.updateStats(handler, duration, false);
      this.handleError(handler, error as Error);

      // Re-throw abort errors
      if (error instanceof HookAbortError) {
        throw error;
      }

      return { success: false };
    }
  }

  /**
   * Get active handlers (enabled and not circuit-broken)
   */
  private getActiveHandlers(hookId: string): RuntimeHookHandler[] {
    return this.registry.getHandlers(hookId).filter(h => h.enabled);
  }

  /**
   * Check if handler should be skipped (circuit breaker)
   */
  private shouldSkip(handler: RuntimeHookHandler): boolean {
    const { circuitBreaker } = handler;

    if (circuitBreaker.state === 'closed') {
      return false;
    }

    if (circuitBreaker.state === 'open') {
      // Check cooldown for half-open transition
      if (circuitBreaker.trippedAt) {
        const elapsed = Date.now() - circuitBreaker.trippedAt.getTime();
        if (elapsed > circuitBreaker.cooldownMs) {
          circuitBreaker.state = 'half-open';
          return false;  // Allow one attempt
        }
      }
      return true;  // Still in cooldown
    }

    // half-open: allow execution
    return false;
  }

  /**
   * Wrap promise with timeout
   */
  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    handler: RuntimeHookHandler
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new HookTimeoutError(
          `Handler ${handler.functionName} timed out after ${timeoutMs}ms`
        ));
      }, timeoutMs);

      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Update handler statistics
   */
  private updateStats(handler: RuntimeHookHandler, duration: number, success: boolean): void {
    handler.stats.callCount++;
    handler.stats.lastRunAt = new Date();

    // Moving average for duration
    const alpha = 0.2;
    handler.stats.avgDuration = handler.stats.avgDuration * (1 - alpha) + duration * alpha;

    if (success) {
      handler.stats.errorCount = 0;
    } else {
      handler.stats.errorCount++;
    }
  }

  /**
   * Handle execution error
   */
  private handleError(handler: RuntimeHookHandler, error: Error): void {
    const { circuitBreaker, stats } = handler;

    if (stats.errorCount >= circuitBreaker.threshold) {
      circuitBreaker.state = 'open';
      circuitBreaker.trippedAt = new Date();

      this.logger.warn(
        `Circuit breaker tripped for ${handler.pluginId}/${handler.functionName}`,
        { errors: stats.errorCount, threshold: circuitBreaker.threshold }
      );
    }
  }

  /**
   * Reset circuit breaker on success
   */
  private resetCircuitBreaker(handler: RuntimeHookHandler): void {
    if (handler.circuitBreaker.state !== 'closed') {
      handler.circuitBreaker.state = 'closed';
      handler.circuitBreaker.trippedAt = undefined;
      handler.stats.errorCount = 0;
    }
  }
}
```

**Step 4: Run tests**

Run: `cd apps/server && pnpm test -- --run src/__tests__/hooks/hook-executor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/server/src/hooks/hook-executor.ts apps/server/src/__tests__/hooks/hook-executor.test.ts
git commit -m "feat(hooks): implement HookExecutor with circuit breaker"
```

---

### Task 3.3: Create Hook Module

**Files:**
- Create: `apps/server/src/hooks/hook.module.ts`
- Create: `apps/server/src/hooks/index.ts`

**Step 1: Create module file**

```typescript
// apps/server/src/hooks/hook.module.ts

import { Module, Global } from '@nestjs/common';
import { HookRegistry } from './hook-registry';
import { HookExecutor } from './hook-executor';

@Global()
@Module({
  providers: [HookRegistry, HookExecutor],
  exports: [HookRegistry, HookExecutor],
})
export class HookModule {}
```

**Step 2: Create index file**

```typescript
// apps/server/src/hooks/index.ts

export * from './hook.types';
export * from './hook-trace.types';
export * from './hook-registry';
export * from './hook-executor';
export * from './hook.module';
export * from './snapshot.util';
```

**Step 3: Commit**

```bash
git add apps/server/src/hooks/hook.module.ts apps/server/src/hooks/index.ts
git commit -m "feat(hooks): add HookModule and exports"
```

---

## Phase 4: Plugin SDK Integration

### Task 4.1: Add Hook Types to Plugin Package

**Files:**
- Modify: `packages/plugin/src/types.ts`
- Modify: `packages/plugin/src/index.ts`

**Step 1: Add hook types to plugin package**

Add to `packages/plugin/src/types.ts`:

```typescript
// Add at the end of the file

// ============================================================================
// Hook Capabilities
// ============================================================================

/**
 * Hook Priority Enum
 */
export enum HookPriority {
  EARLIEST = 0,
  EARLY = 25,
  NORMAL = 50,
  LATE = 75,
  LATEST = 100,
}

/**
 * Hook Handler Options
 */
export interface HookHandlerOptions {
  priority?: HookPriority;
  timeout?: number;
}

/**
 * Plugin Hook Capability
 */
export interface PluginHookCapability {
  /**
   * Register an action handler (async side-effect)
   */
  addAction<T = unknown>(
    hookId: string,
    handler: (data: T, ctx: PluginContext) => void | Promise<void>,
    options?: HookHandlerOptions
  ): () => void;

  /**
   * Register a filter handler (sync data transformation)
   */
  addFilter<T = unknown>(
    hookId: string,
    handler: (data: T, ctx: PluginContext) => T | Promise<T>,
    options?: HookHandlerOptions
  ): () => void;
}
```

**Step 2: Add hook capability to PluginContext**

Add to `PluginContext` interface in `packages/plugin/src/types.ts`:

```typescript
/** Hook capability (for registering hook handlers) */
hooks: PluginHookCapability;
```

**Step 3: Export hook types**

Add to `packages/plugin/src/index.ts`:

```typescript
export type { PluginHookCapability, HookHandlerOptions } from './types';
export { HookPriority } from './types';
```

**Step 4: Commit**

```bash
git add packages/plugin/src/types.ts packages/plugin/src/index.ts
git commit -m "feat(plugin): add hook capability types to SDK"
```

---

### Task 4.2: Create Hook Capability Provider

**Files:**
- Create: `apps/server/src/plugins/capabilities/hook.capability.ts`

**Step 1: Create hook capability**

```typescript
// apps/server/src/plugins/capabilities/hook.capability.ts

import { HookRegistry } from '../../hooks/hook-registry';
import { HookPriority, RuntimeHookHandler, HookContext } from '../../hooks/hook.types';
import type { PluginHookCapability, HookHandlerOptions, PluginContext } from '@wordrhyme/plugin';

/**
 * Create hook capability for a plugin
 */
export function createHookCapability(
  pluginId: string,
  registry: HookRegistry
): PluginHookCapability {
  const registeredHandlers: string[] = [];

  return {
    addAction<T = unknown>(
      hookId: string,
      handler: (data: T, ctx: PluginContext) => void | Promise<void>,
      options?: HookHandlerOptions
    ): () => void {
      const runtimeHandler = createRuntimeHandler(
        pluginId,
        hookId,
        handler as (data: unknown, ctx: HookContext) => Promise<unknown>,
        options
      );

      registry.registerHandler(runtimeHandler);
      registeredHandlers.push(runtimeHandler.id);

      return () => {
        registry.unregisterHandler(runtimeHandler.id);
        const idx = registeredHandlers.indexOf(runtimeHandler.id);
        if (idx >= 0) registeredHandlers.splice(idx, 1);
      };
    },

    addFilter<T = unknown>(
      hookId: string,
      handler: (data: T, ctx: PluginContext) => T | Promise<T>,
      options?: HookHandlerOptions
    ): () => void {
      const runtimeHandler = createRuntimeHandler(
        pluginId,
        hookId,
        handler as (data: unknown, ctx: HookContext) => Promise<unknown>,
        options
      );

      registry.registerHandler(runtimeHandler);
      registeredHandlers.push(runtimeHandler.id);

      return () => {
        registry.unregisterHandler(runtimeHandler.id);
        const idx = registeredHandlers.indexOf(runtimeHandler.id);
        if (idx >= 0) registeredHandlers.splice(idx, 1);
      };
    },
  };
}

/**
 * Create runtime handler from plugin handler
 */
function createRuntimeHandler(
  pluginId: string,
  hookId: string,
  fn: (data: unknown, ctx: HookContext) => Promise<unknown> | unknown,
  options?: HookHandlerOptions
): RuntimeHookHandler {
  const handlerId = `${pluginId}:${hookId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  return {
    id: handlerId,
    hookId,
    pluginId,
    priority: options?.priority ?? HookPriority.NORMAL,
    enabled: true,
    fn,
    source: `plugin:${pluginId}`,
    functionName: fn.name || 'anonymous',
    timeout: options?.timeout ?? 5000,
    stats: {
      callCount: 0,
      errorCount: 0,
      avgDuration: 0,
    },
    circuitBreaker: {
      state: 'closed',
      threshold: 5,
      cooldownMs: 300000,
    },
  };
}
```

**Step 2: Commit**

```bash
git add apps/server/src/plugins/capabilities/hook.capability.ts
git commit -m "feat(hooks): add hook capability provider for plugins"
```

---

## Phase 5: Core Hook Definitions

### Task 5.1: Define Content Hooks

**Files:**
- Create: `apps/server/src/hooks/definitions/content.hooks.ts`

**Step 1: Create content hook definitions**

```typescript
// apps/server/src/hooks/definitions/content.hooks.ts

import { HookDefinition } from '../hook.types';

export const CONTENT_HOOKS: HookDefinition[] = [
  {
    id: 'content.beforeCreate',
    type: 'filter',
    description: 'Before content creation - fill defaults, filter sensitive words',
    defaultTimeout: 5000,
  },
  {
    id: 'content.afterCreate',
    type: 'action',
    description: 'After content creation - notifications, index sync',
    defaultTimeout: 5000,
  },
  {
    id: 'content.onRead',
    type: 'filter',
    description: 'On read - inject computed fields, field-level masking',
    defaultTimeout: 3000,
  },
  {
    id: 'content.beforeUpdate',
    type: 'filter',
    description: 'Before update - optimistic lock, immutable field protection',
    defaultTimeout: 5000,
  },
  {
    id: 'content.afterUpdate',
    type: 'action',
    description: 'After update - clear cache, webhook',
    defaultTimeout: 5000,
  },
  {
    id: 'content.beforeDelete',
    type: 'filter',
    description: 'Before delete - reference check (throw to abort)',
    defaultTimeout: 5000,
  },
  {
    id: 'content.afterDelete',
    type: 'action',
    description: 'After delete - cleanup orphan resources',
    defaultTimeout: 5000,
  },
  {
    id: 'content.beforePublish',
    type: 'filter',
    description: 'Before publish - approval workflow',
    defaultTimeout: 5000,
  },
  {
    id: 'content.afterPublish',
    type: 'action',
    description: 'After publish - SSG trigger, CDN push',
    defaultTimeout: 10000,
  },
  {
    id: 'content.beforeUnpublish',
    type: 'filter',
    description: 'Before unpublish',
    defaultTimeout: 5000,
  },
  {
    id: 'content.afterUnpublish',
    type: 'action',
    description: 'After unpublish',
    defaultTimeout: 5000,
  },
  {
    id: 'content.onView',
    type: 'action',
    description: 'On view - analytics',
    defaultTimeout: 3000,
  },
  // Bulk operations
  {
    id: 'content.beforeBulkCreate',
    type: 'filter',
    description: 'Bulk create before',
    defaultTimeout: 10000,
  },
  {
    id: 'content.afterBulkCreate',
    type: 'action',
    description: 'Bulk create after',
    defaultTimeout: 10000,
  },
  {
    id: 'content.beforeBulkUpdate',
    type: 'filter',
    description: 'Bulk update before',
    defaultTimeout: 10000,
  },
  {
    id: 'content.afterBulkUpdate',
    type: 'action',
    description: 'Bulk update after',
    defaultTimeout: 10000,
  },
  {
    id: 'content.beforeBulkDelete',
    type: 'filter',
    description: 'Bulk delete before',
    defaultTimeout: 10000,
  },
  {
    id: 'content.afterBulkDelete',
    type: 'action',
    description: 'Bulk delete after',
    defaultTimeout: 10000,
  },
];
```

**Step 2: Commit**

```bash
git add apps/server/src/hooks/definitions/content.hooks.ts
git commit -m "feat(hooks): define content lifecycle hooks"
```

---

### Task 5.2: Define User/Auth Hooks

**Files:**
- Create: `apps/server/src/hooks/definitions/user.hooks.ts`

**Step 1: Create user hook definitions**

```typescript
// apps/server/src/hooks/definitions/user.hooks.ts

import { HookDefinition } from '../hook.types';

export const USER_HOOKS: HookDefinition[] = [
  {
    id: 'user.beforeRegister',
    type: 'filter',
    description: 'Before registration - invite code, blacklist',
    defaultTimeout: 5000,
  },
  {
    id: 'user.afterRegister',
    type: 'action',
    description: 'After registration - welcome email, CRM',
    defaultTimeout: 10000,
  },
  {
    id: 'user.beforeLogin',
    type: 'filter',
    description: 'Before login - 2FA, IP ban',
    defaultTimeout: 5000,
  },
  {
    id: 'user.afterLogin',
    type: 'action',
    description: 'After login - audit log',
    defaultTimeout: 5000,
  },
  {
    id: 'user.onLoginFailed',
    type: 'action',
    description: 'Login failed - security alert',
    defaultTimeout: 5000,
  },
  {
    id: 'user.onLogout',
    type: 'action',
    description: 'On logout - clear session',
    defaultTimeout: 3000,
  },
  {
    id: 'auth.session.transform',
    type: 'filter',
    description: 'Generate token - inject custom claims',
    defaultTimeout: 3000,
  },
  {
    id: 'auth.password.request',
    type: 'action',
    description: 'Password reset request',
    defaultTimeout: 5000,
  },
  {
    id: 'user.onPasswordChange',
    type: 'action',
    description: 'Password changed - force logout',
    defaultTimeout: 5000,
  },
  {
    id: 'user.beforeUpdate',
    type: 'filter',
    description: 'Profile update before',
    defaultTimeout: 5000,
  },
  {
    id: 'user.afterUpdate',
    type: 'action',
    description: 'Profile update after - third-party sync',
    defaultTimeout: 5000,
  },
  {
    id: 'user.onBan',
    type: 'action',
    description: 'User banned',
    defaultTimeout: 5000,
  },
  {
    id: 'user.onRoleChange',
    type: 'action',
    description: 'Role changed',
    defaultTimeout: 5000,
  },
  {
    id: 'user.onPermissionChange',
    type: 'action',
    description: 'Permission changed',
    defaultTimeout: 5000,
  },
];
```

**Step 2: Commit**

```bash
git add apps/server/src/hooks/definitions/user.hooks.ts
git commit -m "feat(hooks): define user and auth hooks"
```

---

### Task 5.3: Define All Remaining Hooks

**Files:**
- Create: `apps/server/src/hooks/definitions/index.ts`
- Create: `apps/server/src/hooks/definitions/ecommerce.hooks.ts`
- Create: `apps/server/src/hooks/definitions/system.hooks.ts`
- Create: `apps/server/src/hooks/definitions/media.hooks.ts`

**Step 1: Create ecommerce hooks**

```typescript
// apps/server/src/hooks/definitions/ecommerce.hooks.ts

import { HookDefinition } from '../hook.types';

export const PRODUCT_HOOKS: HookDefinition[] = [
  { id: 'product.beforeCreate', type: 'filter', description: 'Before product creation', defaultTimeout: 5000 },
  { id: 'product.afterCreate', type: 'action', description: 'After product creation', defaultTimeout: 5000 },
  { id: 'product.onRead', type: 'filter', description: 'On product read', defaultTimeout: 3000 },
  { id: 'product.beforeUpdate', type: 'filter', description: 'Before product update', defaultTimeout: 5000 },
  { id: 'product.afterUpdate', type: 'action', description: 'After product update', defaultTimeout: 5000 },
  { id: 'product.priceCalculate', type: 'filter', description: 'Calculate product price', defaultTimeout: 3000 },
  { id: 'product.beforePublish', type: 'filter', description: 'Before product publish', defaultTimeout: 5000 },
  { id: 'product.afterPublish', type: 'action', description: 'After product publish', defaultTimeout: 5000 },
  { id: 'product.beforeUnpublish', type: 'filter', description: 'Before product unpublish', defaultTimeout: 5000 },
  { id: 'product.afterUnpublish', type: 'action', description: 'After product unpublish', defaultTimeout: 5000 },
  { id: 'product.onStatusChange', type: 'action', description: 'Product status changed', defaultTimeout: 5000 },
  { id: 'product.beforeAddVariant', type: 'filter', description: 'Before add variant', defaultTimeout: 5000 },
  { id: 'product.afterAddVariant', type: 'action', description: 'After add variant', defaultTimeout: 5000 },
  { id: 'product.beforeBulkUpdate', type: 'filter', description: 'Bulk update before', defaultTimeout: 10000 },
  { id: 'product.afterBulkUpdate', type: 'action', description: 'Bulk update after', defaultTimeout: 10000 },
];

export const INVENTORY_HOOKS: HookDefinition[] = [
  { id: 'inventory.check', type: 'filter', description: 'Check stock availability', defaultTimeout: 3000 },
  { id: 'inventory.reserve', type: 'action', description: 'Reserve stock', defaultTimeout: 5000 },
  { id: 'inventory.commit', type: 'action', description: 'Commit stock', defaultTimeout: 5000 },
  { id: 'inventory.release', type: 'action', description: 'Release stock', defaultTimeout: 5000 },
];

export const CART_HOOKS: HookDefinition[] = [
  { id: 'cart.beforeAddItem', type: 'filter', description: 'Before add to cart', defaultTimeout: 3000 },
  { id: 'cart.afterAddItem', type: 'action', description: 'After add to cart', defaultTimeout: 3000 },
  { id: 'cart.beforeUpdateItem', type: 'filter', description: 'Before update cart item', defaultTimeout: 3000 },
  { id: 'cart.afterUpdateItem', type: 'action', description: 'After update cart item', defaultTimeout: 3000 },
  { id: 'cart.beforeRemoveItem', type: 'filter', description: 'Before remove from cart', defaultTimeout: 3000 },
  { id: 'cart.afterRemoveItem', type: 'action', description: 'After remove from cart', defaultTimeout: 3000 },
  { id: 'cart.onCheckoutStart', type: 'action', description: 'Checkout started', defaultTimeout: 3000 },
];

export const CHECKOUT_HOOKS: HookDefinition[] = [
  { id: 'checkout.calculate.items', type: 'filter', description: 'Calculate line item prices', defaultTimeout: 5000 },
  { id: 'checkout.calculate.discounts', type: 'filter', description: 'Apply discounts', defaultTimeout: 5000 },
  { id: 'checkout.calculate.shipping', type: 'filter', description: 'Calculate shipping', defaultTimeout: 5000 },
  { id: 'checkout.calculate.tax', type: 'filter', description: 'Calculate tax', defaultTimeout: 5000 },
  { id: 'checkout.calculate.fees', type: 'filter', description: 'Calculate additional fees', defaultTimeout: 5000 },
  { id: 'checkout.calculate.total', type: 'filter', description: 'Calculate total', defaultTimeout: 5000 },
  { id: 'checkout.validate', type: 'filter', description: 'Final validation', defaultTimeout: 5000 },
];

export const PAYMENT_HOOKS: HookDefinition[] = [
  { id: 'payment.provider.select', type: 'filter', description: 'Filter payment methods', defaultTimeout: 3000 },
  { id: 'payment.beforeProcess', type: 'filter', description: 'Before payment', defaultTimeout: 5000 },
  { id: 'payment.afterSuccess', type: 'action', description: 'Payment succeeded', defaultTimeout: 10000 },
  { id: 'payment.onFailed', type: 'action', description: 'Payment failed', defaultTimeout: 5000 },
];

export const ORDER_HOOKS: HookDefinition[] = [
  { id: 'order.beforeCreate', type: 'filter', description: 'Before order creation', defaultTimeout: 5000 },
  { id: 'order.afterCreate', type: 'action', description: 'After order creation', defaultTimeout: 10000 },
  { id: 'order.beforeCancel', type: 'filter', description: 'Before order cancel', defaultTimeout: 5000 },
  { id: 'order.afterCancel', type: 'action', description: 'After order cancel', defaultTimeout: 10000 },
  { id: 'order.beforeRefund', type: 'filter', description: 'Before refund', defaultTimeout: 5000 },
  { id: 'order.afterRefund', type: 'action', description: 'After refund', defaultTimeout: 10000 },
  { id: 'order.onPartialRefund', type: 'action', description: 'Partial refund', defaultTimeout: 5000 },
  { id: 'order.onStatusChange', type: 'action', description: 'Status changed', defaultTimeout: 5000 },
  { id: 'order.beforeShip', type: 'filter', description: 'Before shipping', defaultTimeout: 5000 },
  { id: 'order.afterShip', type: 'action', description: 'After shipping', defaultTimeout: 10000 },
  { id: 'order.onPartialShip', type: 'action', description: 'Partial shipping', defaultTimeout: 5000 },
  { id: 'order.onDelivered', type: 'action', description: 'Order delivered', defaultTimeout: 5000 },
  { id: 'order.beforeBulkCancel', type: 'filter', description: 'Bulk cancel before', defaultTimeout: 10000 },
  { id: 'order.afterBulkCancel', type: 'action', description: 'Bulk cancel after', defaultTimeout: 10000 },
];

export const ECOMMERCE_HOOKS: HookDefinition[] = [
  ...PRODUCT_HOOKS,
  ...INVENTORY_HOOKS,
  ...CART_HOOKS,
  ...CHECKOUT_HOOKS,
  ...PAYMENT_HOOKS,
  ...ORDER_HOOKS,
];
```

**Step 2: Create media hooks**

```typescript
// apps/server/src/hooks/definitions/media.hooks.ts

import { HookDefinition } from '../hook.types';

export const MEDIA_HOOKS: HookDefinition[] = [
  { id: 'media.beforeUpload', type: 'filter', description: 'Before upload - validation, virus scan', defaultTimeout: 10000 },
  { id: 'media.afterUpload', type: 'action', description: 'After upload - queue processing', defaultTimeout: 5000 },
  { id: 'media.onProcess', type: 'action', description: 'Async processing (non-blocking)', defaultTimeout: 30000 },
  { id: 'media.onProcessingComplete', type: 'action', description: 'Processing completed', defaultTimeout: 5000 },
  { id: 'media.transform', type: 'filter', description: 'On-demand transform', defaultTimeout: 10000 },
  { id: 'media.onRead', type: 'filter', description: 'On read - dynamic URL signing', defaultTimeout: 3000 },
  { id: 'media.beforeDelete', type: 'filter', description: 'Before delete - reference check', defaultTimeout: 5000 },
  { id: 'media.afterDelete', type: 'action', description: 'After delete - CDN cleanup', defaultTimeout: 10000 },
  { id: 'media.beforeBulkDelete', type: 'filter', description: 'Bulk delete before', defaultTimeout: 10000 },
  { id: 'media.afterBulkDelete', type: 'action', description: 'Bulk delete after', defaultTimeout: 10000 },
];
```

**Step 3: Create system hooks**

```typescript
// apps/server/src/hooks/definitions/system.hooks.ts

import { HookDefinition } from '../hook.types';

export const SYSTEM_HOOKS: HookDefinition[] = [
  { id: 'system.onStartup', type: 'action', description: 'After system startup', defaultTimeout: 30000 },
  { id: 'system.onShutdown', type: 'action', description: 'Before system shutdown', defaultTimeout: 10000 },
  { id: 'system.onError', type: 'action', description: 'Global uncaught error', defaultTimeout: 5000 },
  { id: 'system.health.check', type: 'filter', description: 'Health probe', defaultTimeout: 5000 },
  { id: 'system.config.onChange', type: 'action', description: 'Config changed', defaultTimeout: 5000 },
  { id: 'system.cache.beforeClear', type: 'filter', description: 'Before cache clear', defaultTimeout: 5000 },
  { id: 'system.cache.afterClear', type: 'action', description: 'After cache clear', defaultTimeout: 5000 },
  { id: 'system.cron.beforeRun', type: 'filter', description: 'Before cron job', defaultTimeout: 5000 },
  { id: 'system.cron.afterRun', type: 'action', description: 'After cron job', defaultTimeout: 5000 },
];

export const DB_HOOKS: HookDefinition[] = [
  { id: 'db.migration.beforeApply', type: 'filter', description: 'Before migration', defaultTimeout: 30000 },
  { id: 'db.migration.afterApply', type: 'action', description: 'After migration', defaultTimeout: 10000 },
];

export const PLUGIN_HOOKS: HookDefinition[] = [
  { id: 'plugin.beforeInstall', type: 'filter', description: 'Before install (by other plugins)', defaultTimeout: 10000 },
  { id: 'plugin.afterInstall', type: 'action', description: 'After install', defaultTimeout: 10000 },
  { id: 'plugin.beforeEnable', type: 'filter', description: 'Before enable', defaultTimeout: 5000 },
  { id: 'plugin.afterEnable', type: 'action', description: 'After enable', defaultTimeout: 5000 },
  { id: 'plugin.beforeDisable', type: 'filter', description: 'Before disable', defaultTimeout: 5000 },
  { id: 'plugin.afterDisable', type: 'action', description: 'After disable', defaultTimeout: 5000 },
  { id: 'plugin.beforeUninstall', type: 'filter', description: 'Before uninstall', defaultTimeout: 10000 },
  { id: 'plugin.afterUninstall', type: 'action', description: 'After uninstall', defaultTimeout: 10000 },
  { id: 'plugin.beforeUpgrade', type: 'filter', description: 'Before upgrade', defaultTimeout: 10000 },
  { id: 'plugin.onUpgrade', type: 'action', description: 'After upgrade', defaultTimeout: 10000 },
  { id: 'plugin.onError', type: 'action', description: 'Runtime error', defaultTimeout: 5000 },
  { id: 'plugin.onConflictDetected', type: 'action', description: 'Conflict detected', defaultTimeout: 5000 },
];

export const INTEGRATION_HOOKS: HookDefinition[] = [
  { id: 'webhook.beforeSend', type: 'filter', description: 'Before send - signing', defaultTimeout: 5000 },
  { id: 'webhook.afterSend', type: 'action', description: 'After send - logging', defaultTimeout: 5000 },
  { id: 'webhook.onFailed', type: 'action', description: 'Send failed', defaultTimeout: 5000 },
  { id: 'webhook.onReceive', type: 'filter', description: 'Receive external webhook', defaultTimeout: 10000 },
  { id: 'api.beforeRequest', type: 'filter', description: 'Before API request', defaultTimeout: 5000 },
  { id: 'api.afterResponse', type: 'filter', description: 'After API response', defaultTimeout: 5000 },
];

export const SECURITY_HOOKS: HookDefinition[] = [
  { id: 'audit.onLog', type: 'action', description: 'Audit log written', defaultTimeout: 5000 },
  { id: 'security.onThreatDetected', type: 'action', description: 'Threat detected', defaultTimeout: 5000 },
  { id: 'security.onSuspiciousBehavior', type: 'action', description: 'Suspicious behavior', defaultTimeout: 5000 },
  { id: 'security.onRateLimitHit', type: 'action', description: 'Rate limit hit', defaultTimeout: 3000 },
  { id: 'security.beforeSensitiveAction', type: 'filter', description: 'Before sensitive action', defaultTimeout: 5000 },
];

export const ALL_SYSTEM_HOOKS: HookDefinition[] = [
  ...SYSTEM_HOOKS,
  ...DB_HOOKS,
  ...PLUGIN_HOOKS,
  ...INTEGRATION_HOOKS,
  ...SECURITY_HOOKS,
];
```

**Step 4: Create index file**

```typescript
// apps/server/src/hooks/definitions/index.ts

import { HookDefinition } from '../hook.types';
import { CONTENT_HOOKS } from './content.hooks';
import { USER_HOOKS } from './user.hooks';
import { ECOMMERCE_HOOKS } from './ecommerce.hooks';
import { MEDIA_HOOKS } from './media.hooks';
import { ALL_SYSTEM_HOOKS } from './system.hooks';

export * from './content.hooks';
export * from './user.hooks';
export * from './ecommerce.hooks';
export * from './media.hooks';
export * from './system.hooks';

/**
 * All Core Hook Definitions
 */
export const ALL_HOOKS: HookDefinition[] = [
  ...CONTENT_HOOKS,
  ...USER_HOOKS,
  ...ECOMMERCE_HOOKS,
  ...MEDIA_HOOKS,
  ...ALL_SYSTEM_HOOKS,
];
```

**Step 5: Commit**

```bash
git add apps/server/src/hooks/definitions/
git commit -m "feat(hooks): define all 80+ core hooks"
```

---

## Phase 6: Integration & Initialization

### Task 6.1: Initialize Hooks on Startup

**Files:**
- Modify: `apps/server/src/hooks/hook.module.ts`

**Step 1: Update HookModule to register all hooks**

```typescript
// apps/server/src/hooks/hook.module.ts

import { Module, Global, OnModuleInit, Logger } from '@nestjs/common';
import { HookRegistry } from './hook-registry';
import { HookExecutor } from './hook-executor';
import { ALL_HOOKS } from './definitions';

@Global()
@Module({
  providers: [HookRegistry, HookExecutor],
  exports: [HookRegistry, HookExecutor],
})
export class HookModule implements OnModuleInit {
  private readonly logger = new Logger(HookModule.name);

  constructor(private readonly registry: HookRegistry) {}

  onModuleInit() {
    // Register all core hooks
    for (const hook of ALL_HOOKS) {
      this.registry.defineHook(hook);
    }

    this.logger.log(`🪝 Registered ${ALL_HOOKS.length} core hooks`);
  }
}
```

**Step 2: Commit**

```bash
git add apps/server/src/hooks/hook.module.ts
git commit -m "feat(hooks): auto-register all hooks on startup"
```

---

### Task 6.2: Add HookModule to App

**Files:**
- Modify: `apps/server/src/app.module.ts`

**Step 1: Import HookModule**

Add to imports in `app.module.ts`:

```typescript
import { HookModule } from './hooks/hook.module';

@Module({
  imports: [
    // ... existing imports
    HookModule,
  ],
  // ...
})
export class AppModule {}
```

**Step 2: Commit**

```bash
git add apps/server/src/app.module.ts
git commit -m "feat(hooks): integrate HookModule into app"
```

---

## Phase 7: Admin API (Optional)

### Task 7.1: Create Hooks tRPC Router

**Files:**
- Create: `apps/server/src/trpc/routers/hooks.ts`

**Step 1: Create hooks router**

```typescript
// apps/server/src/trpc/routers/hooks.ts

import { z } from 'zod';
import { router, adminProcedure } from '../trpc';
import { HookRegistry } from '../../hooks/hook-registry';

export function createHooksRouter(registry: HookRegistry) {
  return router({
    // List all defined hooks
    list: adminProcedure.query(async () => {
      return registry.getAllHooks();
    }),

    // Get handlers for a hook
    getHandlers: adminProcedure
      .input(z.object({ hookId: z.string() }))
      .query(async ({ input }) => {
        const handlers = registry.getHandlers(input.hookId);
        return handlers.map(h => ({
          id: h.id,
          pluginId: h.pluginId,
          functionName: h.functionName,
          priority: h.priority,
          enabled: h.enabled,
          timeout: h.timeout,
          stats: h.stats,
          circuitBreaker: {
            state: h.circuitBreaker.state,
            trippedAt: h.circuitBreaker.trippedAt,
          },
        }));
      }),

    // Get hook system stats
    stats: adminProcedure.query(async () => {
      const hooks = registry.getAllHooks();
      let totalHandlers = 0;
      let trippedHandlers = 0;

      for (const hook of hooks) {
        const handlers = registry.getHandlers(hook.id);
        totalHandlers += handlers.length;
        trippedHandlers += handlers.filter(h => h.circuitBreaker.state === 'open').length;
      }

      return {
        totalHooks: hooks.length,
        totalHandlers,
        trippedHandlers,
      };
    }),

    // Reset circuit breaker for a handler
    resetCircuitBreaker: adminProcedure
      .input(z.object({ handlerId: z.string() }))
      .mutation(async ({ input }) => {
        const handler = registry.getHandler(input.handlerId);
        if (!handler) {
          throw new Error('Handler not found');
        }

        handler.circuitBreaker.state = 'closed';
        handler.circuitBreaker.trippedAt = undefined;
        handler.stats.errorCount = 0;

        return { success: true };
      }),
  });
}
```

**Step 2: Commit**

```bash
git add apps/server/src/trpc/routers/hooks.ts
git commit -m "feat(hooks): add admin tRPC router for hook management"
```

---

## Final Summary

### Files Created/Modified

**New Files (16):**
- `apps/server/src/hooks/hook.types.ts`
- `apps/server/src/hooks/hook-trace.types.ts`
- `apps/server/src/hooks/hook-registry.ts`
- `apps/server/src/hooks/hook-executor.ts`
- `apps/server/src/hooks/hook.module.ts`
- `apps/server/src/hooks/snapshot.util.ts`
- `apps/server/src/hooks/index.ts`
- `apps/server/src/hooks/definitions/content.hooks.ts`
- `apps/server/src/hooks/definitions/user.hooks.ts`
- `apps/server/src/hooks/definitions/ecommerce.hooks.ts`
- `apps/server/src/hooks/definitions/media.hooks.ts`
- `apps/server/src/hooks/definitions/system.hooks.ts`
- `apps/server/src/hooks/definitions/index.ts`
- `apps/server/src/plugins/capabilities/hook.capability.ts`
- `apps/server/src/trpc/routers/hooks.ts`
- `apps/server/src/__tests__/hooks/*.test.ts` (3 test files)

**Modified Files (3):**
- `packages/plugin/src/types.ts`
- `packages/plugin/src/index.ts`
- `apps/server/src/app.module.ts`

### Test Commands

```bash
# Run all hook tests
cd apps/server && pnpm test -- --run src/__tests__/hooks/

# Run specific test
cd apps/server && pnpm test -- --run src/__tests__/hooks/hook-registry.test.ts
```

### Verification

After implementation, verify:
1. All tests pass: `pnpm test`
2. Server starts: `pnpm dev`
3. Hook count logged: "🪝 Registered 84 core hooks"

---

**Plan complete and saved to `docs/plans/2026-01-12-hook-system-implementation.md`.**

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
