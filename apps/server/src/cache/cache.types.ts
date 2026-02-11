/**
 * Core Cache System - Type Definitions
 *
 * Based on Gemini API Design (SESSION_ID: 9ac63d38-1426-4a1e-b43c-8ef0163187c6)
 *
 * @see .claude/plan/core-cache-system.md
 */

/**
 * Human-readable duration string.
 * Examples: '5m', '1h', '30s', '1d'
 */
export type DurationString = string;

/**
 * Configuration options for cache operations.
 */
export interface CacheOptions {
  /**
   * Time To Live.
   * If omitted, defaults to system global default (e.g., '1h').
   */
  ttl?: number | DurationString;

  /**
   * If true, suppresses background cache errors (like Redis disconnection)
   * and proceeds with the fetcher/operation. Defaults to true.
   */
  swallowErrors?: boolean;
}

/**
 * Result of a dry-run invalidation operation.
 */
export interface InvalidationResult {
  /** Number of keys matched/deleted */
  count: number;
  /** List of keys (truncated if too many) for preview */
  sampleKeys: string[];
  /** Pattern used for matching */
  pattern: string;
}

/**
 * Cache statistics for monitoring and Admin UI.
 */
export interface CacheStats {
  /** L1 memory cache size (number of entries) */
  memoryUsage: number;
  /** Redis connection status */
  l2Status: 'connected' | 'disconnected';
  /** Average Redis ping latency in ms */
  l2Latency: number;
}

/**
 * The entry point for the Caching System.
 * Enforces top-level namespace isolation.
 */
export interface ICacheManager {
  /**
   * Start a cache context for a specific Tenant.
   * Prefix: `tenant:{tenantId}:`
   */
  forTenant(tenantId: string): Promise<ITenantCacheNamespace>;

  /**
   * Start a cache context for a global System Plugin.
   * Prefix: `plugin:{pluginId}:`
   */
  forPlugin(pluginId: string): Promise<IPluginCacheNamespace>;

  /**
   * Admin-only access for system maintenance.
   */
  admin(): Promise<ICacheAdminInterface>;
}

/**
 * Base interface for all Namespaced operations.
 */
export interface ICacheNamespace {
  /**
   * The primary API for reading data.
   * 1. Checks L1 -> 2. Checks L2 -> 3. Calls fetcher -> 4. Sets L1 & L2 -> 5. Returns data.
   *
   * @param key Unique key within the current namespace
   * @param fetcher The "Source of Truth" function
   * @param options TTL and behavior options
   */
  wrap<T>(key: string, fetcher: () => Promise<T>, options?: CacheOptions): Promise<T>;

  /**
   * Low-level get. Use `wrap` whenever possible.
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Low-level set. Use `wrap` whenever possible.
   */
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;

  /**
   * Deletes a specific key in this namespace.
   */
  del(key: string): Promise<void>;

  /**
   * Invalidates keys matching a pattern within this namespace.
   *
   * @param pattern Glob pattern (e.g., 'users:*')
   * @param dryRun If true, returns count without deleting
   */
  invalidatePattern(pattern: string, dryRun?: boolean): Promise<InvalidationResult>;

  /**
   * Creates a sub-namespace for logical grouping.
   * Appends `:{scope}` to the current prefix.
   */
  forScope(scope: string): ICacheNamespace;
}

/**
 * Tenant-specific context which can be further narrowed by Plugin.
 */
export interface ITenantCacheNamespace extends ICacheNamespace {
  /**
   * Narrow down to a plugin context within a tenant.
   * Prefix: `tenant:{tenantId}:plugin:{pluginId}:`
   */
  forPlugin(pluginId: string): ICacheNamespace;
}

/**
 * Plugin-specific context.
 */
export interface IPluginCacheNamespace extends ICacheNamespace {
  // Plugin specific extensions can go here
}

/**
 * Admin interface for system maintenance and monitoring.
 */
export interface ICacheAdminInterface {
  /**
   * Scan keys within a specific namespace.
   * Uses Redis SCAN for safe production usage.
   *
   * @param namespace Namespace pattern (e.g., 'tenant:123:*')
   * @param cursor Cursor for pagination ('0' to start)
   * @param limit Maximum number of keys to return per call
   */
  scan(
    namespace: string,
    cursor: string,
    limit: number
  ): Promise<{ cursor: string; keys: string[] }>;

  /**
   * Get system-wide cache statistics.
   */
  getStats(): Promise<CacheStats>;
}
