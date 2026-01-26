/**
 * Search Service
 *
 * Facade service for search operations.
 * Delegates to the active search provider based on tenant configuration.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SearchProviderRegistry } from './providers/provider.registry.js';
import type {
  SearchQuery,
  SearchResult,
  SearchProviderMetadata,
  SearchHealthCheckResult,
} from './providers/provider.interface.js';

/**
 * Search Service
 *
 * Provides a unified interface for search operations.
 * Automatically routes to the active provider for each tenant.
 */
@Injectable()
export class SearchService implements OnModuleDestroy {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly registry: SearchProviderRegistry) {}

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    await this.registry.shutdownAll();
  }

  /**
   * Index a single document
   *
   * @param index Index name
   * @param id Document ID
   * @param doc Document data
   * @param organizationId Tenant ID
   */
  async indexDocument(
    index: string,
    id: string,
    doc: Record<string, unknown>,
    organizationId: string
  ): Promise<void> {
    const provider = await this.registry.getActiveProvider(organizationId);
    await provider.indexDocument(index, id, doc, organizationId);
  }

  /**
   * Bulk index multiple documents
   *
   * @param index Index name
   * @param docs Array of documents with IDs
   * @param organizationId Tenant ID
   */
  async bulkIndex(
    index: string,
    docs: Array<{ id: string; doc: Record<string, unknown> }>,
    organizationId: string
  ): Promise<void> {
    const provider = await this.registry.getActiveProvider(organizationId);
    await provider.bulkIndex(index, docs, organizationId);
  }

  /**
   * Delete a document from the index
   *
   * @param index Index name
   * @param id Document ID
   * @param organizationId Tenant ID
   */
  async deleteDocument(
    index: string,
    id: string,
    organizationId: string
  ): Promise<void> {
    const provider = await this.registry.getActiveProvider(organizationId);
    await provider.deleteDocument(index, id, organizationId);
  }

  /**
   * Search for documents
   *
   * @param index Index name
   * @param query Search query
   */
  async search(index: string, query: SearchQuery): Promise<SearchResult> {
    const provider = await this.registry.getActiveProvider(query.organizationId);
    return provider.search(index, query);
  }

  /**
   * List all registered search providers
   */
  listProviders(): SearchProviderMetadata[] {
    return this.registry.list();
  }

  /**
   * Get metadata for a specific provider
   */
  getProviderMetadata(id: string): SearchProviderMetadata | null {
    return this.registry.getMetadata(id);
  }

  /**
   * Check health of the active provider for a tenant
   */
  async healthCheck(organizationId?: string): Promise<SearchHealthCheckResult> {
    try {
      const provider = await this.registry.getActiveProvider(organizationId);
      if (provider.healthCheck) {
        return provider.healthCheck();
      }
      return { status: 'ok' };
    } catch (error) {
      this.logger.error(`Health check failed: ${error}`);
      return {
        status: 'error',
        details: { error: String(error) },
      };
    }
  }
}
