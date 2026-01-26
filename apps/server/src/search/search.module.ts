/**
 * Search Module
 *
 * NestJS module for the search engine integration system.
 * Provides search abstraction with pluggable providers.
 */

import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { SettingsModule } from '../settings/index.js';
import { SearchProviderRegistry } from './providers/provider.registry.js';
import { createSimpleSearchProvider } from './providers/simple.provider.js';
import { SearchService } from './search.service.js';

/**
 * Search Module
 *
 * Provides:
 * - SearchProviderRegistry: Manages search provider lifecycle
 * - SearchService: Facade for search operations
 * - SimpleSearchProvider: Default ILIKE-based search (Core built-in)
 *
 * Plugins can register additional providers (postgres, elasticsearch, meilisearch)
 * via the SearchProviderRegistry.
 */
@Module({
  imports: [SettingsModule],
  providers: [SearchProviderRegistry, SearchService],
  exports: [SearchProviderRegistry, SearchService],
})
export class SearchModule implements OnModuleInit {
  private readonly logger = new Logger(SearchModule.name);

  constructor(private readonly registry: SearchProviderRegistry) {}

  /**
   * Register built-in providers on module initialization
   */
  onModuleInit(): void {
    // Register the simple (ILIKE) provider as default
    this.registry.register(
      'simple',
      createSimpleSearchProvider,
      {
        name: 'Simple Search',
        version: '1.0.0',
        capabilities: [],
        default: true,
        pluginId: 'core',
      }
    );

    this.logger.log('Search module initialized with simple provider');
  }
}
