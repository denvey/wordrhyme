/**
 * Cache Error Hierarchy
 *
 * Distinguishes between Operational Errors (developer misuse)
 * and Infrastructure Errors (Redis down).
 *
 * Based on Gemini Error Handling Standards (SESSION_ID: 9ac63d38-1426-4a1e-b43c-8ef0163187c6)
 */

/**
 * Base class for all cache-related exceptions.
 */
export class CacheException extends Error {
  constructor(message: string, public override readonly cause?: Error) {
    super(message);
    this.name = 'CacheException';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Operational Error: Developer misuse or invalid input.
 *
 * These errors should be thrown (not swallowed) to alert developers.
 *
 * Examples:
 * - Missing organizationId or pluginId
 * - Invalid characters in cache key
 * - Invalid duration format
 */
export class InvalidNamespaceError extends CacheException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNamespaceError';
  }
}

/**
 * Operational Error: Failed to serialize/deserialize cache data.
 *
 * These errors should be thrown to alert developers about data issues.
 *
 * Examples:
 * - JSON.stringify fails (circular reference)
 * - JSON.parse fails (invalid JSON)
 * - Data type mismatch
 */
export class CacheSerializationError extends CacheException {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'CacheSerializationError';
  }
}

/**
 * Infrastructure Error: Redis connection or timeout issues.
 *
 * These errors should be logged and swallowed by default (graceful degradation).
 *
 * Examples:
 * - Redis connection lost
 * - Redis timeout
 * - Redis command failed
 */
export class CacheInfrastructureError extends CacheException {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'CacheInfrastructureError';
  }
}

/**
 * Type guard to check if an error is an operational error.
 * Operational errors should be re-thrown.
 */
export function isOperationalError(error: Error): boolean {
  return (
    error instanceof InvalidNamespaceError ||
    error instanceof CacheSerializationError
  );
}

/**
 * Type guard to check if an error is an infrastructure error.
 * Infrastructure errors should be logged and swallowed (unless swallowErrors=false).
 */
export function isInfrastructureError(error: Error): boolean {
  return error instanceof CacheInfrastructureError;
}
