/**
 * PostgreSQL Full-text Search Plugin
 *
 * Provides PostgreSQL full-text search capabilities for WordRhyme.
 *
 * Features:
 * - tsvector/tsquery for efficient text search
 * - GIN indexes for fast lookups
 * - Relevance ranking with ts_rank_cd
 * - Multi-language support
 * - Weighted field search (A, B, C, D)
 * - Highlighting support
 *
 * Usage:
 * 1. Install the plugin
 * 2. Configure search.provider = 'postgres' in settings
 * 3. Add tsvector columns and GIN indexes to your tables
 * 4. Register index configurations via the provider
 */

// Provider
export {
    PostgresSearchProvider,
    createPostgresSearchProvider,
    type PostgresSearchFieldConfig,
    type PostgresSearchIndexConfig,
    type PostgresSearchProviderConfig,
    type DatabaseExecutor,
} from './postgres.provider.js';

// Types
export type {
    SearchProvider,
    SearchProviderMetadata,
    SearchQuery,
    SearchResult,
    SearchHit,
    SearchSort,
    SearchProviderFactory,
} from './types.js';
