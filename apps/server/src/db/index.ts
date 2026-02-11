/**
 * Database Module Exports
 *
 * Main entry point for database access with automatic LBAC filtering.
 */

/**
 * Primary DB exports:
 * - `db`: LBAC-enhanced Drizzle instance (use for all business logic)
 * - `rawDb`: Raw Drizzle instance (⚠️ INTERNAL USE ONLY)
 *
 * ⚠️ `rawDb` Usage Constraints:
 * - Bypass LBAC/tenant filtering and permission checks
 * - ONLY for system-level operations (audit logs, permission checks)
 * - NEVER use in tRPC handlers or business logic
 * - Using `rawDb` requires explicit architectural justification
 */
export { db, rawDb, type Database } from './scoped-db';

// Schema exports
export * from './schema';

// LBAC helper utilities
export {
    buildUserKeys,
    buildDefaultTags,
    type LbacContext,
} from './scoped-db';
