import { Injectable, Logger } from '@nestjs/common';
import { db } from '../db';
import { permissions } from '@wordrhyme/db';
import { rolePermissions } from '@wordrhyme/db';
import type { PluginManifest, PluginPermissionDef } from '@wordrhyme/plugin';
import { eq, like } from 'drizzle-orm';

/**
 * Reserved permission namespaces that plugins cannot use
 */
const RESERVED_NAMESPACES = ['core', 'system'];

/**
 * Normalized plugin permission in CASL format
 */
interface NormalizedPluginPermission {
    /** Full subject including plugin prefix: plugin:{pluginId}:{subject} */
    subject: string;
    /** Actions supported */
    actions: string[];
    /** Field restrictions (null = all fields) */
    fields: string[] | null;
    /** Description for Admin UI */
    description: string | null;
    /** Source plugin ID */
    source: string;
}

/**
 * PluginPermissionRegistry - Manages plugin permission registration
 *
 * When a plugin is installed, its declared permissions are registered
 * in the `permissions` table with namespace `plugin:{pluginId}:`.
 *
 * Updated to support CASL format (action/subject vs old capability strings).
 */
@Injectable()
export class PluginPermissionRegistry {
    private readonly logger = new Logger(PluginPermissionRegistry.name);

    /**
     * Normalize a plugin permission definition to CASL format
     *
     * @example
     * // Input: { subject: 'settings' } with pluginId 'com.vendor.seo'
     * // Output: { subject: 'plugin:com.vendor.seo:settings', actions: ['manage'], ... }
     */
    normalizePluginPermission(
        def: PluginPermissionDef,
        pluginId: string
    ): NormalizedPluginPermission {
        // Validate subject
        this.validatePermissionKey(def.subject);

        return {
            subject: `plugin:${pluginId}:${def.subject}`,
            actions: def.actions ?? ['manage'], // Default to manage
            fields: def.fields ?? null,
            description: def.description ?? null,
            source: pluginId,
        };
    }

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

        // Build permission rows (legacy format for compatibility)
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
     * Register plugin permissions using the new CASL-aware format
     */
    async registerPluginPermissionsCasl(
        pluginId: string,
        defs: PluginPermissionDef[]
    ): Promise<NormalizedPluginPermission[]> {
        if (!defs.length) {
            return [];
        }

        const normalized = defs.map(def => this.normalizePluginPermission(def, pluginId));

        // Build permission rows for legacy permissions table
        const permissionRows = normalized.map(norm => ({
            capability: norm.subject, // Use subject as capability for legacy compat
            source: pluginId,
            description: norm.description,
        }));

        // Insert into legacy permissions table
        await db.insert(permissions)
            .values(permissionRows)
            .onConflictDoNothing();

        this.logger.log(`✅ Registered ${normalized.length} CASL permissions for plugin ${pluginId}`);
        return normalized;
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
     * Remove all role permission rules associated with a plugin
     *
     * Called during plugin uninstall to clean up any assigned permissions
     * that reference this plugin's subjects.
     */
    async removePluginRules(pluginId: string): Promise<number> {
        // Delete role_permissions where source = pluginId
        const sourceCleanup = await db.delete(rolePermissions)
            .where(eq(rolePermissions.source, pluginId));

        // Also delete any rules with subjects starting with plugin:{pluginId}:
        const subjectPrefix = `plugin:${pluginId}:%`;
        const subjectCleanup = await db.delete(rolePermissions)
            .where(like(rolePermissions.subject, subjectPrefix));

        this.logger.log(`🗑️  Removed plugin rules for ${pluginId} (source + subject cleanup)`);

        // Return count (approximation)
        return 0; // Drizzle doesn't easily return count from delete
    }

    /**
     * Get all registered subjects for a plugin
     * Used by Admin UI to show available plugin permissions
     */
    async getPluginSubjects(pluginId: string): Promise<string[]> {
        const results = await db
            .select({ capability: permissions.capability })
            .from(permissions)
            .where(eq(permissions.source, pluginId));

        return results.map(r => r.capability);
    }

    /**
     * Get all registered plugin permissions with metadata
     */
    async getPluginPermissionMeta(): Promise<Array<{
        subject: string;
        pluginId: string;
        description: string | null;
    }>> {
        const results = await db
            .select({
                capability: permissions.capability,
                source: permissions.source,
                description: permissions.description,
            })
            .from(permissions)
            .where(like(permissions.source, '%'));

        return results
            .filter(r => r.capability.startsWith('plugin:'))
            .map(r => ({
                subject: r.capability,
                pluginId: r.source,
                description: r.description,
            }));
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

        // Validate format: only lowercase letters, numbers, dots, underscores, hyphens
        if (!/^[a-z0-9_.-]+$/.test(key)) {
            throw new PluginPermissionError(
                `Invalid permission key: ${key}. ` +
                `Only lowercase letters, numbers, dots, underscores, and hyphens allowed.`
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
