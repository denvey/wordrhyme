/**
 * Cache System - Public API
 *
 * Unified export for all cache system components.
 */

// Core classes
export { CacheManager } from './cache-manager.js';
export { CacheModule } from './cache.module.js';

// Type definitions
export type {
  ICacheManager,
  ICacheNamespace,
  IOrganizationCacheNamespace,
  IPluginCacheNamespace,
  ICacheAdminInterface,
  CacheOptions,
  CacheStats,
  InvalidationResult,
  DurationString,
} from './cache.types.js';

// Error classes
export {
  CacheException,
  InvalidNamespaceError,
  CacheSerializationError,
  CacheInfrastructureError,
  isOperationalError,
  isInfrastructureError,
} from './cache.errors.js';

// Utilities
export { parseDuration, isValidDuration, formatDuration } from './duration-parser.js';
