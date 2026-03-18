/**
 * Database Module Exports
 *
 * Main entry point for database access with automatic LBAC filtering.
 */

// Primary export: LBAC-enhanced db (Drizzle-compatible)
export { db, rawDb, createScopedDb, type Database, type CreateScopedDbOptions } from './scoped-db';

// Schema exports
export * from './schema';

// LBAC helper utilities
export {
    buildUserKeys,
    buildDefaultTags,
    type LbacContext,
} from './scoped-db';
