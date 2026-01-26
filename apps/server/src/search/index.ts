/**
 * Search Module Exports
 *
 * Public API for the search engine integration system.
 */

// Module
export { SearchModule } from './search.module.js';

// Services
export { SearchService } from './search.service.js';

// Registry
export {
  SearchProviderRegistry,
  SearchProviderAlreadyRegisteredError,
  SearchProviderNotFoundError,
  SEARCH_PROVIDER_SETTING_KEY,
  DEFAULT_SEARCH_PROVIDER,
} from './providers/provider.registry.js';

// Providers
export {
  SimpleSearchProvider,
  createSimpleSearchProvider,
  type SimpleSearchIndexConfig,
  type SimpleSearchProviderConfig,
} from './providers/simple.provider.js';

// Types
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
