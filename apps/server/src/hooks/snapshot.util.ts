/**
 * Snapshot Utilities
 *
 * Utilities for creating snapshots of data for tracing.
 * Supports full clone and lean (pruned) modes.
 */

import { LeanSnapshotOptions, SnapshotMode, DEFAULT_LEAN_OPTIONS } from './hook-trace.types';

/**
 * Create a snapshot of data for tracing
 */
export function createSnapshot(
  data: unknown,
  mode: SnapshotMode,
  options: LeanSnapshotOptions = DEFAULT_LEAN_OPTIONS
): unknown {
  if (mode === 'full') {
    return structuredClone(data);
  }

  return pruneLargeObjects(data, options);
}

/**
 * Prune large objects for lean snapshots
 */
export function pruneLargeObjects(
  data: unknown,
  options: LeanSnapshotOptions,
  currentDepth: number = 0
): unknown {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return data;
  }

  // Handle primitives
  if (typeof data !== 'object') {
    if (typeof data === 'string' && data.length > options.maxStringLength) {
      return data.slice(0, options.maxStringLength) + '...';
    }
    return data;
  }

  // Check depth limit
  if (currentDepth >= options.maxDepth) {
    return '[Object depth exceeded]';
  }

  // Handle arrays
  if (Array.isArray(data)) {
    const pruned: unknown[] = [];
    const limit = Math.min(data.length, options.maxArrayLength);

    for (let i = 0; i < limit; i++) {
      pruned.push(pruneLargeObjects(data[i], options, currentDepth + 1));
    }

    if (data.length > options.maxArrayLength) {
      pruned.push(`[+${data.length - options.maxArrayLength} more]`);
    }

    return pruned;
  }

  // Handle objects
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = pruneLargeObjects(value, options, currentDepth + 1);
  }

  return result;
}
