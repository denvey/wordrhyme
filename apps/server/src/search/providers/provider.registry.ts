/**
 * Search Provider Registry
 *
 * Manages registration and retrieval of search providers.
 * Core only includes 'simple' provider, others are registered by plugins.
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  SearchProvider,
  SearchProviderFactory,
  SearchProviderMetadata,
} from './provider.interface.js';
import { SettingsService } from '../../settings/settings.service.js';

/**
 * Error thrown when attempting to register a provider that already exists
 */
export class SearchProviderAlreadyRegisteredError extends Error {
  constructor(id: string) {
    super(`Search provider '${id}' is already registered`);
    this.name = 'SearchProviderAlreadyRegisteredError';
  }
}

/**
 * Error thrown when a provider is not found
 */
export class SearchProviderNotFoundError extends Error {
  constructor(id: string) {
    super(`Search provider '${id}' not found`);
    this.name = 'SearchProviderNotFoundError';
  }
}

/**
 * Settings key for search provider selection
 */
export const SEARCH_PROVIDER_SETTING_KEY = 'search.provider';

/**
 * Default provider ID
 */
export const DEFAULT_SEARCH_PROVIDER = 'simple';

/**
 * Internal registry entry
 */
interface RegistryEntry {
  factory: SearchProviderFactory;
  metadata: SearchProviderMetadata;
  instance?: SearchProvider;
}

/**
 * Search Provider Registry
 *
 * Manages search provider lifecycle:
 * - Registration/unregistration
 * - Instance creation (lazy)
 * - Active provider resolution per tenant
 */
@Injectable()
export class SearchProviderRegistry {
  private readonly logger = new Logger(SearchProviderRegistry.name);
  private readonly providers = new Map<string, RegistryEntry>();

  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Register a search provider
   *
   * @param id Provider unique identifier
   * @param factory Function to create provider instance
   * @param metadata Provider metadata
   * @throws SearchProviderAlreadyRegisteredError if provider already exists
   */
  register(
    id: string,
    factory: SearchProviderFactory,
    metadata: Omit<SearchProviderMetadata, 'id'>
  ): void {
    if (this.providers.has(id)) {
      throw new SearchProviderAlreadyRegisteredError(id);
    }

    this.providers.set(id, {
      factory,
      metadata: { ...metadata, id },
    });

    this.logger.log(`Search provider registered: ${metadata.name} (${id})`);
  }

  /**
   * Unregister a search provider
   *
   * @param id Provider ID to unregister
   * @returns true if provider was unregistered, false if not found
   */
  async unregister(id: string): Promise<boolean> {
    const entry = this.providers.get(id);
    if (!entry) {
      return false;
    }

    // Shutdown instance if exists
    if (entry.instance?.shutdown) {
      try {
        await entry.instance.shutdown();
      } catch (error) {
        this.logger.warn(`Error shutting down provider ${id}: ${error}`);
      }
    }

    this.providers.delete(id);
    this.logger.log(`Search provider unregistered: ${id}`);
    return true;
  }

  /**
   * Check if a provider is registered
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * Get a provider instance by ID
   * Uses lazy initialization
   *
   * @param id Provider ID
   * @param config Optional configuration for the provider
   * @returns Provider instance or null if not found
   */
  get(id: string, config: Record<string, unknown> = {}): SearchProvider | null {
    const entry = this.providers.get(id);
    if (!entry) {
      return null;
    }

    // Lazy instantiation
    if (!entry.instance) {
      entry.instance = entry.factory(config);
      this.logger.log(`Search provider instantiated: ${id}`);
    }

    return entry.instance;
  }

  /**
   * Get the active provider for a tenant
   *
   * Resolution order:
   * 1. Tenant-specific setting (if organizationId provided)
   * 2. Global setting
   * 3. Default provider ('simple')
   *
   * @param organizationId Tenant ID
   * @param config Optional provider configuration
   */
  async getActiveProvider(
    organizationId?: string,
    config: Record<string, unknown> = {}
  ): Promise<SearchProvider> {
    let providerId: string = DEFAULT_SEARCH_PROVIDER;

    // Try tenant-specific setting first
    if (organizationId) {
      const tenantProvider = await this.settingsService.get(
        'tenant',
        SEARCH_PROVIDER_SETTING_KEY,
        { organizationId }
      ) as string | null;

      if (tenantProvider) {
        providerId = tenantProvider;
      }
    }

    // Fall back to global setting if no tenant-specific setting
    if (providerId === DEFAULT_SEARCH_PROVIDER) {
      const globalProvider = await this.settingsService.get(
        'global',
        SEARCH_PROVIDER_SETTING_KEY,
        { defaultValue: DEFAULT_SEARCH_PROVIDER }
      ) as string;

      if (globalProvider) {
        providerId = globalProvider;
      }
    }

    const provider = this.get(providerId, config);

    if (!provider) {
      // Fallback to default if configured provider not found
      this.logger.warn(
        `Configured search provider '${providerId}' not found, falling back to '${DEFAULT_SEARCH_PROVIDER}'`
      );
      const defaultProvider = this.get(DEFAULT_SEARCH_PROVIDER, config);
      if (!defaultProvider) {
        throw new SearchProviderNotFoundError(DEFAULT_SEARCH_PROVIDER);
      }
      return defaultProvider;
    }

    return provider;
  }

  /**
   * List all registered provider metadata
   */
  list(): SearchProviderMetadata[] {
    return Array.from(this.providers.values()).map((entry) => entry.metadata);
  }

  /**
   * Get metadata for a specific provider
   */
  getMetadata(id: string): SearchProviderMetadata | null {
    return this.providers.get(id)?.metadata ?? null;
  }

  /**
   * Reset a provider instance (e.g., when config changes)
   */
  async resetInstance(id: string): Promise<void> {
    const entry = this.providers.get(id);
    if (entry?.instance) {
      // Shutdown existing instance
      if (entry.instance.shutdown) {
        try {
          await entry.instance.shutdown();
        } catch (error) {
          this.logger.warn(`Error shutting down provider ${id}: ${error}`);
        }
      }
      delete entry.instance;
      this.logger.log(`Search provider instance reset: ${id}`);
    }
  }

  /**
   * Shutdown all provider instances
   */
  async shutdownAll(): Promise<void> {
    for (const [id, entry] of this.providers) {
      if (entry.instance?.shutdown) {
        try {
          await entry.instance.shutdown();
          this.logger.log(`Search provider shutdown: ${id}`);
        } catch (error) {
          this.logger.warn(`Error shutting down provider ${id}: ${error}`);
        }
      }
    }
  }
}
