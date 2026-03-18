import { Injectable, Logger } from '@nestjs/common';
import { rawDb } from '../db';
import { menus, type InsertMenu } from '@wordrhyme/db';
import type { PluginManifest } from '@wordrhyme/plugin';
import { eq, and, isNull } from 'drizzle-orm';

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
     * Register all menus declared by a plugin.
     * Uses diff-based reconciliation: inserts new menus, updates structural fields
     * of existing menus (preserving user customizations like order/visible),
     * and deletes menus no longer in the manifest.
     */
    async registerPluginMenus(
        manifest: PluginManifest,
        organizationId: string | null = null
    ): Promise<void> {
        const { pluginId } = manifest;

        // Extract expected menus from manifest
        const expectedRows = this.extractMenuRows(manifest, organizationId);

        // Get existing menus from DB
        const orgCondition = organizationId === null
            ? isNull(menus.organizationId)
            : eq(menus.organizationId, organizationId);
        const existingMenus = await rawDb
            .select()
            .from(menus)
            .where(and(
                eq(menus.source, pluginId),
                orgCondition
            ));

        if (expectedRows.length === 0) {
            if (existingMenus.length > 0) {
                await rawDb.delete(menus).where(and(eq(menus.source, pluginId), orgCondition));
                this.logger.log(`Removed ${existingMenus.length} menus for plugin ${pluginId} in org ${organizationId}`);
            }
            return;
        }

        // If no existing menus, simple insert (first install)
        if (existingMenus.length === 0) {
            await rawDb.insert(menus).values(expectedRows);
            this.logger.log(`Registered ${expectedRows.length} menus for plugin ${pluginId} in org ${organizationId}`);
            return;
        }

        // Reconcile: diff expected vs existing
        const existingByCode = new Map(existingMenus.map(m => [m.code, m]));
        const expectedByCode = new Map(expectedRows.map(r => [r.code, r]));

        // 1. New codes -> INSERT
        const toInsert = expectedRows.filter(r => !existingByCode.has(r.code));

        // 2. Removed codes -> DELETE
        const toDelete = existingMenus.filter(m => !expectedByCode.has(m.code));

        // 3. Existing codes -> UPDATE structural fields only (preserve user customizations: order, visible)
        const toUpdate: Array<{ code: string; updates: Partial<InsertMenu> }> = [];
        for (const [code, expected] of expectedByCode) {
            const existing = existingByCode.get(code);
            if (!existing) continue;
            const structuralUpdates: Partial<InsertMenu> = {};
            if (existing.label !== expected.label) structuralUpdates.label = expected.label;
            if (existing.icon !== expected.icon) structuralUpdates.icon = expected.icon;
            if (existing.parentCode !== expected.parentCode) structuralUpdates.parentCode = expected.parentCode;
            if (existing.path !== expected.path) structuralUpdates.path = expected.path;
            if (existing.requiredPermission !== expected.requiredPermission) structuralUpdates.requiredPermission = expected.requiredPermission;

            if (Object.keys(structuralUpdates).length > 0) {
                toUpdate.push({ code, updates: structuralUpdates });
            }
        }

        // Execute operations
        if (toInsert.length > 0) {
            await rawDb.insert(menus).values(toInsert);
        }

        for (const { code, updates } of toUpdate) {
            await rawDb.update(menus)
                .set(updates)
                .where(and(
                    eq(menus.code, code),
                    orgCondition
                ));
        }

        for (const menu of toDelete) {
            await rawDb.delete(menus).where(eq(menus.id, menu.id));
        }

        const ops = [
            toInsert.length > 0 ? `+${toInsert.length}` : null,
            toUpdate.length > 0 ? `~${toUpdate.length}` : null,
            toDelete.length > 0 ? `-${toDelete.length}` : null,
        ].filter(Boolean).join(', ');

        if (ops) {
            this.logger.log(`Reconciled menus for plugin ${pluginId} in org ${organizationId}: ${ops}`);
        }
    }

    /**
     * Extract menu rows from manifest (supports both new and legacy format)
     */
    private extractMenuRows(manifest: PluginManifest, organizationId: string | null): InsertMenu[] {
        const { pluginId, admin } = manifest;
        if (!admin) return [];

        // New format: admin.extensions[] → extract nav.sidebar and nav.sidebar.group targets
        if (admin.extensions && admin.extensions.length > 0) {
            const rows: InsertMenu[] = [];

            // First pass: register group parents (nav.sidebar.group)
            for (const ext of admin.extensions) {
                for (const target of ext.targets) {
                    if (target.slot === 'nav.sidebar.group') {
                        const groupTarget = target as { slot: string; path?: string; icon?: string; order?: number };
                        rows.push({
                            code: `plugin:${pluginId}:${ext.id}`,
                            type: 'system' as const,
                            source: pluginId,
                            organizationId,
                            label: ext.label,
                            icon: groupTarget.icon ?? ext.icon ?? null,
                            path: groupTarget.path ?? null,
                            openMode: 'route' as const,
                            parentCode: null,
                            order: groupTarget.order ?? 0,
                            requiredPermission: null,
                            target: 'admin' as const,
                            metadata: null,
                        });
                    }
                }
            }

            // Second pass: register nav items (nav.sidebar), resolving parent references
            for (const ext of admin.extensions) {
                for (const target of ext.targets) {
                    if (target.slot === 'nav.sidebar') {
                        const navTarget = target as { slot: string; path: string; icon?: string; order?: number; requiredPermission?: string; parent?: string };
                        const parentCode = navTarget.parent
                            ? `plugin:${pluginId}:${navTarget.parent}`
                            : null;
                        rows.push({
                            code: `plugin:${pluginId}:${navTarget.path.replace(/\//g, ':')}`,
                            type: 'system' as const,
                            source: pluginId,
                            organizationId,
                            label: ext.label,
                            icon: navTarget.icon ?? ext.icon ?? null,
                            path: navTarget.path,
                            openMode: 'route' as const,
                            parentCode,
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
     * Toggle visibility of all menus for a plugin (used for disable/enable).
     * Unlike unregister (DELETE), this preserves menu records and user customizations.
     */
    async setPluginMenusVisibility(
        pluginId: string,
        organizationId: string,
        visible: boolean
    ): Promise<void> {
        await rawDb.update(menus)
            .set({ visible })
            .where(
                and(
                    eq(menus.source, pluginId),
                    eq(menus.organizationId, organizationId)
                )
            );

        this.logger.log(`Set visibility=${visible} for plugin ${pluginId} menus in org ${organizationId}`);
    }

    /**
     * Unregister all menus for a plugin when it's uninstalled
     */
    async unregisterPluginMenus(
        pluginId: string,
        organizationId?: string
    ): Promise<void> {
        if (organizationId) {
            await rawDb.delete(menus).where(
                and(
                    eq(menus.source, pluginId),
                    eq(menus.organizationId, organizationId)
                )
            );
        } else {
            await rawDb.delete(menus).where(eq(menus.source, pluginId));
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
        return rawDb.select().from(menus).where(
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
        await rawDb.delete(menus).where(
            and(
                eq(menus.source, 'core'),
                eq(menus.organizationId, organizationId)
            )
        );
        await rawDb.insert(menus).values(coreMenus);

        this.logger.log(`✅ Registered ${coreMenus.length} core menus`);
    }
}
