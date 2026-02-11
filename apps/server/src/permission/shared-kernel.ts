/**
 * Shared Permission Kernel Singleton
 *
 * Provides a shared PermissionKernel instance with L2 cache support
 * for use in non-DI contexts (tRPC routers, scoped-db, etc.)
 *
 * Problem:
 * - PermissionKernel requires PermissionCache for L2 caching
 * - PermissionCache requires CacheManager (NestJS singleton)
 * - Many places use `new PermissionKernel()` outside DI context
 * - Without PermissionCache, every permission check hits the database
 *
 * Solution:
 * - Create a lazy-initialized singleton that:
 *   1. Creates a standalone CacheManager (connects to Redis)
 *   2. Creates PermissionCache with CacheManager
 *   3. Creates PermissionKernel with PermissionCache
 * - Export a function to get the shared instance
 *
 * Usage:
 * ```typescript
 * import { getSharedPermissionKernel } from '../permission/shared-kernel.js';
 *
 * // Instead of: const permissionKernel = new PermissionKernel();
 * const permissionKernel = getSharedPermissionKernel();
 * ```
 *
 * Note: This singleton is separate from NestJS DI. The NestJS module
 * still works independently for DI-managed contexts.
 */

import { CacheManager } from '../cache/cache-manager.js';
import { PermissionCache } from './permission-cache.js';
import { PermissionKernel } from './permission-kernel.js';

/**
 * Singleton state
 */
let sharedKernel: PermissionKernel | null = null;
let sharedCacheManager: CacheManager | null = null;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the shared singleton (called once on first access)
 */
async function initializeSharedKernel(): Promise<void> {
    if (sharedKernel) return;

    // Prevent duplicate initialization
    if (initializationPromise) {
        await initializationPromise;
        return;
    }

    initializationPromise = (async () => {
        try {
            // Create standalone CacheManager
            sharedCacheManager = new CacheManager();
            await sharedCacheManager.onModuleInit();

            // Create PermissionCache with CacheManager
            const permissionCache = new PermissionCache(sharedCacheManager);

            // Create PermissionKernel with cache
            sharedKernel = new PermissionKernel(permissionCache);

            console.log('[SharedPermissionKernel] Initialized with L2 cache support');
        } catch (error) {
            // Fallback: create kernel without cache
            console.warn('[SharedPermissionKernel] Failed to initialize with cache, using no-cache mode:', error);
            sharedKernel = new PermissionKernel();
        }
    })();

    await initializationPromise;
}

/**
 * Get the shared PermissionKernel instance
 *
 * This function returns a singleton PermissionKernel with L2 cache support.
 * On first call, it initializes the cache infrastructure.
 *
 * Note: This is a synchronous function that returns the kernel immediately.
 * If the kernel hasn't been initialized yet, it returns a no-cache instance
 * while initialization happens in the background.
 *
 * For optimal cache usage, call `ensureSharedKernelInitialized()` during
 * application startup.
 *
 * @returns PermissionKernel singleton instance
 */
export function getSharedPermissionKernel(): PermissionKernel {
    if (!sharedKernel) {
        // Start initialization in background
        initializeSharedKernel().catch(err => {
            console.error('[SharedPermissionKernel] Background initialization failed:', err);
        });

        // Return a temporary no-cache instance
        // This will be replaced by the cached one once initialization completes
        return new PermissionKernel();
    }
    return sharedKernel;
}

/**
 * Ensure the shared kernel is initialized (for startup use)
 *
 * Call this during application bootstrap to ensure the kernel
 * is ready with L2 cache before handling requests.
 *
 * @example
 * ```typescript
 * // In main.ts or bootstrap function
 * import { ensureSharedKernelInitialized } from './permission/shared-kernel.js';
 *
 * async function bootstrap() {
 *   await ensureSharedKernelInitialized();
 *   // ... rest of bootstrap
 * }
 * ```
 */
export async function ensureSharedKernelInitialized(): Promise<void> {
    await initializeSharedKernel();
}

/**
 * Shutdown the shared kernel (for graceful shutdown)
 *
 * Call this during application shutdown to clean up Redis connections.
 */
export async function shutdownSharedKernel(): Promise<void> {
    if (sharedCacheManager) {
        await sharedCacheManager.onModuleDestroy();
        sharedCacheManager = null;
    }
    sharedKernel = null;
    initializationPromise = null;
}
