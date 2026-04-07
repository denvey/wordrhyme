/**
 * Hook Registry Tests
 */

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

      const handlers = registry.getHandlers('content.beforeCreate', 'platform');
      expect(handlers).toHaveLength(1);
      expect(handlers[0].pluginId).toBe('plugin-a');
    });

    it('should auto-define hook if not exists', () => {
      const handler = createMockHandler('unknown.hook', 'plugin-a');

      registry.registerHandler(handler);

      expect(registry.hasHook('unknown.hook')).toBe(true);
      expect(registry.getHandlers('unknown.hook', 'platform')).toHaveLength(1);
    });

    it('should sort handlers by priority', () => {
      const handlerA = createMockHandler('content.beforeCreate', 'plugin-a', HookPriority.LATE);
      const handlerB = createMockHandler('content.beforeCreate', 'plugin-b', HookPriority.EARLY);
      const handlerC = createMockHandler('content.beforeCreate', 'plugin-c', HookPriority.NORMAL);

      registry.registerHandler(handlerA);
      registry.registerHandler(handlerB);
      registry.registerHandler(handlerC);

      const handlers = registry.getHandlers('content.beforeCreate', 'platform');
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

      expect(registry.getHandlers('content.beforeCreate', 'platform')).toHaveLength(1);

      registry.unregisterHandler(handler.id);

      expect(registry.getHandlers('content.beforeCreate', 'platform')).toHaveLength(0);
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

      expect(registry.getHandlers('content.beforeCreate', 'platform')).toHaveLength(1);
      expect(registry.getHandlers('content.afterCreate', 'platform')).toHaveLength(0);
    });
  });

  describe('getAllHooks', () => {
    it('should return all defined hooks', () => {
      registry.defineHook({
        id: 'content.beforeCreate',
        type: 'filter',
        description: 'Test 1',
        defaultTimeout: 5000,
      });
      registry.defineHook({
        id: 'content.afterCreate',
        type: 'action',
        description: 'Test 2',
        defaultTimeout: 5000,
      });

      const hooks = registry.getAllHooks();
      expect(hooks).toHaveLength(2);
    });
  });

  describe('getTotalHandlerCount', () => {
    it('should return total number of handlers', () => {
      registry.defineHook({
        id: 'content.beforeCreate',
        type: 'filter',
        description: 'Test',
        defaultTimeout: 5000,
      });

      registry.registerHandler(createMockHandler('content.beforeCreate', 'plugin-a'));
      registry.registerHandler(createMockHandler('content.beforeCreate', 'plugin-b'));

      expect(registry.getTotalHandlerCount('platform')).toBe(2);
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
    id: `${pluginId}-${hookId}-${Date.now()}-${Math.random()}`,
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
