/**
 * Search Module Public Types
 *
 * Re-exports all public types from the search module.
 */

export type {
  SearchProvider,
  SearchProviderMetadata,
  SearchProviderCapability,
  SearchProviderFactory,
  SearchQuery,
  SearchFilters,
  SearchPagination,
  SearchSort,
  SearchHighlightOptions,
  SearchHit,
  SearchResult,
  FacetValue,
  SearchIndexConfig,
  SearchFieldConfig,
  SearchHealthCheckResult,
} from './providers/provider.interface.js';
