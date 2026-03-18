/**
 * Schema Definitions
 *
 * Re-exports all database tables from @wordrhyme/db (single source of truth)
 * Plus server-specific schemas (plugin tables)
 */

// Re-export all tables from packages/db (Single Source of Truth)
export * from '@wordrhyme/db';

// Server-specific: Plugin private tables
export * from './plugin-schemas';
