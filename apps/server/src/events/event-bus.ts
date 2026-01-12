import { Injectable } from '@nestjs/common';
import { EventMap, EventName, EventHandler } from './event-types.js';

/**
 * Core Event Bus for notification system
 *
 * Events are read-only - plugins cannot mutate event payloads.
 * In production, payloads are frozen with Object.freeze().
 */
@Injectable()
export class EventBus {
  private handlers: Map<EventName, Set<EventHandler<unknown>>> = new Map();

  /**
   * Subscribe to an event
   */
  on<K extends EventName>(
    event: K,
    handler: EventHandler<EventMap[K]>
  ): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }

    const handlers = this.handlers.get(event)!;
    handlers.add(handler as EventHandler<unknown>);

    // Return unsubscribe function
    return () => {
      handlers.delete(handler as EventHandler<unknown>);
    };
  }

  /**
   * Emit an event to all subscribers
   *
   * Event payloads are frozen to prevent mutation.
   * Handlers are called asynchronously and independently.
   */
  async emit<K extends EventName>(
    event: K,
    payload: EventMap[K]
  ): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers || handlers.size === 0) {
      return;
    }

    // Freeze payload in production to prevent mutation
    const frozenPayload =
      process.env['NODE_ENV'] === 'production'
        ? this.deepFreeze(payload)
        : payload;

    // Execute all handlers asynchronously
    const promises = Array.from(handlers).map(async (handler) => {
      try {
        await handler(frozenPayload);
      } catch (error) {
        // Log error but don't block other handlers
        console.error(`Event handler error for ${event}:`, error);
      }
    });

    // Wait for all handlers to complete (but don't throw)
    await Promise.allSettled(promises);
  }

  /**
   * Emit an event without waiting for handlers
   */
  emitAsync<K extends EventName>(event: K, payload: EventMap[K]): void {
    // Fire and forget
    this.emit(event, payload).catch((error) => {
      console.error(`Async event emission error for ${event}:`, error);
    });
  }

  /**
   * Remove all handlers for an event
   */
  off<K extends EventName>(event: K): void {
    this.handlers.delete(event);
  }

  /**
   * Remove all handlers
   */
  clear(): void {
    this.handlers.clear();
  }

  /**
   * Get handler count for an event
   */
  listenerCount<K extends EventName>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /**
   * Deep freeze an object to prevent mutation
   */
  private deepFreeze<T>(obj: T): Readonly<T> {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    Object.freeze(obj);

    for (const key of Object.keys(obj)) {
      const value = (obj as Record<string, unknown>)[key];
      if (value !== null && typeof value === 'object') {
        this.deepFreeze(value);
      }
    }

    return obj as Readonly<T>;
  }
}
