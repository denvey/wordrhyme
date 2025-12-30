// Re-export database client and types
export { db, type Database } from './client';
export * from './schema';

// Scoped database access (auto tenant filtering)
export { getScopedDb, withTenantFilter, withTenantId, withTenantIdArray, type ScopedDb } from './scoped-db';
