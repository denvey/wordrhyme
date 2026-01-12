/**
 * Duration String Parser
 *
 * Converts human-readable duration strings to seconds.
 * Examples: '5m' → 300, '1h' → 3600, '30s' → 30, '1d' → 86400
 *
 * @see cache.types.ts - DurationString
 */

import { CacheSerializationError } from './cache.errors.js';

/**
 * Time unit multipliers (in seconds)
 */
const UNIT_MULTIPLIERS: Record<string, number> = {
  s: 1, // seconds
  m: 60, // minutes
  h: 3600, // hours
  d: 86400, // days
  w: 604800, // weeks
};

/**
 * Parse a duration string to seconds.
 *
 * @param duration Human-readable duration string (e.g., '5m', '1h') or number (seconds)
 * @returns Duration in seconds
 * @throws CacheSerializationError if format is invalid
 *
 * @example
 * parseDuration('5m') // 300
 * parseDuration('1h') // 3600
 * parseDuration(300) // 300
 * parseDuration('invalid') // throws CacheSerializationError
 */
export function parseDuration(duration: string | number): number {
  // If already a number, return as-is (assumed to be seconds)
  if (typeof duration === 'number') {
    if (duration < 0) {
      throw new CacheSerializationError(
        `TTL must be positive, got: ${duration}`
      );
    }
    return Math.floor(duration);
  }

  // Parse string format
  const match = duration.match(/^(\d+)([smhdw])$/);
  if (!match) {
    throw new CacheSerializationError(
      `Invalid duration format: "${duration}". Expected format: <number><unit> (e.g., '5m', '1h', '30s')`
    );
  }

  const [, value, unit] = match;
  const numericValue = parseInt(value!, 10);
  const multiplier = UNIT_MULTIPLIERS[unit!];

  if (!multiplier) {
    throw new CacheSerializationError(
      `Unknown time unit: "${unit}". Supported units: s, m, h, d, w`
    );
  }

  return numericValue * multiplier;
}

/**
 * Validate a duration string format without parsing.
 *
 * @param duration Duration string to validate
 * @returns True if valid format
 */
export function isValidDuration(duration: string | number): boolean {
  try {
    parseDuration(duration);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format seconds to human-readable duration string.
 * Used for logging and debugging.
 *
 * @param seconds Duration in seconds
 * @returns Human-readable string (e.g., '5m', '1h')
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
