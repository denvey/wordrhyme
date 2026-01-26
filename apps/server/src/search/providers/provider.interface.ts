/**
 * Search Provider Interface Definitions
 *
 * Defines the contract for all search providers (simple, postgres, elasticsearch, meilisearch, etc.)
 * Core only implements SimpleSearchProvider, others are provided by plugins.
 */

/**
 * Search Provider Metadata
 * Used for Admin UI and plugin registration
 */
export interface SearchProviderMetadata {
  /** Provider unique identifier */
  id: string;
  /** Display name for UI */
  name: string;
  /** Provider version */
  version: string;
  /** Supported capabilities */
  capabilities: SearchProviderCapability[];
  /** Whether this is the default provider */
  default?: boolean;
  /** Source plugin ID ('core' for built-in) */
  pluginId: string;
}

/**
 * Search Provider Capabilities
 */
export type SearchProviderCapability =
  | 'full-text'
  | 'fuzzy'
  | 'highlight'
  | 'facets'
  | 'autocomplete'
  | 'geo'
  | 'vector';

/**
 * Search Query Parameters
 */
export interface SearchQuery {
  /** Search term */
  term: string;
  /** Filter conditions */
  filters?: SearchFilters;
  /** Pagination options */
  pagination?: SearchPagination;
  /** Sort options */
  sort?: SearchSort[];
  /** Highlight options */
  highlight?: SearchHighlightOptions;
  /** Language for full-text search */
  language?: string;
  /** Tenant ID for isolation */
  organizationId: string;
}

/**
 * Filter conditions for search
 */
export type SearchFilters = Record<
  string,
  string | number | boolean | Array<string | number | boolean> | null
>;

/**
 * Pagination options
 */
export interface SearchPagination {
  /** Maximum number of results */
  limit: number;
  /** Offset for pagination */
  offset: number;
}

/**
 * Sort options
 */
export interface SearchSort {
  /** Field to sort by */
  field: string;
  /** Sort direction */
  direction: 'asc' | 'desc';
  /** Sort mode: 'rank' for relevance, 'field' for field value */
  mode?: 'rank' | 'field';
}

/**
 * Highlight options for search results
 */
export interface SearchHighlightOptions {
  /** Fields to highlight */
  fields?: string[];
  /** Fragment size for highlights */
  fragmentSize?: number;
  /** Pre-tag for highlighting */
  preTag?: string;
  /** Post-tag for highlighting */
  postTag?: string;
}

/**
 * Single search hit
 */
export interface SearchHit {
  /** Document ID */
  id: string;
  /** Relevance score */
  score: number;
  /** Document source data */
  source: Record<string, unknown>;
  /** Highlighted fragments */
  highlights?: Record<string, string[]>;
}

/**
 * Facet value with count
 */
export interface FacetValue {
  /** Facet value */
  value: string;
  /** Number of documents with this value */
  count: number;
}

/**
 * Search result
 */
export interface SearchResult {
  /** Matching documents */
  hits: SearchHit[];
  /** Total number of matching documents */
  total: number;
  /** Query execution time in milliseconds */
  took?: number;
  /** Facet results */
  facets?: Record<string, FacetValue[]>;
}

/**
 * Index configuration for a searchable entity
 */
export interface SearchIndexConfig {
  /** Index name */
  name: string;
  /** Fields to index */
  fields: SearchFieldConfig[];
  /** Language for text analysis */
  language?: string;
}

/**
 * Field configuration for indexing
 */
export interface SearchFieldConfig {
  /** Field name */
  name: string;
  /** Field type */
  type: 'text' | 'keyword' | 'number' | 'boolean' | 'date';
  /** Weight for relevance scoring (A=highest, D=lowest) */
  weight?: 'A' | 'B' | 'C' | 'D';
  /** Whether this field is searchable */
  searchable?: boolean;
  /** Whether this field is filterable */
  filterable?: boolean;
  /** Whether this field is sortable */
  sortable?: boolean;
}

/**
 * Health check result
 */
export interface SearchHealthCheckResult {
  /** Health status */
  status: 'ok' | 'degraded' | 'error';
  /** Additional details */
  details?: unknown;
}

/**
 * Search Provider Interface
 *
 * All search providers must implement this interface.
 */
export interface SearchProvider {
  /** Provider metadata */
  readonly metadata: SearchProviderMetadata;

  /**
   * Initialize the provider
   * Called when the provider is first activated
   */
  initialize?(): Promise<void>;

  /**
   * Shutdown the provider
   * Called when the provider is being deactivated
   */
  shutdown?(): Promise<void>;

  /**
   * Check provider health
   */
  healthCheck?(): Promise<SearchHealthCheckResult>;

  /**
   * Index a single document
   *
   * @param index Index name
   * @param id Document ID
   * @param doc Document data
   * @param organizationId Tenant ID for isolation
   */
  indexDocument(
    index: string,
    id: string,
    doc: Record<string, unknown>,
    organizationId: string
  ): Promise<void>;

  /**
   * Bulk index multiple documents
   *
   * @param index Index name
   * @param docs Array of documents with IDs
   * @param organizationId Tenant ID for isolation
   */
  bulkIndex(
    index: string,
    docs: Array<{ id: string; doc: Record<string, unknown> }>,
    organizationId: string
  ): Promise<void>;

  /**
   * Delete a document from the index
   *
   * @param index Index name
   * @param id Document ID
   * @param organizationId Tenant ID for isolation
   */
  deleteDocument(index: string, id: string, organizationId: string): Promise<void>;

  /**
   * Search for documents
   *
   * @param index Index name
   * @param query Search query
   */
  search(index: string, query: SearchQuery): Promise<SearchResult>;
}

/**
 * Search Provider Factory Function
 * Creates a provider instance from configuration
 */
export type SearchProviderFactory = (
  config: Record<string, unknown>
) => SearchProvider;
