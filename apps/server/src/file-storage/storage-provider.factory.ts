import { Injectable, Logger } from '@nestjs/common';
import { StorageProvider } from './storage-provider.interface';
import { StorageProviderRegistry } from './storage-provider.registry';
import { SettingsService } from '../settings/settings.service';

/**
 * Storage Settings Keys
 */
export const STORAGE_SETTINGS = {
  PROVIDER: 'storage.provider',
  LOCAL_BASE_PATH: 'storage.local.basePath',
  LOCAL_BASE_URL: 'storage.local.baseUrl',
  LOCAL_SIGNING_SECRET: 'storage.local.signingSecret',
  UPLOAD_MAX_SIZE: 'storage.upload.maxSize',
  UPLOAD_ALLOWED_TYPES: 'storage.upload.allowedTypes',
} as const;

/**
 * Default storage configuration
 */
export const DEFAULT_STORAGE_CONFIG = {
  provider: 'local',
  maxSize: 100 * 1024 * 1024, // 100MB
  allowedTypes: ['image/*', 'video/*', 'application/pdf'],
};

/**
 * Storage Provider Factory
 *
 * Creates and manages storage provider instances based on settings.
 * Uses the registry to get provider instances.
 */
@Injectable()
export class StorageProviderFactory {
  private readonly logger = new Logger(StorageProviderFactory.name);

  constructor(
    private readonly registry: StorageProviderRegistry,
    private readonly settingsService: SettingsService
  ) {}

  /**
   * Get the active storage provider based on settings
   *
   * @param organizationId Optional tenant ID for tenant-specific config
   */
  async getProvider(organizationId?: string): Promise<StorageProvider> {
    // Get configured provider type
    const providerType = await this.settingsService.get(
      'global', STORAGE_SETTINGS.PROVIDER, { organizationId }
    ) as string | null;

    const type = providerType || DEFAULT_STORAGE_CONFIG.provider;

    // Get provider-specific configuration
    const config = await this.getProviderConfig(type, organizationId);

    const provider = this.registry.get(type, config);

    if (!provider) {
      this.logger.error(`Storage provider not found: ${type}`);
      throw new Error(`Storage provider not found: ${type}`);
    }

    return provider;
  }

  /**
   * Get configuration for a specific provider type
   */
  private async getProviderConfig(
    type: string,
    organizationId?: string
  ): Promise<Record<string, unknown>> {
    switch (type) {
      case 'local':
        return {
          basePath:
            (await this.settingsService.get(
              'global', STORAGE_SETTINGS.LOCAL_BASE_PATH, { organizationId }
            ) as string | null) || './uploads',
          baseUrl:
            (await this.settingsService.get(
              'global', STORAGE_SETTINGS.LOCAL_BASE_URL, { organizationId }
            ) as string | null) || '/api/files',
          signingSecret: await this.settingsService.get(
            'global', STORAGE_SETTINGS.LOCAL_SIGNING_SECRET, { organizationId }
          ),
        };
      default:
        // For plugin providers, load all settings with prefix storage.{type}.*
        return this.loadProviderSettings(type, organizationId);
    }
  }

  /**
   * Load all settings for a provider type
   */
  private async loadProviderSettings(
    type: string,
    _organizationId?: string
  ): Promise<Record<string, unknown>> {
    // This would typically load settings like storage.s3.region, storage.s3.bucket, etc.
    // For now, return empty object - plugin providers should handle their own config loading
    this.logger.debug(`Loading settings for provider: ${type}`);
    return {};
  }

  /**
   * Get upload validation configuration
   */
  async getUploadConfig(organizationId?: string): Promise<{
    maxSize: number;
    allowedTypes: string[];
  }> {
    const maxSize = await this.settingsService.get(
      'global', STORAGE_SETTINGS.UPLOAD_MAX_SIZE, { organizationId }
    ) as number | null;

    const allowedTypes = await this.settingsService.get(
      'global', STORAGE_SETTINGS.UPLOAD_ALLOWED_TYPES, { organizationId }
    ) as string[] | null;

    return {
      maxSize: maxSize || DEFAULT_STORAGE_CONFIG.maxSize,
      allowedTypes: allowedTypes || DEFAULT_STORAGE_CONFIG.allowedTypes,
    };
  }
}
