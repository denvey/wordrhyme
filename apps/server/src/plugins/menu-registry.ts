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
 */
@Injectable()
export class MenuRegistry {
    private readonly logger = new Logger(MenuRegistry.name);

    /**
     * Register all menus declared by a plugin
     */
    async registerPluginMenus(
        manifest: PluginManifest,
        organizationId: string
    ): Promise<void> {
        const adminMenus = manifest.admin?.menus ?? [];

        if (!adminMenus.length) {
            return; // Plugin doesn't declare any menus
        }

        const { pluginId } = manifest;

        // Build menu rows
        const menuRows: InsertMenu[] = adminMenus.map((menu, index) => ({
            source: pluginId,
            organizationId,
            label: menu.label,
            icon: menu.icon ?? null,
            path: menu.path,
            parentId: menu.parentId ?? null,
            order: menu.order ?? index * 10,
            requiredPermission: menu.requiredPermission ?? null,
            target: 'admin' as const,
            metadata: menu.metadata ?? null,
        }));

        // Insert menus (idempotent - first delete existing, then insert)
        await this.unregisterPluginMenus(pluginId, organizationId);
        await db.insert(menus).values(menuRows);

        this.logger.log(`✅ Registered ${menuRows.length} menus for plugin ${pluginId}`);
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
                source: 'core',
                organizationId,
                label: 'Dashboard',
                icon: 'LayoutDashboard',
                path: '/',
                order: 0,
                target: 'admin',
            },
            {
                source: 'core',
                organizationId,
                label: 'Plugins',
                icon: 'Puzzle',
                path: '/plugins',
                order: 100,
                requiredPermission: 'core:plugins:manage',
                target: 'admin',
            },
            {
                source: 'core',
                organizationId,
                label: 'Settings',
                icon: 'Settings',
                path: '/settings',
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
