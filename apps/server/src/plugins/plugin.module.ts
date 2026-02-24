import { Module, OnModuleInit } from '@nestjs/common';
import { LazyModuleLoader } from '@nestjs/core';
import { PluginManager } from './plugin-manager';
import { PluginPermissionRegistry } from './permission-registry';
import { LogicalIsolationRuntime } from './runtime';
import { MenuRegistry } from './menu-registry';
import { PluginMigrationService } from './migration-service';
import { PluginDatabaseFactory, PluginDatabaseProvider, PLUGIN_DB } from './plugin-database.provider';
import { LoggerService } from '../observability/logger.service';
import { SettingsModule } from '../settings/settings.module';
import { SettingsService } from '../settings/settings.service';
import { FeatureFlagService } from '../settings/feature-flag.service';
import { FileStorageModule } from '../file-storage/file-storage.module';
import { StorageProviderRegistry } from '../file-storage/storage-provider.registry';
import { MediaService } from '../media/media.service';

/**
 * Singleton accessor for PluginManager (used by tRPC router)
 */
let pluginManagerInstance: PluginManager | null = null;

export function getPluginManager(): PluginManager | null {
    return pluginManagerInstance;
}

/**
 * Plugin Module
 *
 * Manages plugin lifecycle, permissions, menus, migrations, and runtime.
 * Uses LazyModuleLoader for dynamic NestJS module loading from plugins.
 */
@Module({
    imports: [SettingsModule, FileStorageModule],
    providers: [
        PluginManager,
        PluginPermissionRegistry,
        LogicalIsolationRuntime,
        MenuRegistry,
        PluginMigrationService,
        PluginDatabaseFactory,
        PluginDatabaseProvider,
    ],
    exports: [PluginManager, MenuRegistry, PluginMigrationService, PLUGIN_DB],
})
export class PluginModule implements OnModuleInit {
    constructor(
        private readonly pluginManager: PluginManager,
        private readonly lazyModuleLoader: LazyModuleLoader,
        private readonly migrationService: PluginMigrationService,
        private readonly loggerService: LoggerService,
        private readonly settingsService: SettingsService,
        private readonly featureFlagService: FeatureFlagService,
        private readonly storageProviderRegistry: StorageProviderRegistry,
        private readonly mediaService: MediaService,
    ) {
        // Store instance for tRPC access
        pluginManagerInstance = pluginManager;
    }

    async onModuleInit() {
        // Set LazyModuleLoader for dynamic plugin module loading
        this.pluginManager.setLazyModuleLoader(this.lazyModuleLoader);

        // Set MigrationService for database migrations
        this.pluginManager.setMigrationService(this.migrationService);

        // Set LoggerService for dynamic adapter switching
        this.pluginManager.setLoggerService(this.loggerService);

        // Set services needed for plugin capabilities (settings, storage, etc.)
        this.pluginManager.setCapabilityServices({
            settingsService: this.settingsService,
            featureFlagService: this.featureFlagService,
            storageProviderRegistry: this.storageProviderRegistry,
            mediaService: this.mediaService,
        });

        // Scan and load plugins on startup
        await this.pluginManager.scanAndLoadPlugins();
    }
}

