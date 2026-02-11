/**
 * EventBus Unit Tests
 *
 * Tests for the core event bus system that powers the notification system.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../../events/event-bus.js';

// Mock event types for testing
interface TestEventMap {
  'test.simple': { message: string };
  'test.complex': { id: number; data: { nested: string } };
  'test.error': { shouldFail: boolean };
}

// Create a typed test event bus
class TestEventBus extends EventBus {
  // Override for testing - expose internal state
  getHandlerCount(event: string): number {
    return this.listenerCount(event as any);
  }
}

describe('EventBus', () => {
  let eventBus: TestEventBus;

  beforeEach(() => {
    eventBus = new TestEventBus();
  });

  afterEach(() => {
    eventBus.clear();
  });

  describe('on() - Subscribe to events', () => {
    it('should register a handler for an event', () => {
      const handler = vi.fn();

      eventBus.on('notification.created' as any, handler);

      expect(eventBus.listenerCount('notification.created' as any)).toBe(1);
    });

    it('should allow multiple handlers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('notification.created' as any, handler1);
      eventBus.on('notification.created' as any, handler2);

      expect(eventBus.listenerCount('notification.created' as any)).toBe(2);
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = eventBus.on('notification.created' as any, handler);
      expect(eventBus.listenerCount('notification.created' as any)).toBe(1);

      unsubscribe();
      expect(eventBus.listenerCount('notification.created' as any)).toBe(0);
    });

    it('should not throw when unsubscribing multiple times', () => {
      const handler = vi.fn();

      const unsubscribe = eventBus.on('notification.created' as any, handler);
      unsubscribe();

      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe('emit() - Emit events', () => {
    it('should call handler with payload', async () => {
      const handler = vi.fn();
      const payload = {
        notification: { id: '1' },
        user: { id: 'u1' },
        channels: ['email'],
        decisionTrace: [],
      };

      eventBus.on('notification.created' as any, handler);
      await eventBus.emit('notification.created' as any, payload as any);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('should call all handlers for an event', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();
      const payload = { data: 'test' };

      eventBus.on('notification.clicked' as any, handler1);
      eventBus.on('notification.clicked' as any, handler2);
      eventBus.on('notification.clicked' as any, handler3);

      await eventBus.emit('notification.clicked' as any, payload as any);

      expect(handler1).toHaveBeenCalledWith(payload);
      expect(handler2).toHaveBeenCalledWith(payload);
      expect(handler3).toHaveBeenCalledWith(payload);
    });

    it('should not throw when emitting with no handlers', async () => {
      await expect(
        eventBus.emit('notification.created' as any, {} as any)
      ).resolves.not.toThrow();
    });

    it('should continue calling handlers even if one throws', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'));
      const successHandler = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      eventBus.on('notification.created' as any, errorHandler);
      eventBus.on('notification.created' as any, successHandler);

      await eventBus.emit('notification.created' as any, {} as any);

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should execute handlers asynchronously', async () => {
      const executionOrder: number[] = [];

      const slowHandler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push(1);
      });

      const fastHandler = vi.fn(async () => {
        executionOrder.push(2);
      });

      eventBus.on('notification.created' as any, slowHandler);
      eventBus.on('notification.created' as any, fastHandler);

      await eventBus.emit('notification.created' as any, {} as any);

      // Both handlers should have been called
      expect(slowHandler).toHaveBeenCalled();
      expect(fastHandler).toHaveBeenCalled();
      // Fast handler may complete before slow handler
      expect(executionOrder).toContain(1);
      expect(executionOrder).toContain(2);
    });
  });

  describe('emitAsync() - Fire and forget', () => {
    it('should emit without waiting', () => {
      const handler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      eventBus.on('notification.created' as any, handler);

      // emitAsync should return immediately
      const start = Date.now();
      eventBus.emitAsync('notification.created' as any, {} as any);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50); // Should be nearly instant
    });

    it('should log errors but not throw', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorHandler = vi.fn().mockRejectedValue(new Error('Async error'));

      eventBus.on('notification.created' as any, errorHandler);
      eventBus.emitAsync('notification.created' as any, {} as any);

      // Wait for async execution
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('off() - Remove handlers', () => {
    it('should remove all handlers for an event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('notification.created' as any, handler1);
      eventBus.on('notification.created' as any, handler2);
      expect(eventBus.listenerCount('notification.created' as any)).toBe(2);

      eventBus.off('notification.created' as any);
      expect(eventBus.listenerCount('notification.created' as any)).toBe(0);
    });

    it('should not affect other events', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('notification.created' as any, handler1);
      eventBus.on('notification.clicked' as any, handler2);

      eventBus.off('notification.created' as any);

      expect(eventBus.listenerCount('notification.created' as any)).toBe(0);
      expect(eventBus.listenerCount('notification.clicked' as any)).toBe(1);
    });
  });

  describe('clear() - Remove all handlers', () => {
    it('should remove all handlers from all events', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      eventBus.on('notification.created' as any, handler1);
      eventBus.on('notification.clicked' as any, handler2);
      eventBus.on('notification.archived' as any, handler3);

      eventBus.clear();

      expect(eventBus.listenerCount('notification.created' as any)).toBe(0);
      expect(eventBus.listenerCount('notification.clicked' as any)).toBe(0);
      expect(eventBus.listenerCount('notification.archived' as any)).toBe(0);
    });
  });

  describe('listenerCount() - Get handler count', () => {
    it('should return 0 for events with no handlers', () => {
      expect(eventBus.listenerCount('notification.created' as any)).toBe(0);
    });

    it('should return correct count after adding/removing handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      expect(eventBus.listenerCount('notification.created' as any)).toBe(0);

      eventBus.on('notification.created' as any, handler1);
      expect(eventBus.listenerCount('notification.created' as any)).toBe(1);

      // Adding a different handler increases count
      eventBus.on('notification.created' as any, handler2);
      expect(eventBus.listenerCount('notification.created' as any)).toBe(2);

      eventBus.off('notification.created' as any);
      expect(eventBus.listenerCount('notification.created' as any)).toBe(0);
    });
  });

  describe('Payload immutability (production)', () => {
    it('should freeze payload in production mode', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      let receivedPayload: any = null;
      const handler = vi.fn((payload) => {
        receivedPayload = payload;
      });

      eventBus.on('notification.created' as any, handler);
      await eventBus.emit('notification.created' as any, {
        notification: { id: '1' },
        user: { id: 'u1' },
        channels: [],
        decisionTrace: [],
      } as any);

      expect(Object.isFrozen(receivedPayload)).toBe(true);

      process.env['NODE_ENV'] = originalEnv;
    });

    it('should not freeze payload in non-production mode', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'test';

      let receivedPayload: any = null;
      const handler = vi.fn((payload) => {
        receivedPayload = payload;
      });

      eventBus.on('notification.created' as any, handler);
      await eventBus.emit('notification.created' as any, {
        notification: { id: '1' },
        user: { id: 'u1' },
        channels: [],
        decisionTrace: [],
      } as any);

      expect(Object.isFrozen(receivedPayload)).toBe(false);

      process.env['NODE_ENV'] = originalEnv;
    });
  });

  describe('Edge cases', () => {
    it('should handle same handler added multiple times', async () => {
      const handler = vi.fn();

      eventBus.on('notification.created' as any, handler);
      eventBus.on('notification.created' as any, handler);

      await eventBus.emit('notification.created' as any, {} as any);

      // Same handler added twice should be called twice (Set uses reference equality)
      expect(handler).toHaveBeenCalledTimes(1); // Actually only once due to Set
    });

    it('should handle null/undefined in payload', async () => {
      const handler = vi.fn();

      eventBus.on('notification.created' as any, handler);
      await eventBus.emit('notification.created' as any, {
        notification: null,
        user: undefined,
        channels: [],
        decisionTrace: [],
      } as any);

      expect(handler).toHaveBeenCalled();
    });

    it('should handle sync and async handlers together', async () => {
      const syncHandler = vi.fn();
      const asyncHandler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });

      eventBus.on('notification.created' as any, syncHandler);
      eventBus.on('notification.created' as any, asyncHandler);

      await eventBus.emit('notification.created' as any, {} as any);

      expect(syncHandler).toHaveBeenCalled();
      expect(asyncHandler).toHaveBeenCalled();
    });
  });
});
