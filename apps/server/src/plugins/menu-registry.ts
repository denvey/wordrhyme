import { Injectable, Logger } from '@nestjs/common';
import { db } from '../db';
import { menus, type InsertMenu } from '../db/schema/menus';
import type { PluginManifest } from '@wordrhyme/plugin';
import { eq, and } from 'drizzle-orm';

/**
 * MenuRegistry - Manages plugin menu registration
 *
 * When a plugin is installed, its declared menus are registered
 * in the `menus` table with source = pluginId.
 *
 * Plugin menus are registered per-organization (organizationId = the org that installed the plugin)
 *
 * Note: Uses code-based menu structure (not ID-based)
 */
@Injectable()
export class MenuRegistry {
    private readonly logger = new Logger(MenuRegistry.name);

    /**
     * Register all menus declared by a plugin
     * Supports both new extensions[] format and legacy menus[] format
     */
    async registerPluginMenus(
        manifest: PluginManifest,
        organizationId: string
    ): Promise<void> {
        const { pluginId } = manifest;

        // Check if plugin menus already exist for this organization (avoid duplicates)
        const existingMenus = await db
            .select({ id: menus.id })
            .from(menus)
            .where(and(
                eq(menus.source, pluginId),
                eq(menus.organizationId, organizationId)
            ))
            .limit(1);

        if (existingMenus.length > 0) {
            this.logger.log(`⏭️  Plugin ${pluginId} menus already registered for org ${organizationId}, skipping`);
            return;
        }

        // Extract nav entries: prefer extensions[], fall back to legacy menus[]
        const menuRows = this.extractMenuRows(manifest, organizationId);

        if (menuRows.length === 0) {
            return;
        }

        await db.insert(menus).values(menuRows);

        this.logger.log(`✅ Registered ${menuRows.length} menus for plugin ${pluginId} in org ${organizationId}`);
    }

    /**
     * Extract menu rows from manifest (supports both new and legacy format)
     */
    private extractMenuRows(manifest: PluginManifest, organizationId: string): InsertMenu[] {
        const { pluginId, admin } = manifest;
        if (!admin) return [];

        // New format: admin.extensions[] → extract nav.sidebar targets
        if (admin.extensions && admin.extensions.length > 0) {
            const rows: InsertMenu[] = [];
            for (const ext of admin.extensions) {
                for (const target of ext.targets) {
                    if (target.slot === 'nav.sidebar') {
                        const navTarget = target as { slot: string; path: string; icon?: string; order?: number; requiredPermission?: string };
                        rows.push({
                            code: `plugin:${pluginId}:${navTarget.path.replace(/\//g, ':')}`,
                            type: 'system' as const,
                            source: pluginId,
                            organizationId,
                            label: ext.label,
                            icon: navTarget.icon ?? ext.icon ?? null,
                            path: navTarget.path,
                            openMode: 'route' as const,
                            parentCode: null,
                            order: navTarget.order ?? 0,
                            requiredPermission: navTarget.requiredPermission ?? null,
                            target: 'admin' as const,
                            metadata: null,
                        });
                    }
                }
            }
            return rows;
        }

        // Legacy format: admin.menus[]
        const adminMenus = admin.menus ?? [];
        return adminMenus.map((menu, index) => ({
            code: `plugin:${pluginId}:${menu.path.replace(/\//g, ':')}`,
            type: 'system' as const,
            source: pluginId,
            organizationId,
            label: menu.label,
            icon: menu.icon ?? null,
            path: menu.path,
            openMode: 'route' as const,
            parentCode: menu.parentId ?? null,
            order: menu.order ?? index * 10,
            requiredPermission: menu.requiredPermission ?? null,
            target: 'admin' as const,
            metadata: menu.metadata ?? null,
        }));
    }

    /**
     * Unregister all menus for a plugin when it's uninstalled
     */
    async unregisterPluginMenus(
        pluginId: string,
        organizationId?: string
    ): Promise<void> {
        if (organizationId) {
            await db.delete(menus).where(
                and(
                    eq(menus.source, pluginId),
                    eq(menus.organizationId, organizationId)
                )
            );
        } else {
            await db.delete(menus).where(eq(menus.source, pluginId));
        }

        this.logger.log(`🗑️  Removed menus for plugin ${pluginId}`);
    }

    /**
     * Get all menus for a target application
     */
    async getMenusByTarget(
        target: 'admin' | 'web',
        organizationId: string
    ): Promise<Array<typeof menus.$inferSelect>> {
        return db.select().from(menus).where(
            and(
                eq(menus.target, target),
                eq(menus.organizationId, organizationId)
            )
        );
    }

    /**
     * Register core menus (called during system initialization)
     */
    async registerCoreMenus(organizationId: string): Promise<void> {
        const coreMenus: InsertMenu[] = [
            {
                code: 'core:dashboard',
                type: 'system',
                source: 'core',
                organizationId: organizationId,
                label: 'Dashboard',
                icon: 'LayoutDashboard',
                path: '/',
                openMode: 'route',
                parentCode: null,
                order: 0,
                target: 'admin',
            },
            {
                code: 'core:plugins',
                type: 'system',
                source: 'core',
                organizationId: organizationId,
                label: 'Plugins',
                icon: 'Puzzle',
                path: '/plugins',
                openMode: 'route',
                parentCode: null,
                order: 100,
                requiredPermission: 'core:plugins:manage',
                target: 'admin',
            },
            {
                code: 'core:settings',
                type: 'system',
                source: 'core',
                organizationId: organizationId,
                label: 'Settings',
                icon: 'Settings',
                path: '/settings',
                openMode: 'route',
                parentCode: null,
                order: 200,
                target: 'admin',
            },
        ];

        // Upsert core menus
        await db.delete(menus).where(
            and(
                eq(menus.source, 'core'),
                eq(menus.organizationId, organizationId)
            )
        );
        await db.insert(menus).values(coreMenus);

        this.logger.log(`✅ Registered ${coreMenus.length} core menus`);
    }
}
