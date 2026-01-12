import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service.js';
import { FeatureFlagService } from './feature-flag.service.js';
import { EncryptionService } from './encryption.service.js';
import { SettingsCacheService } from './cache.service.js';
import { SchemaRegistryService } from './schema-registry.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { CacheModule } from '../cache/cache.module.js';

/**
 * Settings Module
 *
 * Provides configuration management services for the application:
 * - SettingsService: Four-scope settings with cascade resolution
 * - FeatureFlagService: Feature flags with tenant overrides
 * - EncryptionService: AES-256-GCM encryption for sensitive values
 * - SettingsCacheService: Two-level cache (memory + Redis) via CacheManager
 * - SchemaRegistryService: JSON Schema validation for settings
 */
@Module({
  imports: [AuditModule, CacheModule],
  providers: [
    SettingsService,
    FeatureFlagService,
    EncryptionService,
    SettingsCacheService,
    SchemaRegistryService,
  ],
  exports: [
    SettingsService,
    FeatureFlagService,
    EncryptionService,
    SettingsCacheService,
    SchemaRegistryService,
  ],
})
export class SettingsModule {}
