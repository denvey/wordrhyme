import { Injectable, Logger } from '@nestjs/common';
import { db } from '../db';
import { permissions } from '../db/schema/permissions';
import type { PluginManifest } from '@wordrhyme/plugin';
import { eq } from 'drizzle-orm';

/**
 * Reserved permission namespaces that plugins cannot use
 */
const RESERVED_NAMESPACES = ['core', 'system'];

/**
 * PluginPermissionRegistry - Manages plugin permission registration
 * 
 * When a plugin is installed, its declared permissions are registered
 * in the `permissions` table with namespace `plugin:{pluginId}:`.
 */
@Injectable()
export class PluginPermissionRegistry {
    private readonly logger = new Logger(PluginPermissionRegistry.name);

    /**
     * Register all permissions declared by a plugin
     */
    async registerPluginPermissions(manifest: PluginManifest): Promise<void> {
        if (!manifest.permissions?.definitions?.length) {
            return; // Plugin doesn't declare any permissions
        }

        const { pluginId } = manifest;
        const definitions = manifest.permissions.definitions;

        // Validate all permission keys
        for (const def of definitions) {
            this.validatePermissionKey(def.key);
        }

        // Build permission rows
        const permissionRows = definitions.map(def => ({
            capability: `plugin:${pluginId}:${def.key}`,
            source: pluginId,
            description: def.description ?? null,
        }));

        // Insert permissions (idempotent - skip duplicates)
        await db.insert(permissions)
            .values(permissionRows)
            .onConflictDoNothing();

        this.logger.log(`✅ Registered ${permissionRows.length} permissions for plugin ${pluginId}`);
    }

    /**
     * Unregister all permissions for a plugin when it's uninstalled
     */
    async unregisterPluginPermissions(pluginId: string): Promise<void> {
        const result = await db.delete(permissions)
            .where(eq(permissions.source, pluginId));

        this.logger.log(`🗑️  Removed permissions for plugin ${pluginId}`);
    }

    /**
     * Validate that permission key doesn't use reserved namespaces
     */
    private validatePermissionKey(key: string): void {
        // Check reserved namespaces
        for (const reserved of RESERVED_NAMESPACES) {
            if (key.startsWith(`${reserved}:`)) {
                throw new PluginPermissionError(
                    `Plugin permissions cannot use reserved namespace: ${reserved}. ` +
                    `Use simple keys like "settings.read" (namespace is added automatically)`
                );
            }
        }

        // Validate format: only lowercase letters, numbers, dots, underscores
        if (!/^[a-z0-9_.]+$/.test(key)) {
            throw new PluginPermissionError(
                `Invalid permission key: ${key}. ` +
                `Only lowercase letters, numbers, dots, and underscores allowed.`
            );
        }
    }
}

/**
 * Error thrown when plugin permission validation fails
 */
export class PluginPermissionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PluginPermissionError';
    }
}
