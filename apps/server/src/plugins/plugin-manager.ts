import { Injectable, Logger, Type } from '@nestjs/common';
import { LazyModuleLoader } from '@nestjs/core';
import { glob } from 'glob';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pluginManifestSchema, type PluginManifest } from '@wordrhyme/plugin';
import { registerPluginRouter, unregisterPluginRouter } from '../trpc/router';
import { db } from '../db';
import { plugins } from '../db/schema/definitions';
import { auditLogs } from '../db/schema/audit-logs';
import { env } from '../config/env';
import { createPluginContext } from '@wordrhyme/plugin';
import { eq, and } from 'drizzle-orm';
import { ZodError } from 'zod';
import { resolveDependencies, getCoreVersion } from './dependency-resolver';
import { createCapabilitiesForPlugin } from './capabilities';
import { MenuRegistry } from './menu-registry';
import { PluginMigrationService } from './migration-service';
import { LoggerService } from '../observability/logger.service.js';

/**
 * Plugin status
 */
export type PluginStatus = 'enabled' | 'disabled' | 'invalid' | 'crashed';

interface LoadedPlugin {
    manifest: PluginManifest;
    pluginDir: string;
    status: PluginStatus;
    module?: {
        router?: unknown;
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
     * Scan and load all plugins on startup
     */
    async scanAndLoadPlugins(): Promise<void> {
        this.logger.log(`🔍 Scanning plugins... (Core v${getCoreVersion()})`);

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
        const pluginDir = path.resolve(process.cwd(), env.PLUGIN_DIR);

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
    private async loadPlugin(pluginDir: string, manifest: PluginManifest): Promise<void> {
        this.logger.log(`📦 Loading plugin: ${manifest.pluginId} v${manifest.version}`);

        // Check safe mode
        if (env.WORDRHYME_SAFE_MODE && !manifest.pluginId.startsWith('core.')) {
            this.logger.log(`🔒 Skipping non-core plugin in safe mode: ${manifest.pluginId}`);
            return;
        }

        // 3. Check if this is first install
        const existingRecord = await db.select()
            .from(plugins)
            .where(eq(plugins.pluginId, manifest.pluginId))
            .limit(1);

        const isFirstInstall = existingRecord.length === 0;

        // 4. Load server module if exists
        let module: LoadedPlugin['module'];
        if (manifest.server?.entry) {
            const entryPath = path.join(pluginDir, manifest.server.entry);
            try {
                module = await import(entryPath);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                await this.markPluginCrashed(manifest.pluginId, pluginDir, manifest, `Failed to load server entry: ${err.message}`);
                return;
            }
        }

        // 5. Run database migrations (idempotent - only runs pending migrations)
        // This runs on every startup to support development mode additions
        if (this.migrationService) {
            try {
                // Use 'default' tenant for system-level migrations
                await this.migrationService.runMigrations(
                    manifest.pluginId,
                    pluginDir,
                    'default'
                );
                // Note: MigrationService logs when new migrations are applied
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                await this.markPluginCrashed(manifest.pluginId, pluginDir, manifest, `Database migration failed: ${err.message}`);
                return;
            }
        }

        // 6. Call onInstall lifecycle hook (first install only)
        if (isFirstInstall && module?.onInstall) {
            try {
                const ctx = createCapabilitiesForPlugin(manifest.pluginId, manifest);
                await module.onInstall(ctx);
                this.logger.log(`✅ ${manifest.pluginId}.onInstall completed`);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                await this.markPluginCrashed(manifest.pluginId, pluginDir, manifest, `onInstall failed: ${err.message}`);
                return;
            }
        }

        // 6. Call onEnable lifecycle hook
        if (module?.onEnable) {
            try {
                const ctx = createCapabilitiesForPlugin(manifest.pluginId, manifest);
                await module.onEnable(ctx);
                this.logger.log(`✅ ${manifest.pluginId}.onEnable completed`);
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                await this.markPluginCrashed(manifest.pluginId, pluginDir, manifest, `onEnable failed: ${err.message}`);
                return;
            }
        }

        // 7. Register tRPC router if exists
        if (module?.router) {
            registerPluginRouter(manifest.pluginId, module.router);
        }

        // 8. Register plugin menus (if declared)
        if (manifest.admin?.menus && manifest.admin.menus.length > 0) {
            try {
                await this.menuRegistry.registerPluginMenus(manifest, 'default');
            } catch (error) {
                this.logger.warn(`Failed to register menus for ${manifest.pluginId}:`, error);
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
            status: 'enabled'
        });

        // 11. Check for logger-adapter capability
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
        reason: string
    ): Promise<void> {
        this.logger.error(`❌ Plugin crashed (${pluginId}): ${reason}`);

        // Store with crashed status
        this.loadedPlugins.set(pluginId, {
            manifest,
            pluginDir,
            status: 'crashed',
            error: reason,
        });

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
        if (plugin.module?.onDisable) {
            try {
                const ctx = createPluginContext({ pluginId });
                await plugin.module.onDisable(ctx);
            } catch (error) {
                this.logger.error(`${pluginId}.onDisable failed:`, error);
            }
        }

        // 2. Unregister tRPC router
        if (plugin.module?.router) {
            unregisterPluginRouter(pluginId);
        }

        // 3. Unregister plugin menus
        try {
            await this.menuRegistry.unregisterPluginMenus(pluginId);
        } catch (error) {
            this.logger.warn(`Failed to unregister menus for ${pluginId}:`, error);
        }

        // 4. Remove from memory
        this.loadedPlugins.delete(pluginId);

        this.logger.log(`🔌 Plugin unloaded: ${pluginId}`);
    }

    /**
     * Uninstall a plugin (full removal)
     */
    async uninstallPlugin(pluginId: string): Promise<void> {
        const plugin = this.loadedPlugins.get(pluginId);

        if (plugin) {
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
            error: p.error,
        }));
    }
}
