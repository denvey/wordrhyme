import { Injectable, Logger, Type } from '@nestjs/common';
import { LazyModuleLoader } from '@nestjs/core';
import { glob } from 'glob';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pluginManifestSchema, type PluginManifest } from '@wordrhyme/plugin';
import { registerPluginRouter, unregisterPluginRouter } from '../trpc/router';
import {
    registerPluginActionGroups,
    unregisterPluginActionGroups,
} from '../trpc/permission-registry';
import { db } from '../db';
import { plugins, pluginInstances, type PluginInstanceStatus as PersistedPluginInstanceStatus, auditLogs, menus, capabilities } from '@wordrhyme/db';
import { env } from '../config/env';
import { createPluginContext } from '@wordrhyme/plugin/server';
import { eq, and, ne, isNull } from 'drizzle-orm';
import { ZodError } from 'zod';
import { resolveDependencies, getCoreVersion } from './dependency-resolver';
import { createCapabilitiesForPlugin } from './capabilities';
import { MenuRegistry } from './menu-registry';
import { PluginMigrationService } from './migration-service';
import { LoggerService } from '../observability/logger.service.js';
import type { SettingsService } from '../settings/settings.service';
import type { FeatureFlagService } from '../settings/feature-flag.service';
import type { StorageProviderRegistry } from '../file-storage/storage-provider.registry';
import type { MediaService } from '../media/media.service';
import type { HookRegistry } from '../hooks/hook-registry';
import type { HookExecutor } from '../hooks/hook-executor';
import {
    defaultPluginGovernance,
    shouldDropSchemaOnInstanceUninstall,
    shouldRunInstanceInstallLifecycle,
    shouldRunInstanceMigrationsOnStartup,
    type PluginGovernanceConfig,
} from './governance';
import { createInstanceMigrationOwner } from './migration-governance';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PACKAGE_ROOT = path.resolve(__dirname, '../..');

/**
 * Plugin status
 */
export type PluginStatus = 'enabled' | 'disabled' | 'invalid' | 'crashed';

interface LoadedPlugin {
    manifest: PluginManifest;
    pluginDir: string;
    status: PluginStatus;
    governance: PluginGovernanceConfig;
    module?: {
        router?: unknown;
        schema?: unknown;
        onInstall?: (ctx: unknown) => Promise<void>;
        onEnable?: (ctx: unknown) => Promise<void>;
        onDisable?: (ctx: unknown) => Promise<void>;
        onUninstall?: (ctx: unknown) => Promise<void>;
    } | undefined;
    error?: string | undefined;
}

/**
 * Plugin Manager
 *
 * Handles plugin scanning, loading, lifecycle hooks, and validation.
 */
@Injectable()
export class PluginManager {
    private readonly logger = new Logger(PluginManager.name);
    private loadedPlugins = new Map<string, LoadedPlugin>();
    private readonly menuRegistry = new MenuRegistry();
    private lazyModuleLoader?: LazyModuleLoader;
    private migrationService?: PluginMigrationService;
    private loggerService?: LoggerService;
    private settingsService?: SettingsService;
    private featureFlagService?: FeatureFlagService;
    private storageProviderRegistry?: StorageProviderRegistry;
    private mediaService?: MediaService;
    private hookRegistry: HookRegistry | undefined;
    private hookExecutor: HookExecutor | undefined;

    /**
     * Set LazyModuleLoader for dynamic NestJS module loading
     * Called by PluginModule during initialization
     */
    setLazyModuleLoader(loader: LazyModuleLoader): void {
        this.lazyModuleLoader = loader;
    }

    /**
     * Set PluginMigrationService for database migrations
     * Called by PluginModule during initialization
     */
    setMigrationService(service: PluginMigrationService): void {
        this.migrationService = service;
    }

    /**
     * Set LoggerService for dynamic adapter switching
     * Called by PluginModule during initialization
     */
    setLoggerService(service: LoggerService): void {
        this.loggerService = service;
    }

    /**
     * Set services needed for plugin capabilities (settings, storage, etc.)
     * Called by PluginModule during initialization
     */
    setCapabilityServices(services: {
        settingsService: SettingsService;
        featureFlagService: FeatureFlagService;
        storageProviderRegistry: StorageProviderRegistry;
        mediaService: MediaService;
        hookRegistry?: HookRegistry;
        hookExecutor?: HookExecutor;
    }): void {
        this.settingsService = services.settingsService;
        this.featureFlagService = services.featureFlagService;
        this.storageProviderRegistry = services.storageProviderRegistry;
        this.mediaService = services.mediaService;
        this.hookRegistry = services.hookRegistry;
        this.hookExecutor = services.hookExecutor;
    }

    /**
     * Scan and load all plugins on startup
     */
    async scanAndLoadPlugins(): Promise<void> {
        await this._scanAndLoadPlugins();
    }

    private async _scanAndLoadPlugins(): Promise<void> {
        this.logger.log(`🔍 Scanning plugins... (Core v${getCoreVersion()})`);

        // Clean up legacy global plugin menus (organizationId = NULL, source != 'core')
        // Plugin menus are now registered per-tenant when installed/enabled
        try {
            await db.delete(menus).where(and(
                isNull(menus.organizationId),
                ne(menus.source, 'core'),
                ne(menus.source, 'custom'),
            ));
            this.logger.log('🧹 Cleaned up legacy global plugin menus');
        } catch {
            // Non-critical, ignore
        }

        const pluginDirs = await this.findPluginDirs();
        this.logger.log(`📦 Found ${pluginDirs.length} plugin directories`);

        // 1. Load all manifests
        const manifests: Array<{ manifest: PluginManifest; dir: string }> = [];
        for (const pluginDir of pluginDirs) {
            const manifestPath = path.join(pluginDir, 'manifest.json');
            try {
                const manifestRaw = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
                const manifest = pluginManifestSchema.parse(manifestRaw);
                manifests.push({ manifest, dir: pluginDir });
            } catch (error) {
                if (error instanceof ZodError) {
                    await this.markPluginInvalid(pluginDir, `Manifest validation failed: ${error.message}`);
                } else {
                    await this.markPluginInvalid(pluginDir, `Failed to parse manifest.json`);
                }
            }
        }

        // 2. Resolve dependencies and get load order
        const resolution = resolveDependencies(manifests.map(m => m.manifest));

        // 3. Mark invalid plugins
        for (const { manifest, reasons } of resolution.invalid) {
            const dirEntry = manifests.find(m => m.manifest.pluginId === manifest.pluginId);
            if (dirEntry) {
                await this.markPluginInvalid(dirEntry.dir, reasons.join('; '));
            }
        }

        // 4. Load valid plugins in dependency order
        for (const pluginId of resolution.loadOrder) {
            const entry = manifests.find(m => m.manifest.pluginId === pluginId);
            if (entry) {
                try {
                    await this.loadPlugin(entry.dir, entry.manifest);
                } catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    this.logger.error(`❌ Failed to load plugin ${pluginId}: ${err.message}`);
                }
            }
        }
    }

    /**
     * Find all plugin directories containing manifest.json
     */
    private async findPluginDirs(): Promise<string[]> {
        const pluginDir = path.isAbsolute(env.PLUGIN_DIR)
            ? env.PLUGIN_DIR
            : path.resolve(SERVER_PACKAGE_ROOT, env.PLUGIN_DIR);

        try {
            await fs.access(pluginDir);
        } catch {
            this.logger.log(`📁 Plugin directory not found: ${pluginDir}`);
            return [];
        }

        const manifests = await glob('*/manifest.json', { cwd: pluginDir, absolute: true });
        return manifests.map(m => path.dirname(m));
    }

    /**
     * Load a single plugin from directory
     * @param pluginDir - Plugin directory path
     * @param manifest - Pre-parsed and validated manifest
     */
    private async loadPlugin(
        pluginDir: string,
        manifest: PluginManifest,
        governance: PluginGovernanceConfig = defaultPluginGovernance,
    ): Promise<void> {
        this.logger.log(`📦 Loading plugin: ${manifest.pluginId} v${manifest.version}`);

        // Check safe mode
        if (env.WORDRHYME_SAFE_MODE && !manifest.pluginId.startsWith('core.')) {
            this.logger.log(`🔒 Skipping non-core plugin in safe mode: ${manifest.pluginId}`);
            return;
        }

        // 3. Check if this is first install
        const existingRecord = await db.select({
            status: pluginInstances.status,
        })
            .from(pluginInstances)
            .where(eq(pluginInstances.pluginId, manifest.pluginId))
            .limit(1);

        const isFirstInstall = existingRecord.length === 0;
        const desiredInstanceStatus = existingRecord[0]?.status === 'installed'
            ? 'installed'
            : 'loaded';

        // 4. Load server module if exists
        let module: LoadedPlugin['module'];
        if (manifest.server?.entry) {
            const entryPath = path.join(pluginDir, manifest.server.entry);
            try {
                module = await import(entryPath);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                await this.markPluginCrashed(manifest.pluginId, pluginDir, manifest, `Failed to load server entry: ${err.message}`, governance);
                return;
            }
        }

        // 5. Run startup-managed instance migrations
        if (
            this.migrationService
            && shouldRunInstanceMigrationsOnStartup(governance, isFirstInstall)
        ) {
            try {
                await this.migrationService.runMigrations(
                    manifest.pluginId,
                    pluginDir,
                    createInstanceMigrationOwner(),
                );
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                await this.markPluginCrashed(manifest.pluginId, pluginDir, manifest, `Database migration failed: ${err.message}`, governance);
                return;
            }
        }

        // 6. Only instance-managed compatibility mode treats first load as install-time init.
        if (
            shouldRunInstanceInstallLifecycle(governance, isFirstInstall)
            && module?.onInstall
        ) {
            try {
                const ctx = this.createPluginCapabilitiesFromManifest(manifest);
                await module.onInstall(ctx);
                this.logger.log(`✅ ${manifest.pluginId}.onInstall completed`);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                await this.markPluginCrashed(manifest.pluginId, pluginDir, manifest, `onInstall failed: ${err.message}`, governance);
                return;
            }
        }

        if (desiredInstanceStatus === 'loaded') {
            // 7. Activate runtime extensions for this deployment instance.
            if (module?.onEnable) {
                try {
                    const ctx = this.createPluginCapabilitiesFromManifest(manifest);
                    await module.onEnable(ctx);
                    this.logger.log(`✅ ${manifest.pluginId}.onEnable completed`);
                } catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    await this.markPluginCrashed(manifest.pluginId, pluginDir, manifest, `onEnable failed: ${err.message}`, governance);
                    return;
                }
            }

            // 7. Register tRPC router if exists
            if (module?.router) {
                registerPluginRouter(manifest.pluginId, module.router);
            }

            // 7b. Register permission actionGroups from manifest (for Presets UI)
            if (manifest.permissions?.actionGroups) {
                registerPluginActionGroups(manifest.pluginId, manifest.permissions.actionGroups);
            }

            // 8. Reconcile per-tenant menus on startup
            // Ensures manifest changes (e.g. parentCode fixes) are applied to existing installations
            if (manifest.admin?.extensions?.length || manifest.admin?.menus?.length) {
                try {
                    const tenantInstalls = await db
                        .select({
                            organizationId: plugins.organizationId,
                            activationStatus: plugins.activationStatus,
                        })
                        .from(plugins)
                        .where(and(
                            eq(plugins.pluginId, manifest.pluginId),
                            eq(plugins.installationStatus, 'installed'),
                        ));

                    for (const { organizationId, activationStatus } of tenantInstalls) {
                        await this.menuRegistry.registerPluginMenus(manifest, organizationId);
                        if (activationStatus !== 'enabled') {
                            await this.menuRegistry.setPluginMenusVisibility(manifest.pluginId, organizationId, false);
                        }
                    }

                    if (tenantInstalls.length > 0) {
                        this.logger.log(`🔄 Reconciled menus for ${manifest.pluginId} across ${tenantInstalls.length} tenant(s)`);
                    }
                } catch (error) {
                    this.logger.warn(`Failed to reconcile menus for ${manifest.pluginId}:`, error);
                }
            }
        }

        // 9. Load NestJS Module if declared (Advanced Plugin mode)
        if (manifest.server?.nestModule && this.lazyModuleLoader) {
            const nestModulePath = path.join(pluginDir, manifest.server.nestModule);
            try {
                const { default: PluginNestModule } = await import(nestModulePath);
                await this.lazyModuleLoader.load(() => PluginNestModule as Type<unknown>);
                this.logger.log(`🔌 NestJS Module loaded: ${manifest.pluginId}`);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.logger.warn(`Failed to load NestJS module for ${manifest.pluginId}: ${err.message}`);
                // Don't fail plugin loading for optional NestJS module
            }
        }

        // 10. Store in memory
        this.loadedPlugins.set(manifest.pluginId, {
            manifest,
            pluginDir,
            module,
            status: desiredInstanceStatus === 'loaded' ? 'enabled' : 'disabled',
            governance,
        });

        await this.persistInstanceStatus(manifest, desiredInstanceStatus);

        // 11. Register billing capabilities from manifest
        if (manifest.capabilities?.billing?.subjects?.length) {
            await this.registerBillingCapabilities(manifest);
        }

        // 12. Check for logger-adapter capability
        if (manifest.capabilities?.provides?.includes('logger-adapter')) {
            await this.loadLoggerAdapter(manifest, pluginDir);
        }

        this.logger.log(`✅ Plugin loaded: ${manifest.pluginId}`);
    }

    /**
     * Load logger adapter from plugin
     * Called when a plugin provides logger-adapter capability
     */
    private async loadLoggerAdapter(manifest: PluginManifest, pluginDir: string): Promise<void> {
        if (!this.loggerService) {
            this.logger.warn(`LoggerService not available, skipping logger adapter from ${manifest.pluginId}`);
            return;
        }

        if (!manifest.exports?.loggerAdapter) {
            this.logger.warn(`Plugin ${manifest.pluginId} declares logger-adapter capability but missing exports.loggerAdapter`);
            return;
        }

        try {
            const adapterPath = path.join(pluginDir, manifest.exports.loggerAdapter);
            const adapterModule = await import(adapterPath);

            // Call factory function (default export or createLoggerAdapter)
            const factory = adapterModule.default || adapterModule.createLoggerAdapter;
            if (typeof factory !== 'function') {
                throw new Error('Logger adapter module must export a factory function');
            }

            const adapter = factory();
            this.loggerService.switchAdapter(adapter);
            this.logger.log(`🔄 Logger adapter switched to: ${manifest.pluginId}`);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Failed to load logger adapter from ${manifest.pluginId}: ${err.message}`);
        }
    }

    /**
     * Register billing capabilities from plugin manifest
     * Capabilities are registered with status='approved' (no admin approval required).
     * The four-layer billing guard handles access control at runtime.
     */
    private async registerBillingCapabilities(manifest: PluginManifest): Promise<void> {
        const subjects = manifest.capabilities?.billing?.subjects;
        if (!subjects?.length) return;

        for (const cap of subjects) {
            // Namespace validation: reject core.* prefix from plugins
            if (cap.subject.startsWith('core.')) {
                this.logger.warn(
                    `Plugin ${manifest.pluginId} attempted to register core namespace capability: ${cap.subject}. Skipping.`
                );
                continue;
            }

            // Namespace validation: plugin capabilities MUST use {pluginId}.* prefix
            if (!cap.subject.startsWith(`${manifest.pluginId}.`)) {
                this.logger.warn(
                    `Plugin ${manifest.pluginId} capability "${cap.subject}" must use "${manifest.pluginId}." prefix. Skipping.`
                );
                continue;
            }

            try {
                await db
                    .insert(capabilities)
                    .values({
                        subject: cap.subject,
                        type: cap.type,
                        unit: cap.unit ?? null,
                        description: cap.description ?? null,
                        source: 'plugin',
                        pluginId: manifest.pluginId,
                        status: 'approved',
                    })
                    .onConflictDoUpdate({
                        target: [capabilities.subject],
                        set: {
                            type: cap.type,
                            unit: cap.unit ?? null,
                            description: cap.description ?? null,
                        },
                    });
            } catch (error) {
                this.logger.warn(`Failed to register capability ${cap.subject} for ${manifest.pluginId}:`, error);
            }
        }

        this.logger.log(`📋 Processed ${subjects.length} billing capability(s) for ${manifest.pluginId}`);
    }

    /**
     * Mark plugin as invalid (manifest validation failed)
     */
    private async markPluginInvalid(pluginDir: string, reason: string): Promise<void> {
        const dirName = path.basename(pluginDir);
        this.logger.error(`❌ Plugin invalid (${dirName}): ${reason}`);

        // Log audit entry
        await this.logAudit({
            actorType: 'system',
            actorId: 'plugin-manager',
            organizationId: 'system',
            action: 'plugin.validation.failed',
            resource: dirName,
            result: 'error',
            reason,
            metadata: { pluginDir },
        });
    }

    /**
     * Mark plugin as crashed (lifecycle hook failed)
     */
    private async markPluginCrashed(
        pluginId: string,
        pluginDir: string,
        manifest: PluginManifest,
        reason: string,
        governance: PluginGovernanceConfig = defaultPluginGovernance,
    ): Promise<void> {
        this.logger.error(`❌ Plugin crashed (${pluginId}): ${reason}`);

        // Store with crashed status
        this.loadedPlugins.set(pluginId, {
            manifest,
            pluginDir,
            status: 'crashed',
            error: reason,
            governance,
        });

        await this.persistInstanceStatus(manifest, 'failed');

        // Log audit entry
        await this.logAudit({
            actorType: 'system',
            actorId: 'plugin-manager',
            organizationId: 'system',
            action: 'plugin.lifecycle.failed',
            resource: pluginId,
            result: 'error',
            reason,
            metadata: { pluginDir, version: manifest.version },
        });
    }

    // ==================== Tenant-level Menu Management ====================

    /**
     * Register plugin menus for a specific tenant (called on install/enable)
     */
    async registerMenusForTenant(pluginId: string, organizationId: string): Promise<void> {
        const plugin = this.loadedPlugins.get(pluginId);
        if (!plugin) return;

        const { manifest } = plugin;
        if (!manifest.admin?.extensions?.length && !manifest.admin?.menus?.length) return;

        try {
            await this.menuRegistry.registerPluginMenus(manifest, organizationId);
        } catch (error) {
            this.logger.warn(`Failed to register menus for ${pluginId} in org ${organizationId}:`, error);
        }
    }

    /**
     * Unregister plugin menus for a specific tenant (called on uninstall — true delete)
     */
    async unregisterMenusForTenant(pluginId: string, organizationId: string): Promise<void> {
        try {
            await this.menuRegistry.unregisterPluginMenus(pluginId, organizationId);
        } catch (error) {
            this.logger.warn(`Failed to unregister menus for ${pluginId} in org ${organizationId}:`, error);
        }
    }

    /**
     * Hide plugin menus for a tenant (called on disable).
     * Preserves menu records and user customizations.
     */
    async disableMenusForTenant(pluginId: string, organizationId: string): Promise<void> {
        try {
            await this.menuRegistry.setPluginMenusVisibility(pluginId, organizationId, false);
        } catch (error) {
            this.logger.warn(`Failed to hide menus for ${pluginId} in org ${organizationId}:`, error);
        }
    }

    /**
     * Show plugin menus for a tenant (called on enable).
     * Also reconciles menu structure with current manifest.
     */
    async enableMenusForTenant(pluginId: string, organizationId: string): Promise<void> {
        const plugin = this.loadedPlugins.get(pluginId);
        if (!plugin) return;

        try {
            // First reconcile (handles manifest changes since last enable)
            await this.menuRegistry.registerPluginMenus(plugin.manifest, organizationId);
            // Then ensure visible
            await this.menuRegistry.setPluginMenusVisibility(pluginId, organizationId, true);
        } catch (error) {
            this.logger.warn(`Failed to enable menus for ${pluginId} in org ${organizationId}:`, error);
        }
    }

    /**
     * Write audit log entry (non-blocking)
     */
    private async logAudit(
        entry: Omit<typeof auditLogs.$inferInsert, 'id' | 'createdAt'>
    ): Promise<void> {
        try {
            await db.insert(auditLogs).values(entry);
        } catch (error) {
            this.logger.error('Failed to write audit log:', error);
        }
    }

    /**
     * Unload a plugin
     */
    async unloadPlugin(pluginId: string): Promise<void> {
        const plugin = this.loadedPlugins.get(pluginId);
        if (!plugin) return;

        // 1. Call onDisable lifecycle hook
        if (plugin.status === 'enabled' && plugin.module?.onDisable) {
            try {
                const ctx = this.createPluginCapabilities(plugin);
                await plugin.module.onDisable(ctx);
            } catch (error) {
                this.logger.error(`${pluginId}.onDisable failed:`, error);
            }
        }

        // 2. Unregister tRPC router
        if (plugin.module?.router) {
            unregisterPluginRouter(pluginId);
        }

        // 2b. Unregister permission actionGroups
        unregisterPluginActionGroups(pluginId, plugin.manifest.permissions?.actionGroups);

        // 3. Remove from memory
        this.loadedPlugins.delete(pluginId);

        this.logger.log(`🔌 Plugin unloaded: ${pluginId}`);
    }

    /**
     * Disable a loaded plugin in the current deployment instance.
     */
    async disablePlugin(pluginId: string): Promise<void> {
        const plugin = this.loadedPlugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        if (plugin.status === 'disabled') {
            return;
        }

        if (plugin.module?.onDisable) {
            try {
                const ctx = this.createPluginCapabilities(plugin);
                await plugin.module.onDisable(ctx);
                this.logger.log(`✅ ${pluginId}.onDisable completed`);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                plugin.status = 'crashed';
                plugin.error = `onDisable failed: ${err.message}`;
                await this.persistLoadedPluginStatus(plugin);
                throw err;
            }
        }

        if (plugin.module?.router) {
            unregisterPluginRouter(pluginId);
        }

        unregisterPluginActionGroups(pluginId, plugin.manifest.permissions?.actionGroups);

        plugin.status = 'disabled';
        plugin.error = undefined;
        await this.persistLoadedPluginStatus(plugin);
        this.logger.log(`⏸️ Plugin disabled: ${pluginId}`);
    }

    /**
     * Enable a previously disabled plugin in the current deployment instance.
     */
    async enablePlugin(pluginId: string): Promise<void> {
        const plugin = this.loadedPlugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        if (plugin.status === 'enabled') {
            return;
        }

        if (plugin.status === 'crashed' || plugin.status === 'invalid') {
            throw new Error(`Plugin ${pluginId} cannot be enabled from status ${plugin.status}`);
        }

        if (plugin.module?.onEnable) {
            try {
                const ctx = this.createPluginCapabilities(plugin);
                await plugin.module.onEnable(ctx);
                this.logger.log(`✅ ${pluginId}.onEnable completed`);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                plugin.status = 'crashed';
                plugin.error = `onEnable failed: ${err.message}`;
                await this.persistLoadedPluginStatus(plugin);
                throw err;
            }
        }

        if (plugin.module?.router) {
            registerPluginRouter(pluginId, plugin.module.router);
        }

        if (plugin.manifest.permissions?.actionGroups) {
            registerPluginActionGroups(pluginId, plugin.manifest.permissions.actionGroups);
        }

        plugin.status = 'enabled';
        plugin.error = undefined;
        await this.persistLoadedPluginStatus(plugin);
        this.logger.log(`▶️ Plugin enabled: ${pluginId}`);
    }

    /**
     * Uninstall a plugin from the current deployment instance.
     *
     * Default Shopify-first governance preserves shared schema here unless the
     * plugin is explicitly running in instance-managed mode.
     */
    async uninstallPlugin(
        pluginId: string,
        governanceOverride?: PluginGovernanceConfig,
    ): Promise<void> {
        const plugin = this.loadedPlugins.get(pluginId);

        if (plugin) {
            const governance = governanceOverride ?? plugin.governance;
            // Call onDisable first
            await this.unloadPlugin(pluginId);

            // Call onUninstall lifecycle hook
            if (plugin.module?.onUninstall) {
                try {
                    const ctx = createPluginContext({ pluginId });
                    await plugin.module.onUninstall(ctx);
                    this.logger.log(`✅ ${pluginId}.onUninstall completed`);
                } catch (error) {
                    this.logger.error(`${pluginId}.onUninstall failed:`, error);
                }
            }

            // Drop plugin tables if schema is exported and dataRetention allows
            const shouldDelete = shouldDropSchemaOnInstanceUninstall(governance)
                && plugin.manifest.dataRetention?.onUninstall !== 'retain';
            if (shouldDelete && plugin.module?.schema && this.migrationService) {
                try {
                    await this.migrationService.dropPluginTables(
                        pluginId,
                        plugin.module.schema as any,
                        createInstanceMigrationOwner(),
                    );
                } catch (error) {
                    this.logger.error(`Failed to drop tables for ${pluginId}:`, error);
                }
            }
        }

        this.logger.log(`🗑️ Plugin uninstalled: ${pluginId}`);
    }

    /**
     * Get loaded plugin info
     */
    getPlugin(pluginId: string): LoadedPlugin | undefined {
        return this.loadedPlugins.get(pluginId);
    }

    /**
     * Get all loaded plugins
     */
    getAllPlugins(): Map<string, LoadedPlugin> {
        return this.loadedPlugins;
    }

    /**
     * Get all loaded plugins as array with status
     */
    getLoadedPlugins(): Array<{ manifest: PluginManifest; status: PluginStatus; error?: string }> {
        return Array.from(this.loadedPlugins.values()).map(p => ({
            manifest: p.manifest,
            status: p.status,
            ...(p.error ? { error: p.error } : {}),
        }));
    }

    private createPluginCapabilities(plugin: LoadedPlugin): unknown {
        return this.createPluginCapabilitiesFromManifest(plugin.manifest);
    }

    private createPluginCapabilitiesFromManifest(manifest: PluginManifest): unknown {
        return createCapabilitiesForPlugin(manifest.pluginId, manifest, undefined, {
            settingsService: this.settingsService,
            featureFlagService: this.featureFlagService,
            storageProviderRegistry: this.storageProviderRegistry,
            mediaService: this.mediaService,
            hookRegistry: this.hookRegistry,
            hookExecutor: this.hookExecutor,
        });
    }

    /**
     * Tenant install only affects tenant-level visibility and status.
     * Schema evolution remains an instance-level concern.
     */
    async installForTenant(pluginId: string, organizationId: string): Promise<void> {
        await this.registerMenusForTenant(pluginId, organizationId);
    }

    /**
     * Tenant enable only restores tenant-level visibility and status.
     */
    async enableForTenant(pluginId: string, organizationId: string): Promise<void> {
        await this.enableMenusForTenant(pluginId, organizationId);
    }

    /**
     * Tenant disable only hides tenant-level visibility and status.
     */
    async disableForTenant(pluginId: string, organizationId: string): Promise<void> {
        await this.disableMenusForTenant(pluginId, organizationId);
    }

    /**
     * Tenant uninstall only removes tenant-level visibility and status.
     * Shared plugin schema is preserved in the Shopify-first default path.
     */
    async uninstallForTenant(pluginId: string, organizationId: string): Promise<void> {
        await this.unregisterMenusForTenant(pluginId, organizationId);
    }

    private async persistLoadedPluginStatus(plugin: LoadedPlugin): Promise<void> {
        await this.persistInstanceStatus(plugin.manifest, this.toPersistedInstanceStatus(plugin.status));
    }

    private toPersistedInstanceStatus(status: PluginStatus): PersistedPluginInstanceStatus {
        switch (status) {
            case 'enabled':
                return 'loaded';
            case 'disabled':
                return 'installed';
            case 'invalid':
            case 'crashed':
                return 'failed';
        }
    }

    private async persistInstanceStatus(
        manifest: PluginManifest,
        status: PersistedPluginInstanceStatus,
    ): Promise<void> {
        try {
            await db
                .insert(pluginInstances)
                .values({
                    pluginId: manifest.pluginId,
                    version: manifest.version,
                    status,
                    manifest: manifest as any,
                })
                .onConflictDoUpdate({
                    target: [pluginInstances.pluginId],
                    set: {
                        version: manifest.version,
                        status,
                        manifest: manifest as any,
                        updatedAt: new Date(),
                    },
                });
        } catch (error) {
            this.logger.warn(`Failed to persist plugin instance status for ${manifest.pluginId}:`, error);
        }
    }
}
