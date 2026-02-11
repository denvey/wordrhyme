import { Injectable, Logger } from '@nestjs/common';
import { CacheManager } from '../cache/cache-manager';
import type { CaslRule } from '@wordrhyme/db';

const CACHE_SCOPE = 'permissions';
const DEFAULT_TTL = Number.parseInt(process.env['PERMISSION_CACHE_TTL'] || '300', 10);
const DEBUG_PERMISSION = process.env['DEBUG_PERMISSION'] === 'true';

/**
 * Permission cache using CacheManager
 *
 * Implements L2 cache layer with:
 * - TTL-based expiration (default 5 minutes)
 * - Graceful degradation on cache failure
 * - Organization-level cache invalidation
 */
@Injectable()
export class PermissionCache {
  private readonly logger = new Logger(PermissionCache.name);

  constructor(private readonly cacheManager: CacheManager) {}

  /**
   * Get cached permission rules
   *
   * @returns CaslRule[] if cache hit, null if miss or error
   */
  async get(orgId: string, roles: string[]): Promise<CaslRule[] | null> {
    const key = this.getCacheKey(roles);

    try {
      const cache = await this.cacheManager.forOrganization(orgId);
      const namespace = cache.forScope(CACHE_SCOPE);
      const rules = await namespace.get<CaslRule[]>(key);

      if (!rules) {
        if (DEBUG_PERMISSION) {
          this.logger.debug(`Cache MISS: org=${orgId}, roles=${roles.join(',')}`);
        }
        return null;
      }

      if (DEBUG_PERMISSION) {
        this.logger.debug(`Cache HIT: org=${orgId}, roles=${roles.join(',')} (${rules.length} rules)`);
      }
      return rules;
    } catch (error) {
      this.logger.error(`Cache read error: org=${orgId}`, error);
      return null; // Graceful degradation
    }
  }

  /**
   * Store permission rules in cache
   */
  async set(
    orgId: string,
    roles: string[],
    rules: CaslRule[],
    ttl = DEFAULT_TTL
  ): Promise<void> {
    const key = this.getCacheKey(roles);

    try {
      const cache = await this.cacheManager.forOrganization(orgId);
      const namespace = cache.forScope(CACHE_SCOPE);
      await namespace.set(key, rules, { ttl });

      if (DEBUG_PERMISSION) {
        this.logger.debug(`Cache SET: org=${orgId}, roles=${roles.join(',')} (TTL=${ttl}s, ${rules.length} rules)`);
      }
    } catch (error) {
      this.logger.error(`Cache write error: org=${orgId}`, error);
      // Don't throw - caching is best-effort
    }
  }

  /**
   * Invalidate all permission cache entries for an organization
   *
   * Uses CacheManager admin interface with SCAN
   */
  async invalidateOrganization(orgId: string): Promise<void> {
    const pattern = `org:${orgId}:${CACHE_SCOPE}:*`;

    try {
      const admin = await this.cacheManager.admin();
      let cursor = '0';
      let totalKeys = 0;

      // SCAN pattern matching (non-blocking)
      do {
        const result = await admin.scan(pattern, cursor, 100);
        cursor = result.cursor;

        if (result.keys.length > 0) {
          // Delete keys using cache namespace
          const cache = await this.cacheManager.forOrganization(orgId);
          const namespace = cache.forScope(CACHE_SCOPE);

          for (const key of result.keys) {
            // Extract the key part after the namespace prefix
            const keyPart = key.split(':').slice(3).join(':');
            await namespace.del(keyPart);
          }

          totalKeys += result.keys.length;
        }
      } while (cursor !== '0');

      if (totalKeys > 0) {
        this.logger.log(`Invalidated ${totalKeys} cache keys for org: ${orgId}`);
      }
    } catch (error) {
      this.logger.error(`Cache invalidation error: ${orgId}`, error);
    }
  }

  /**
   * Generate cache key: {role1,role2}
   *
   * Roles are sorted to ensure consistent keys
   */
  private getCacheKey(roles: string[]): string {
    return [...roles].sort().join(',');
  }
}
