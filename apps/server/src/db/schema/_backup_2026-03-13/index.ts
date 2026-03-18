/**
 * Server Schema Layer
 *
 * This module serves as the single entry point for all database schema definitions.
 * It re-exports from definitions.ts which contains all table definitions with FK references.
 *
 * NOTE: For types/interfaces that need to be shared with frontend, import from @wordrhyme/db/types.
 * For base Zod schemas (without API-specific validation), import from @wordrhyme/db/zod.
 * For API contract schemas (with custom validation rules), import from ./zod-api.
 */

// Re-export all database schema definitions (with FK references)
export * from './definitions';
