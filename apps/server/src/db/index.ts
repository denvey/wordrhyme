/**
 * Database Module Exports
 *
 * Main entry point for database access with automatic LBAC filtering.
 */

// Primary export: LBAC-enhanced db (Drizzle-compatible)
export { db, rawDb, type Database } from './scoped-db';

// Schema exports
export * from './schema';

// LBAC helper utilities (still valid)
export {
    withTenantFilter,
    withTenantId,
    withTenantIdArray,
    withLbacFilter,
    withPermissionFields,
    buildUserKeys,
    buildDefaultTags,
    type LbacContext,
} from './scoped-db';
