/**
 * Cache Namespace - Isolated Cache Operations
 *
 * Implements namespace-scoped cache operations with automatic key prefixing.
 * Enforces governance rules through private constructors and factory methods.
 *
 * Hierarchy:
 * - CacheNamespace (abstract base class)
 * - TenantCacheNamespace (tenant-scoped, can create plugin sub-namespaces)
 * - PluginCacheNamespace (plugin-scoped)
 * - ScopedCacheNamespace (generic scope)
 * - CacheAdmin (admin interface)
 *
 * @see .claude/plan/core-cache-system.md
 * @see cache.types.ts - Interface definitions
 */

import type { CacheManager } from './cache-manager.js';
import type {
  ICacheNamespace,
  ITenantCacheNamespace,
  IPluginCacheNamespace,
  ICacheAdminInterface,
  CacheOptions,
  InvalidationResult,
  CacheStats,
} from './cache.types.js';
import { parseDuration } from './duration-parser.js';
import { InvalidNamespaceError } from './cache.errors.js';

/**
 * Base class for all namespace-scoped cache operations.
 *
 * This class enforces namespace isolation by:
 * 1. Private constructor (no direct instantiation)
 * 2. Automatic key prefixing
 * 3. Delegating to CacheManager internal methods
 */
abstract class CacheNamespace implements ICacheNamespace {
  /**
   * @param manager CacheManager instance
   * @param prefix Namespace prefix (e.g., 'tenant:123', 'plugin:crm')
   */
  constructor(
    protected readonly manager: CacheManager,
    protected readonly prefix: string
  ) {
    this.validatePrefix(prefix);
  }

  /**
   * The primary API for reading data with "Source of Truth" fallback.
   *
   * Flow:
   * 1. Check L1 (memory) cache
   * 2. Check L2 (Redis) cache
   * 3. If miss, call fetcher function
   * 4. Store result in L1 + L2
   * 5. Return result
   */
  async wrap<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    const fullKey = this.buildKey(key);
    const swallowErrors = options?.swallowErrors ?? true;

    // Try to get from cache
    const cached = await this.manager.getInternal<T>(fullKey, swallowErrors);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - call fetcher (Source of Truth)
    const fresh = await fetcher();

    // Store in cache
    const ttlSeconds = this.parseTtlOption(options?.ttl);
    await this.manager.setInternal(fullKey, fresh, ttlSeconds, swallowErrors);

    return fresh;
  }

  /**
   * Get value from cache (low-level API).
   * Prefer using `wrap` for most use cases.
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.buildKey(key);
    return this.manager.getInternal<T>(fullKey);
  }

  /**
   * Set value in cache (low-level API).
   * Prefer using `wrap` for most use cases.
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const fullKey = this.buildKey(key);
    const ttlSeconds = this.parseTtlOption(options?.ttl);
    const swallowErrors = options?.swallowErrors ?? true;
    await this.manager.setInternal(fullKey, value, ttlSeconds, swallowErrors);
  }

  /**
   * Delete a specific key from cache.
   */
  async del(key: string): Promise<void> {
    const fullKey = this.buildKey(key);
    await this.manager.delInternal(fullKey);
  }

  /**
   * Invalidate keys matching a pattern.
   *
   * @param pattern Glob pattern (e.g., 'users:*')
   * @param dryRun If true, returns count without actually deleting
   */
  async invalidatePattern(pattern: string, dryRun = false): Promise<InvalidationResult> {
    const fullPattern = this.buildKey(pattern);
    const deletedKeys = await this.manager.invalidatePatternInternal(fullPattern, dryRun);

    // Return first 10 keys as samples (for Admin UI preview)
    const sampleKeys = deletedKeys.slice(0, 10);

    return {
      count: deletedKeys.length,
      sampleKeys,
      pattern: fullPattern,
    };
  }

  /**
   * Create a sub-namespace for logical grouping.
   * Appends `:{scope}` to the current prefix.
   *
   * @example
   * ```typescript
   * const userCache = cache.forTenant('123').forScope('users');
   * // Prefix: tenant:123:users:
   * ```
   */
  forScope(scope: string): ICacheNamespace {
    return new ScopedCacheNamespace(this.manager, `${this.prefix}:${scope}`);
  }

  // ===========================
  // Protected Helper Methods
  // ===========================

  /**
   * Build full cache key with namespace prefix.
   */
  protected buildKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  /**
   * Parse TTL option to seconds.
   */
  protected parseTtlOption(ttl?: string | number): number {
    if (ttl === undefined) {
      return this.manager.getDefaultTtl();
    }
    return parseDuration(ttl);
  }

  /**
   * Validate namespace prefix format.
   */
  private validatePrefix(prefix: string): void {
    if (!prefix || prefix.trim() === '') {
      throw new InvalidNamespaceError('Namespace prefix cannot be empty');
    }

    // Disallow certain characters that could cause Redis key conflicts
    if (/[{}[\]\n\r]/.test(prefix)) {
      throw new InvalidNamespaceError(
        `Invalid characters in namespace prefix: "${prefix}"`
      );
    }
  }
}

/**
 * Tenant-scoped cache namespace.
 * Prefix: `tenant:{organizationId}:`
 *
 * Can be further narrowed by plugin:
 * ```typescript
 * cache.forTenant('123').forPlugin('crm')
 * // Prefix: tenant:123:plugin:crm:
 * ```
 */
export class TenantCacheNamespace extends CacheNamespace implements ITenantCacheNamespace {
  constructor(manager: CacheManager, organizationId: string) {
    if (!organizationId || organizationId.trim() === '') {
      throw new InvalidNamespaceError('Tenant ID cannot be empty');
    }
    super(manager, `tenant:${organizationId}`);
  }

  /**
   * Narrow down to a plugin context within this tenant.
   * Prefix: `tenant:{organizationId}:plugin:{pluginId}:`
   */
  forPlugin(pluginId: string): ICacheNamespace {
    if (!pluginId || pluginId.trim() === '') {
      throw new InvalidNamespaceError('Plugin ID cannot be empty');
    }
    return new ScopedCacheNamespace(this.manager, `${this.prefix}:plugin:${pluginId}`);
  }
}

/**
 * Plugin-scoped cache namespace.
 * Prefix: `plugin:{pluginId}:`
 *
 * Used for global plugin data (not tenant-specific).
 */
export class PluginCacheNamespace extends CacheNamespace implements IPluginCacheNamespace {
  constructor(manager: CacheManager, pluginId: string) {
    if (!pluginId || pluginId.trim() === '') {
      throw new InvalidNamespaceError('Plugin ID cannot be empty');
    }
    super(manager, `plugin:${pluginId}`);
  }
}

/**
 * Generic scoped cache namespace.
 * Used for sub-namespaces created via `forScope()`.
 */
export class ScopedCacheNamespace extends CacheNamespace {
  constructor(manager: CacheManager, prefix: string) {
    super(manager, prefix);
  }
}

/**
 * Admin interface for system maintenance and monitoring.
 *
 * Provides read-only access to cache statistics and utilities
 * for browsing keys (used by Admin UI).
 */
export class CacheAdmin implements ICacheAdminInterface {
  constructor(private readonly manager: CacheManager) {}

  /**
   * Scan keys within a specific namespace using Redis SCAN.
   *
   * Safe for production use (does not block Redis).
   *
   * @param namespace Namespace pattern (e.g., 'tenant:123:*')
   * @param cursor Pagination cursor ('0' to start)
   * @param limit Max keys per page
   */
  async scan(
    namespace: string,
    cursor: string,
    limit: number
  ): Promise<{ cursor: string; keys: string[] }> {
    return this.manager.scanKeysInternal(namespace, cursor, limit);
  }

  /**
   * Get system-wide cache statistics.
   */
  async getStats(): Promise<CacheStats> {
    return this.manager.getStatsInternal();
  }
}
