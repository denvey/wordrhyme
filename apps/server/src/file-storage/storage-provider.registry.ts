import { Injectable, Logger } from '@nestjs/common';
import {
  StorageProvider,
  StorageProviderFactory,
  StorageProviderMetadata,
} from './storage-provider.interface';
import { LocalStorageProvider } from './providers/local.provider';

/**
 * Error thrown when attempting to register a provider type that already exists
 */
export class ProviderAlreadyRegisteredError extends Error {
  constructor(type: string) {
    super(`Storage provider '${type}' is already registered`);
    this.name = 'ProviderAlreadyRegisteredError';
  }
}

/**
 * Storage Provider Registry
 *
 * Manages registration and retrieval of storage providers.
 * Core only includes 'local' provider, others are registered by plugins.
 */
@Injectable()
export class StorageProviderRegistry {
  private readonly logger = new Logger(StorageProviderRegistry.name);

  private readonly providers = new Map<
    string,
    {
      factory: StorageProviderFactory;
      metadata: StorageProviderMetadata;
      instance?: StorageProvider;
    }
  >();

  constructor() {
    // Register built-in local provider
    this.registerInternal(
      'local',
      (config) =>
        new LocalStorageProvider({
          basePath: (config['basePath'] as string) || './uploads',
          baseUrl: config['baseUrl'] as string | undefined,
          signingSecret: config['signingSecret'] as string | undefined,
        }),
      {
        displayName: 'Local Storage',
        configSchema: {
          type: 'object',
          properties: {
            basePath: {
              type: 'string',
              default: './uploads',
              title: 'Base Path',
              description: 'Local directory for file storage',
            },
            baseUrl: {
              type: 'string',
              title: 'Base URL',
              description: 'Base URL for file access (e.g., /api/files)',
            },
            signingSecret: {
              type: 'string',
              title: 'Signing Secret',
              description: 'Secret for signing access tokens',
              encrypted: true,
            },
          },
          required: ['basePath'],
        },
      },
      'core'
    );
  }

  /**
   * Internal registration method (for core providers)
   */
  private registerInternal(
    type: string,
    factory: StorageProviderFactory,
    metadata: Omit<StorageProviderMetadata, 'type' | 'pluginId'>,
    pluginId: string
  ): void {
    this.providers.set(type, {
      factory,
      metadata: { ...metadata, type, pluginId },
    });
    this.logger.log(`Storage provider registered: ${type} (${pluginId})`);
  }

  /**
   * Register a storage provider (called by plugins)
   *
   * @param type Provider type identifier
   * @param factory Function to create provider instance
   * @param metadata Provider metadata for UI
   * @param pluginId Source plugin ID
   */
  register(
    type: string,
    factory: StorageProviderFactory,
    metadata: Omit<StorageProviderMetadata, 'type' | 'pluginId'>,
    pluginId: string
  ): void {
    if (this.providers.has(type)) {
      throw new ProviderAlreadyRegisteredError(type);
    }

    this.registerInternal(type, factory, metadata, pluginId);
  }

  /**
   * Get a storage provider instance by type
   * Uses lazy initialization - creates instance on first access
   *
   * @param type Provider type
   * @param config Configuration for the provider
   * @returns Provider instance or null if not found
   */
  get(type: string, config: Record<string, unknown>): StorageProvider | null {
    const entry = this.providers.get(type);
    if (!entry) {
      return null;
    }

    // Lazy instantiation with provided config
    if (!entry.instance) {
      entry.instance = entry.factory(config);
      this.logger.log(`Storage provider instantiated: ${type}`);
    }

    return entry.instance;
  }

  /**
   * Get a provider by type without config (for checking existence)
   */
  has(type: string): boolean {
    return this.providers.has(type);
  }

  /**
   * Resolve a provider type, supporting both exact match and short name lookup.
   * Short names (e.g., "r2-backup") are matched against the suffix of namespaced types
   * (e.g., "plugin_com_wordrhyme_storage_s3_r2-backup").
   *
   * @returns The resolved full type, or null if not found
   */
  resolve(type: string): string | null {
    // Exact match first
    if (this.providers.has(type)) {
      return type;
    }

    // Try suffix match for plugin-namespaced providers
    const suffix = `_${type}`;
    for (const key of this.providers.keys()) {
      if (key.endsWith(suffix)) {
        return key;
      }
    }

    return null;
  }

  /**
   * List all registered provider metadata
   */
  list(): StorageProviderMetadata[] {
    return Array.from(this.providers.values()).map((entry) => entry.metadata);
  }

  /**
   * Get configuration schema for a provider type
   *
   * @param type Provider type
   * @returns JSON Schema or null if not found
   */
  getConfigSchema(type: string): Record<string, unknown> | null {
    const entry = this.providers.get(type);
    return entry?.metadata.configSchema ?? null;
  }

  /**
   * Reset a provider instance (e.g., when config changes)
   */
  resetInstance(type: string): void {
    const entry = this.providers.get(type);
    if (entry) {
      delete entry.instance;
      this.logger.log(`Storage provider instance reset: ${type}`);
    }
  }
}
