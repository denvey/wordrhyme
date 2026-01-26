/**
 * Hook Executor Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
    organizationId: 'tenant-1',
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

    it('should return early if no handlers registered', async () => {
      registry.defineHook({
        id: 'empty.hook',
        type: 'action',
        description: 'Empty hook',
        defaultTimeout: 5000,
      });

      await expect(executor.executeAction('empty.hook', {}, mockContext)).resolves.toBeUndefined();
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
      registry.registerHandler(createHandler('content.beforeCreate', 'plugin-a', async (data: unknown) => {
        return { ...(data as object), addedByA: true };
      }, HookPriority.EARLY));

      registry.registerHandler(createHandler('content.beforeCreate', 'plugin-b', async (data: unknown) => {
        return { ...(data as object), addedByB: true };
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
      registry.registerHandler(createHandler('content.beforeCreate', 'plugin-a', async (data: unknown) => {
        (data as Record<string, unknown>).mutated = true;  // Try to mutate
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
      registry.registerHandler(createHandler('content.beforeCreate', 'plugin-a', async (data: unknown) => {
        return { ...(data as object), fromA: true };
      }, HookPriority.EARLY));

      registry.registerHandler(createHandler('content.beforeCreate', 'plugin-b', async () => {
        throw new Error('Plugin B failed');
      }, HookPriority.NORMAL));

      registry.registerHandler(createHandler('content.beforeCreate', 'plugin-c', async (data: unknown) => {
        return { ...(data as object), fromC: true };
      }, HookPriority.LATE));

      const result = await executor.executeFilter('content.beforeCreate', {}, mockContext);

      expect(result).toEqual({ fromA: true, fromC: true });
    });

    it('should return initial value if no handlers registered', async () => {
      registry.defineHook({
        id: 'empty.filter',
        type: 'filter',
        description: 'Empty filter',
        defaultTimeout: 5000,
      });

      const result = await executor.executeFilter('empty.filter', { original: true }, mockContext);
      expect(result).toEqual({ original: true });
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

    it('should skip handler when circuit breaker is open', async () => {
      const results: string[] = [];

      const handler = createHandler('test.hook', 'plugin-a', async () => {
        results.push('executed');
        throw new Error('Always fails');
      });
      handler.circuitBreaker.threshold = 2;

      registry.registerHandler(handler);

      // Trip the breaker
      await executor.executeAction('test.hook', {}, mockContext);
      await executor.executeAction('test.hook', {}, mockContext);

      expect(handler.circuitBreaker.state).toBe('open');
      expect(results).toHaveLength(2);

      // This should be skipped
      await executor.executeAction('test.hook', {}, mockContext);
      expect(results).toHaveLength(2);  // Still 2, handler was skipped
    });

    it('should reset circuit breaker on success', async () => {
      let shouldFail = true;

      const handler = createHandler('test.hook', 'plugin-a', async () => {
        if (shouldFail) {
          throw new Error('Fail');
        }
        return 'success';
      });
      handler.circuitBreaker.threshold = 2;
      handler.circuitBreaker.cooldownMs = 0;  // No cooldown for test

      registry.registerHandler(handler);

      // Trip the breaker
      await executor.executeAction('test.hook', {}, mockContext);
      await executor.executeAction('test.hook', {}, mockContext);
      expect(handler.circuitBreaker.state).toBe('open');

      // Now succeed
      shouldFail = false;

      // Need to wait for half-open transition (cooldown elapsed)
      await executor.executeAction('test.hook', {}, mockContext);

      // Should be closed now
      expect(handler.circuitBreaker.state).toBe('closed');
      expect(handler.stats.errorCount).toBe(0);
    });
  });

  describe('disabled handlers', () => {
    it('should skip disabled handlers', async () => {
      registry.defineHook({
        id: 'test.hook',
        type: 'action',
        description: 'Test',
        defaultTimeout: 5000,
      });

      const results: string[] = [];

      const handler = createHandler('test.hook', 'plugin-a', async () => {
        results.push('executed');
      });
      handler.enabled = false;

      registry.registerHandler(handler);

      await executor.executeAction('test.hook', {}, mockContext);
      expect(results).toHaveLength(0);
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
