/**
 * Cache Module - NestJS Module Registration
 *
 * Provides the CacheManager as a global singleton service.
 *
 * Usage in other modules:
 * ```typescript
 * import { CacheModule } from './cache/cache.module.js';
 *
 * @Module({
 *   imports: [CacheModule],
 * })
 * export class MyModule {}
 * ```
 *
 * Usage in services:
 * ```typescript
 * import { CacheManager } from './cache/cache-manager.js';
 *
 * @Injectable()
 * export class MyService {
 *   constructor(private cacheManager: CacheManager) {}
 *
 *   async getData() {
 *     const cache = this.cacheManager.forTenant(tenantId);
 *     return cache.wrap('key', () => db.fetch());
 *   }
 * }
 * ```
 */

import { Module, Global } from '@nestjs/common';
import { CacheManager } from './cache-manager.js';

/**
 * Cache Module
 *
 * @Global - CacheManager is available in all modules without explicit import
 */
@Global()
@Module({
  providers: [CacheManager],
  exports: [CacheManager],
})
export class CacheModule {}
