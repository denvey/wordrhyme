/**
 * Cache Management tRPC Router
 *
 * Admin API for cache monitoring and maintenance
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { CacheManager } from '../../cache/cache-manager.js';
import { TRPCError } from '@trpc/server';

/**
 * CacheManager instance (injected by TrpcModule)
 */
let cacheManager: CacheManager;

/**
 * Inject CacheManager instance from NestJS
 * Called by TrpcModule.onModuleInit()
 */
export function setCacheManager(instance: CacheManager) {
  cacheManager = instance;
}

/**
 * Cache Router
 *
 * Provides endpoints for:
 * - Cache statistics monitoring
 * - Key scanning and browsing
 * - Pattern-based invalidation
 */
export const cacheRouter = router({
  /**
   * Get cache system statistics
   *
   * Returns:
   * - Memory cache size (L1)
   * - Redis connection status (L2)
   * - Redis latency
   */
  getStats: protectedProcedure.query(async () => {
    const admin = await cacheManager.admin();
    return admin.getStats();
  }),

  /**
   * Scan keys in a namespace
   *
   * Uses Redis SCAN for production-safe iteration.
   * Supports pagination via cursor.
   */
  scanKeys: protectedProcedure
    .input(
      z.object({
        namespace: z.string().min(1).describe('Namespace pattern (e.g., "tenant:123:*")'),
        cursor: z.string().default('0').describe('Pagination cursor'),
        limit: z.number().int().min(1).max(1000).default(100).describe('Max keys per page'),
      })
    )
    .query(async ({ input }) => {
      const admin = await cacheManager.admin();

      try {
        return await admin.scan(input.namespace, input.cursor, input.limit);
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to scan keys: ${error}`,
        });
      }
    }),

  /**
   * Preview pattern invalidation (dry-run)
   *
   * Returns sample keys that would be deleted without actually deleting them.
   */
  previewInvalidation: protectedProcedure
    .input(
      z.object({
        namespace: z.string().min(1).describe('Namespace (e.g., "tenant:123")'),
        pattern: z.string().min(1).describe('Pattern to match (e.g., "users:*")'),
      })
    )
    .query(async ({ input }) => {
      try {
        // Build cache namespace
        const parts = input.namespace.split(':');
        let cache;

        if (parts[0] === 'tenant' && parts[1]) {
          cache = await cacheManager.forTenant(parts[1]);
        } else if (parts[0] === 'plugin' && parts[1]) {
          cache = await cacheManager.forPlugin(parts[1]);
        } else {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid namespace format. Expected "tenant:{id}" or "plugin:{id}"',
          });
        }

        // Add additional scope if provided
        if (parts.length > 2) {
          for (let i = 2; i < parts.length; i++) {
            cache = cache.forScope(parts[i]);
          }
        }

        // Perform dry-run
        return await cache.invalidatePattern(input.pattern, true);
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to preview invalidation: ${error}`,
        });
      }
    }),

  /**
   * Invalidate keys matching a pattern
   *
   * WARNING: This actually deletes keys. Use previewInvalidation first.
   */
  invalidatePattern: protectedProcedure
    .input(
      z.object({
        namespace: z.string().min(1).describe('Namespace (e.g., "tenant:123")'),
        pattern: z.string().min(1).describe('Pattern to match (e.g., "users:*")'),
        confirm: z.boolean().describe('Must be true to execute'),
      })
    )
    .mutation(async ({ input }) => {
      if (!input.confirm) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Confirmation required. Set confirm: true',
        });
      }

      try {
        // Build cache namespace (same logic as previewInvalidation)
        const parts = input.namespace.split(':');
        let cache;

        if (parts[0] === 'tenant' && parts[1]) {
          cache = await cacheManager.forTenant(parts[1]);
        } else if (parts[0] === 'plugin' && parts[1]) {
          cache = await cacheManager.forPlugin(parts[1]);
        } else {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid namespace format. Expected "tenant:{id}" or "plugin:{id}"',
          });
        }

        // Add additional scope if provided
        if (parts.length > 2) {
          for (let i = 2; i < parts.length; i++) {
            cache = cache.forScope(parts[i]);
          }
        }

        // Execute invalidation
        return await cache.invalidatePattern(input.pattern, false);
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to invalidate pattern: ${error}`,
        });
      }
    }),

  /**
   * List all tenants with cached data
   *
   * Scans for "tenant:*" keys and extracts unique tenant IDs.
   */
  listTenants: protectedProcedure.query(async () => {
    const admin = await cacheManager.admin();

    try {
      const organizationIds = new Set<string>();
      let cursor = '0';

      // Scan all tenant keys
      do {
        const result = await admin.scan('tenant:*', cursor, 100);

        // Extract tenant IDs from keys
        for (const key of result.keys) {
          const match = key.match(/^tenant:([^:]+)/);
          if (match && match[1]) {
            organizationIds.add(match[1]);
          }
        }

        cursor = result.cursor;

        // Safety: limit to first 100 pages
        if (organizationIds.size > 10000) break;
      } while (cursor !== '0');

      return Array.from(organizationIds).sort();
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to list tenants: ${error}`,
      });
    }
  }),

  /**
   * List all plugins with cached data
   *
   * Scans for "plugin:*" keys and extracts unique plugin IDs.
   */
  listPlugins: protectedProcedure.query(async () => {
    const admin = await cacheManager.admin();

    try {
      const pluginIds = new Set<string>();
      let cursor = '0';

      // Scan all plugin keys
      do {
        const result = await admin.scan('plugin:*', cursor, 100);

        // Extract plugin IDs from keys
        for (const key of result.keys) {
          const match = key.match(/^plugin:([^:]+)/);
          if (match && match[1]) {
            pluginIds.add(match[1]);
          }
        }

        cursor = result.cursor;

        // Safety: limit to first 100 pages
        if (pluginIds.size > 10000) break;
      } while (cursor !== '0');

      return Array.from(pluginIds).sort();
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to list plugins: ${error}`,
      });
    }
  }),
});
