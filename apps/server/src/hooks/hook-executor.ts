/**
 * Hook Executor
 *
 * Executes hooks with:
 * - Actions: Parallel async execution
 * - Filters: Serial pipeline with defensive copying
 * - Circuit breaker protection
 * - Timeout handling
 *
 * Per EVENT_HOOK_GOVERNANCE.md (Frozen v1)
 */

import { Injectable, Logger } from '@nestjs/common';
import { HookRegistry } from './hook-registry';
import {
  HookContext,
  RuntimeHookHandler,
  HookAbortError,
  HookTimeoutError,
} from './hook.types';

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
        if (elapsed >= circuitBreaker.cooldownMs) {
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
