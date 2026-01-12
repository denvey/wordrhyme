/**
 * Cache Manager - Core Implementation
 *
 * Unified cache system with L1 (Memory) + L2 (Redis) architecture.
 * Supports namespace isolation for Tenants and Plugins.
 *
 * Based on SettingsCacheService implementation with enhancements:
 * - Namespace factory methods (forTenant, forPlugin)
 * - Configurable TTL per operation
 * - Admin interface for monitoring
 * - Graceful degradation on Redis failure
 *
 * @see .claude/plan/core-cache-system.md
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import type {
  ICacheManager,
  ITenantCacheNamespace,
  IPluginCacheNamespace,
  ICacheAdminInterface,
  CacheStats,
} from './cache.types.js';
import {
  CacheInfrastructureError,
  CacheSerializationError,
  isInfrastructureError,
} from './cache.errors.js';

/**
 * Get Redis URL from environment
 */
function getRedisUrl(): string {
  return process.env['REDIS_URL'] || 'redis://localhost:6379';
}

/**
 * Cache configuration
 */
interface CacheConfig {
  memory: {
    maxSize: number;
    ttl: number; // milliseconds
  };
  redis: {
    defaultTtl: number; // seconds
  };
}

const DEFAULT_CONFIG: CacheConfig = {
  memory: {
    maxSize: 1000,
    ttl: 60_000, // 1 minute
  },
  redis: {
    defaultTtl: 3600, // 1 hour
  },
};

/**
 * Memory cache entry with expiration
 */
export interface MemoryCacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * CacheManager - Singleton service for unified caching
 *
 * This class manages the L1/L2 cache infrastructure and provides
 * factory methods for namespace-isolated cache operations.
 *
 * @example
 * ```typescript
 * const cache = cacheManager.forTenant(tenantId).forScope('users');
 * const user = await cache.wrap('profile:123', () => db.users.find(123));
 * ```
 */
@Injectable()
export class CacheManager implements ICacheManager, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheManager.name);
  private readonly config: CacheConfig = DEFAULT_CONFIG;

  // Memory cache (L1)
  private readonly memoryCache = new Map<string, MemoryCacheEntry<unknown>>();
  private readonly accessOrder: string[] = [];

  // Redis clients
  private redis: Redis | null = null;
  private subscriber: Redis | null = null;

  // Performance tracking
  private lastL2Latency = 0; // Last Redis operation latency in ms

  private readonly INVALIDATE_CHANNEL = 'cache:invalidate';

  async onModuleInit() {
    try {
      const redisUrl = getRedisUrl();
      this.redis = new Redis(redisUrl);
      this.subscriber = new Redis(redisUrl);

      // Subscribe to invalidation events
      await this.subscriber.subscribe(this.INVALIDATE_CHANNEL);
      this.subscriber.on('message', (channel, message) => {
        if (channel === this.INVALIDATE_CHANNEL) {
          this.handleInvalidateMessage(message);
        }
      });

      this.logger.log('Cache system initialized with Redis');
    } catch (error) {
      this.logger.warn(`Redis connection failed, using memory-only cache: ${error}`);
      this.redis = null;
      this.subscriber = null;
    }
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.unsubscribe(this.INVALIDATE_CHANNEL);
      await this.subscriber.quit();
    }
    if (this.redis) {
      await this.redis.quit();
    }
    this.memoryCache.clear();
  }

  // ===========================
  // Public Factory Methods
  // ===========================

  /**
   * Create a tenant-scoped cache namespace.
   * Prefix: `tenant:{tenantId}:`
   */
  async forTenant(tenantId: string): Promise<ITenantCacheNamespace> {
    // Lazy import to avoid circular dependency
    const { TenantCacheNamespace } = await import('./cache-namespace.js');
    return new TenantCacheNamespace(this, tenantId);
  }

  /**
   * Create a plugin-scoped cache namespace.
   * Prefix: `plugin:{pluginId}:`
   */
  async forPlugin(pluginId: string): Promise<IPluginCacheNamespace> {
    // Lazy import to avoid circular dependency
    const { PluginCacheNamespace } = await import('./cache-namespace.js');
    return new PluginCacheNamespace(this, pluginId);
  }

  /**
   * Get admin interface for system maintenance.
   */
  async admin(): Promise<ICacheAdminInterface> {
    // Lazy import to avoid circular dependency
    const { CacheAdmin } = await import('./cache-namespace.js');
    return new CacheAdmin(this);
  }

  // ===========================
  // Internal Methods (Called by CacheNamespace)
  // ===========================

  /**
   * Get value from cache (L1 → L2)
   * @internal Used by CacheNamespace
   */
  async getInternal<T>(fullKey: string, swallowErrors = true): Promise<T | null> {
    try {
      // 1. Check memory cache (L1)
      const memEntry = this.memoryCache.get(fullKey);
      if (memEntry && memEntry.expiresAt > Date.now()) {
        this.updateAccessOrder(fullKey);
        return memEntry.value as T;
      }

      // Remove expired entry
      if (memEntry) {
        this.memoryCache.delete(fullKey);
      }

      // 2. Check Redis cache (L2)
      if (this.redis) {
        const startTime = Date.now();
        const redisValue = await this.redis.get(fullKey);
        this.lastL2Latency = Date.now() - startTime;

        if (redisValue) {
          const parsed = JSON.parse(redisValue) as T;
          // Populate memory cache
          this.setMemory(fullKey, parsed);
          return parsed;
        }
      }

      return null;
    } catch (error) {
      if (error instanceof SyntaxError) {
        // JSON parse error - operational error, re-throw
        throw new CacheSerializationError(
          `Failed to deserialize cached value for key: ${fullKey}`,
          error as Error
        );
      }

      // Infrastructure error
      const infraError = new CacheInfrastructureError(
        `Cache get failed for key: ${fullKey}`,
        error as Error
      );

      if (swallowErrors && isInfrastructureError(infraError)) {
        this.logger.warn(infraError.message);
        return null;
      }

      throw infraError;
    }
  }

  /**
   * Set value in both caches (L1 + L2)
   * @internal Used by CacheNamespace
   */
  async setInternal<T>(
    fullKey: string,
    value: T,
    ttlSeconds: number,
    swallowErrors = true
  ): Promise<void> {
    try {
      // 1. Set in memory cache (L1)
      this.setMemory(fullKey, value);

      // 2. Set in Redis cache (L2)
      if (this.redis) {
        const serialized = JSON.stringify(value);
        await this.redis.setex(fullKey, ttlSeconds, serialized);
      }
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('circular')) {
        // Circular reference - operational error, re-throw
        throw new CacheSerializationError(
          `Cannot serialize value with circular reference for key: ${fullKey}`,
          error as Error
        );
      }

      // Infrastructure error
      const infraError = new CacheInfrastructureError(
        `Cache set failed for key: ${fullKey}`,
        error as Error
      );

      if (swallowErrors && isInfrastructureError(infraError)) {
        this.logger.warn(infraError.message);
        return;
      }

      throw infraError;
    }
  }

  /**
   * Delete a specific key
   * @internal Used by CacheNamespace
   */
  async delInternal(fullKey: string, swallowErrors = true): Promise<void> {
    try {
      // 1. Remove from local memory cache
      this.memoryCache.delete(fullKey);
      this.removeFromAccessOrder(fullKey);

      // 2. Remove from Redis and broadcast
      if (this.redis) {
        await this.redis.del(fullKey);
        await this.redis.publish(
          this.INVALIDATE_CHANNEL,
          JSON.stringify({ key: fullKey, source: process.pid })
        );
      }
    } catch (error) {
      const infraError = new CacheInfrastructureError(
        `Cache delete failed for key: ${fullKey}`,
        error as Error
      );

      if (swallowErrors && isInfrastructureError(infraError)) {
        this.logger.warn(infraError.message);
        return;
      }

      throw infraError;
    }
  }

  /**
   * Invalidate all keys matching a pattern
   * @internal Used by CacheNamespace
   * @returns List of deleted keys (for dry-run support)
   */
  async invalidatePatternInternal(
    fullPattern: string,
    dryRun = false,
    swallowErrors = true
  ): Promise<string[]> {
    try {
      const deletedKeys: string[] = [];

      // 1. Clear matching memory cache entries
      for (const key of this.memoryCache.keys()) {
        if (this.matchPattern(key, fullPattern)) {
          deletedKeys.push(key);
          if (!dryRun) {
            this.memoryCache.delete(key);
            this.removeFromAccessOrder(key);
          }
        }
      }

      // 2. Clear matching Redis entries
      if (this.redis) {
        if (dryRun) {
          // Dry run: collect sample keys for preview (limit to 100)
          const sampleKeys = await this.scanKeysForPreview(fullPattern, 100);
          deletedKeys.push(...sampleKeys);
        } else {
          // Production: stream-delete to avoid OOM
          const redisDeletedCount = await this.scanAndDeleteKeys(fullPattern);
          this.logger.log(`Invalidated ${redisDeletedCount} keys matching: ${fullPattern}`);

          // Broadcast invalidation
          await this.redis.publish(
            this.INVALIDATE_CHANNEL,
            JSON.stringify({ pattern: fullPattern, source: process.pid })
          );
        }
      }

      return deletedKeys;
    } catch (error) {
      const infraError = new CacheInfrastructureError(
        `Pattern invalidation failed for: ${fullPattern}`,
        error as Error
      );

      if (swallowErrors && isInfrastructureError(infraError)) {
        this.logger.warn(infraError.message);
        return [];
      }

      throw infraError;
    }
  }

  /**
   * Scan keys matching a pattern (using Redis SCAN for production safety)
   * @internal Used by CacheNamespace and CacheAdmin
   */
  async scanKeysInternal(pattern: string, cursor = '0', limit = 100): Promise<{
    cursor: string;
    keys: string[];
  }> {
    if (!this.redis) {
      return { cursor: '0', keys: [] };
    }

    try {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        limit
      );
      return { cursor: nextCursor, keys };
    } catch (error) {
      this.logger.warn(`Scan failed for pattern ${pattern}: ${error}`);
      return { cursor: '0', keys: [] };
    }
  }

  /**
   * Get cache statistics
   * @internal Used by CacheAdmin
   */
  getStatsInternal(): CacheStats {
    const l2Status: 'connected' | 'disconnected' = this.redis ? 'connected' : 'disconnected';

    return {
      memoryUsage: this.memoryCache.size,
      l2Status,
      l2Latency: this.lastL2Latency,
    };
  }

  /**
   * Get default TTL in seconds
   * @internal Used by CacheNamespace
   */
  getDefaultTtl(): number {
    return this.config.redis.defaultTtl;
  }

  // ===========================
  // Private Helper Methods
  // ===========================

  private setMemory<T>(fullKey: string, value: T): void {
    // Evict if at capacity
    if (this.memoryCache.size >= this.config.memory.maxSize) {
      this.evictOldest();
    }

    this.memoryCache.set(fullKey, {
      value,
      expiresAt: Date.now() + this.config.memory.ttl,
    });
    this.updateAccessOrder(fullKey);
  }

  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
  }

  private evictOldest(): void {
    // First, try to evict expired entries
    const now = Date.now();
    for (const [key, entry] of this.memoryCache) {
      if (entry.expiresAt <= now) {
        this.memoryCache.delete(key);
        this.removeFromAccessOrder(key);
        return;
      }
    }

    // If no expired entries, evict least recently accessed
    if (this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.memoryCache.delete(oldest);
      }
    }
  }

  private handleInvalidateMessage(message: string): void {
    try {
      const data = JSON.parse(message) as {
        key?: string;
        pattern?: string;
        source: number;
      };

      // Ignore messages from this process
      if (data.source === process.pid) {
        return;
      }

      if (data.key) {
        this.memoryCache.delete(data.key);
        this.removeFromAccessOrder(data.key);
      } else if (data.pattern) {
        for (const key of this.memoryCache.keys()) {
          if (this.matchPattern(key, data.pattern)) {
            this.memoryCache.delete(key);
            this.removeFromAccessOrder(key);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to handle invalidate message: ${error}`);
    }
  }

  private matchPattern(key: string, pattern: string): boolean {
    // Simple wildcard matching (supports * and ?)
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(key);
  }

  /**
   * Scan and delete keys matching a pattern (streaming, prevents OOM)
   *
   * Uses batched SCAN + DEL to avoid loading all keys into memory.
   * Safer for large tenants with 100k+ cached keys.
   *
   * @returns Total number of deleted keys
   */
  private async scanAndDeleteKeys(pattern: string): Promise<number> {
    if (!this.redis) {
      return 0;
    }

    let totalDeleted = 0;
    let cursor = '0';
    const batchSize = 100;
    const maxKeys = 10000; // Safety limit: stop after 10k keys to prevent runaway loops

    do {
      const result = await this.scanKeysInternal(pattern, cursor, batchSize);

      // Delete this batch
      if (result.keys.length > 0) {
        await this.redis.del(...result.keys);
        totalDeleted += result.keys.length;
      }

      cursor = result.cursor;

      // Safety check: prevent infinite loops or OOM
      if (totalDeleted >= maxKeys) {
        this.logger.warn(
          `Pattern invalidation hit safety limit (${maxKeys} keys). Pattern: ${pattern}`
        );
        break;
      }
    } while (cursor !== '0');

    return totalDeleted;
  }

  /**
   * Scan keys for dry-run preview (limited collection)
   *
   * Collects up to maxKeys for Admin UI preview without loading everything.
   *
   * @param pattern Redis key pattern
   * @param maxKeys Maximum keys to collect (default: 100)
   * @returns Array of sample keys
   */
  private async scanKeysForPreview(pattern: string, maxKeys = 100): Promise<string[]> {
    if (!this.redis) {
      return [];
    }

    const sampleKeys: string[] = [];
    let cursor = '0';

    do {
      const result = await this.scanKeysInternal(pattern, cursor, 100);
      sampleKeys.push(...result.keys);
      cursor = result.cursor;

      // Stop when we have enough samples
      if (sampleKeys.length >= maxKeys) {
        break;
      }
    } while (cursor !== '0');

    return sampleKeys.slice(0, maxKeys);
  }
}
