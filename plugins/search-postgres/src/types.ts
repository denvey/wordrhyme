/**
 * Search Provider Types
 *
 * Re-exported from @wordrhyme/server for plugin use.
 * These types define the contract for search providers.
 */

/**
 * Search Provider Metadata
 */
export interface SearchProviderMetadata {
    id: string;
    name: string;
    version: string;
    capabilities: string[];
    default?: boolean;
    pluginId: string;
}

/**
 * Sort options
 */
export interface SearchSort {
    field: string;
    direction: 'asc' | 'desc';
    mode?: 'rank' | 'field';
}

/**
 * Search Query Parameters
 */
export interface SearchQuery {
    term: string;
    filters?: Record<string, string | number | boolean | Array<string | number | boolean> | null>;
    pagination?: { limit: number; offset: number };
    sort?: SearchSort[];
    highlight?: {
        fields?: string[];
        fragmentSize?: number;
        preTag?: string;
        postTag?: string;
    };
    language?: string;
    tenantId: string;
}

/**
 * Search Hit
 */
export interface SearchHit {
    id: string;
    score: number;
    source: Record<string, unknown>;
    highlights?: Record<string, string[]>;
}

/**
 * Search Result
 */
export interface SearchResult {
    hits: SearchHit[];
    total: number;
    took?: number;
    facets?: Record<string, Array<{ value: string; count: number }>>;
}

/**
 * Search Provider Interface
 */
export interface SearchProvider {
    readonly metadata: SearchProviderMetadata;

    initialize?(): Promise<void>;
    shutdown?(): Promise<void>;
    healthCheck?(): Promise<{ status: 'ok' | 'degraded' | 'error'; details?: unknown }>;

    indexDocument(
        index: string,
        id: string,
        doc: Record<string, unknown>,
        tenantId: string
    ): Promise<void>;

    bulkIndex(
        index: string,
        docs: Array<{ id: string; doc: Record<string, unknown> }>,
        tenantId: string
    ): Promise<void>;

    deleteDocument(index: string, id: string, tenantId: string): Promise<void>;

    search(index: string, query: SearchQuery): Promise<SearchResult>;
}

/**
 * Search Provider Factory
 */
export type SearchProviderFactory = (config: Record<string, unknown>) => SearchProvider;
