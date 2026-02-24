/**
 * Storage Capability - Custom storage provider registration for plugins
 *
 * Allows plugins to register custom storage providers (e.g., S3, OSS, R2).
 * All providers registered by plugins are automatically namespaced with plugin ID.
 */
import type {
  PluginStorageCapability,
  PluginStorageProviderConfig,
  PluginStorageProviderInfo,
  PluginStorageProvider,
  PluginManifest,
} from '@wordrhyme/plugin';
import type { StorageProviderRegistry } from '../../file-storage/storage-provider.registry';
import type { StorageProvider } from '../../file-storage/storage-provider.interface';

/**
 * Create storage capability for a plugin
 *
 * @param pluginId - Plugin ID
 * @param manifest - Plugin manifest (for capability verification)
 * @param registry - Core StorageProviderRegistry instance
 * @returns PluginStorageCapability
 */
export function createPluginStorageCapability(
  pluginId: string,
  manifest: PluginManifest,
  registry: StorageProviderRegistry
): PluginStorageCapability {
  /**
   * Check if plugin has storage:provider capability declared
   */
  function requireStorageProviderCapability(): void {
    if (!manifest.capabilities?.storage?.provider) {
      throw new Error(
        `Plugin '${pluginId}' must declare 'storage.provider' capability in manifest to register storage providers`
      );
    }
  }

  /**
   * Generate namespaced provider type
   */
  function getNamespacedType(type: string): string {
    return `plugin_${pluginId.replace(/[.-]/g, '_')}_${type}`;
  }

  /**
   * Adapt PluginStorageProvider to internal StorageProvider interface
   */
  function adaptProvider(
    pluginProvider: PluginStorageProvider,
    type: string
  ): StorageProvider {
    return {
      type,

      async upload(input) {
        const result = await pluginProvider.upload({
          key: input.key,
          body: input.body as Buffer,
          contentType: input.contentType,
          ...(input.metadata != null ? { metadata: input.metadata } : {}),
        });
        return {
          key: result.key,
          size: result.size,
          ...(result.etag != null ? { etag: result.etag } : {}),
        };
      },

      async download(key) {
        return pluginProvider.download(key);
      },

      async delete(key) {
        return pluginProvider.delete(key);
      },

      async exists(key) {
        return pluginProvider.exists(key);
      },

      async getSignedUrl(key, options) {
        return pluginProvider.getSignedUrl(key, options);
      },

      getPublicUrl() {
        return null;
      },

      async initiateMultipartUpload(key) {
        return pluginProvider.initiateMultipartUpload(key);
      },

      async uploadPart(uploadId, partNumber, body) {
        return pluginProvider.uploadPart(uploadId, partNumber, body);
      },

      async completeMultipartUpload(uploadId, parts) {
        return pluginProvider.completeMultipartUpload(uploadId, parts);
      },

      async abortMultipartUpload(uploadId) {
        return pluginProvider.abortMultipartUpload(uploadId);
      },
    };
  }

  // Track registered providers for this plugin
  const registeredTypes = new Set<string>();

  return {
    async registerProvider(config: PluginStorageProviderConfig): Promise<void> {
      // Verify capability declaration
      requireStorageProviderCapability();

      const namespacedType = getNamespacedType(config.type);

      // Check if already registered
      if (registry.has(namespacedType)) {
        throw new Error(
          `Storage provider '${config.type}' is already registered by plugin '${pluginId}'`
        );
      }

      // Register with the core registry
      registry.register(
        namespacedType,
        (providerConfig) => {
          const pluginProvider = config.factory(providerConfig);
          return adaptProvider(pluginProvider, namespacedType);
        },
        {
          displayName: config.name,
          configSchema: config.configSchema,
          description: config.description,
        },
        pluginId
      );

      registeredTypes.add(config.type);
    },

    async listProviders(): Promise<PluginStorageProviderInfo[]> {
      const allProviders = registry.list();

      // Filter to only this plugin's providers
      return allProviders
        .filter((p) => p.pluginId === pluginId)
        .map((p) => {
          const info: PluginStorageProviderInfo = {
            type: p.type.replace(`plugin_${pluginId.replace(/[.-]/g, '_')}_`, ''),
            name: p.displayName,
            pluginId: p.pluginId,
          };
          if (p.description != null) {
            info.description = p.description;
          }
          return info;
        });
    },

    async unregisterProvider(type: string): Promise<void> {
      const namespacedType = getNamespacedType(type);

      if (!registeredTypes.has(type)) {
        throw new Error(
          `Storage provider '${type}' was not registered by plugin '${pluginId}'`
        );
      }

      // Note: StorageProviderRegistry doesn't have unregister method yet
      // This would need to be added to fully support plugin uninstall cleanup
      // For now, just reset the instance
      registry.resetInstance(namespacedType);
      registeredTypes.delete(type);
    },
  };
}
