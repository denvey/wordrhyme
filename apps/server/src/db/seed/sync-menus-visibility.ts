/**
 * Sync Menus and Visibility Script
 *
 * This script:
 * 1. Syncs all core menus to the database
 * 2. Creates visibility records for owner role (all menus visible)
 * 3. Creates visibility records for admin role (tenant menus visible, not platform menus)
 *
 * Run with: npx tsx apps/server/src/db/seed/sync-menus-visibility.ts
 */

import { db } from '../client';
import { menus, roles, roleMenuVisibility } from '../schema/definitions';
import { eq, and, inArray, isNull } from 'drizzle-orm';

// Core menus that should exist in the database
const CORE_MENUS = [
    {
        id: 'core:dashboard',
        source: 'core',
        organizationId: 'default',
        label: 'Dashboard',
        icon: 'LayoutDashboard',
        path: '/',
        parentId: null,
        order: 0,
        requiredPermission: null,
        target: 'admin' as const,
    },
    {
        id: 'core:plugins',
        source: 'core',
        organizationId: 'default',
        label: 'Plugins',
        icon: 'Plug',
        path: '/plugins',
        parentId: null,
        order: 10,
        requiredPermission: 'plugin:read:organization',
        target: 'admin' as const,
    },
    {
        id: 'core:members',
        source: 'core',
        organizationId: 'default',
        label: 'Members',
        icon: 'Users',
        path: '/members',
        parentId: null,
        order: 12,
        requiredPermission: 'user:read:organization',
        target: 'admin' as const,
    },
    {
        id: 'core:roles',
        source: 'core',
        organizationId: 'default',
        label: 'Roles',
        icon: 'Shield',
        path: '/roles',
        parentId: null,
        order: 14,
        requiredPermission: 'user:manage:organization',
        target: 'admin' as const,
    },
    {
        id: 'core:menus',
        source: 'core',
        organizationId: 'default',
        label: 'Menus',
        icon: 'Menu',
        path: '/menus',
        parentId: null,
        order: 16,
        requiredPermission: 'user:manage:organization',
        target: 'admin' as const,
    },
    {
        id: 'core:files',
        source: 'core',
        organizationId: 'default',
        label: 'Files',
        icon: 'FileText',
        path: '/files',
        parentId: null,
        order: 20,
        requiredPermission: 'file:read:organization',
        target: 'admin' as const,
    },
    {
        id: 'core:assets',
        source: 'core',
        organizationId: 'default',
        label: 'Assets',
        icon: 'Image',
        path: '/assets',
        parentId: null,
        order: 22,
        requiredPermission: 'asset:read:organization',
        target: 'admin' as const,
    },
    // Platform-level menus (only for platform admin)
    {
        id: 'platform:users',
        source: 'core',
        organizationId: 'default',
        label: 'Platform Users',
        icon: 'Shield',
        path: '/platform/users',
        parentId: null,
        order: 100,
        requiredPermission: 'admin',
        target: 'admin' as const,
    },
    {
        id: 'platform:settings',
        source: 'core',
        organizationId: 'default',
        label: 'System Settings',
        icon: 'Settings2',
        path: '/platform/settings',
        parentId: null,
        order: 101,
        requiredPermission: 'admin',
        target: 'admin' as const,
    },
    {
        id: 'platform:feature-flags',
        source: 'core',
        organizationId: 'default',
        label: 'Feature Flags',
        icon: 'Flag',
        path: '/platform/feature-flags',
        parentId: null,
        order: 102,
        requiredPermission: 'admin',
        target: 'admin' as const,
    },
    {
        id: 'platform:cache',
        source: 'core',
        organizationId: 'default',
        label: 'Cache Management',
        icon: 'Database',
        path: '/platform/cache',
        parentId: null,
        order: 103,
        requiredPermission: 'admin',
        target: 'admin' as const,
    },
    {
        id: 'platform:plugin-health',
        source: 'core',
        organizationId: 'default',
        label: 'Plugin Health',
        icon: 'Activity',
        path: '/platform/plugin-health',
        parentId: null,
        order: 104,
        requiredPermission: 'admin',
        target: 'admin' as const,
    },
    {
        id: 'core:audit-logs',
        source: 'core',
        organizationId: 'default',
        label: 'Audit Logs',
        icon: 'FileSearch',
        path: '/audit-logs',
        parentId: null,
        order: 30,
        requiredPermission: 'audit-log:read:organization',
        target: 'admin' as const,
    },
    {
        id: 'core:hooks',
        source: 'core',
        organizationId: 'default',
        label: 'Hooks',
        icon: 'Webhook',
        path: '/hooks',
        parentId: null,
        order: 32,
        requiredPermission: 'hook:read:organization',
        target: 'admin' as const,
    },
    {
        id: 'core:notifications',
        source: 'core',
        organizationId: 'default',
        label: 'Notifications',
        icon: 'Bell',
        path: '/notifications',
        parentId: null,
        order: 34,
        requiredPermission: null,
        target: 'admin' as const,
    },
    {
        id: 'core:notification-templates',
        source: 'core',
        organizationId: 'default',
        label: 'Notification Templates',
        icon: 'MailPlus',
        path: '/notification-templates',
        parentId: null,
        order: 36,
        requiredPermission: 'notification:manage:organization',
        target: 'admin' as const,
    },
    {
        id: 'core:notification-test',
        source: 'core',
        organizationId: 'default',
        label: 'Notification Test',
        icon: 'BellRing',
        path: '/notification-test',
        parentId: null,
        order: 38,
        requiredPermission: 'notification:manage:organization',
        target: 'admin' as const,
    },
    {
        id: 'core:webhooks',
        source: 'core',
        organizationId: 'default',
        label: 'Webhooks',
        icon: 'Webhook',
        path: '/webhooks',
        parentId: null,
        order: 40,
        requiredPermission: 'webhook:read:organization',
        target: 'admin' as const,
    },
    {
        id: 'core:api-tokens',
        source: 'core',
        organizationId: 'default',
        label: 'API Tokens',
        icon: 'Key',
        path: '/api-tokens',
        parentId: null,
        order: 42,
        requiredPermission: 'api-token:read:organization',
        target: 'admin' as const,
    },
    {
        id: 'core:invitations',
        source: 'core',
        organizationId: 'default',
        label: 'Invitations',
        icon: 'Mail',
        path: '/invitations',
        parentId: null,
        order: 15,
        requiredPermission: null,
        target: 'admin' as const,
    },
];

// Platform menu IDs (should only be visible to platform admin)
const PLATFORM_MENU_IDS = [
    'platform:users',
    'platform:settings',
    'platform:feature-flags',
    'platform:cache',
    'platform:plugin-health',
];

async function syncMenus() {
    console.log('='.repeat(80));
    console.log('[Sync] Syncing core menus to database');
    console.log('='.repeat(80));

    let inserted = 0;
    let updated = 0;

    for (const menu of CORE_MENUS) {
        const existing = await db
            .select()
            .from(menus)
            .where(eq(menus.id, menu.id))
            .limit(1);

        if (existing.length === 0) {
            await db.insert(menus).values({
                ...menu,
                metadata: null,
            });
            console.log(`  ✅ Inserted: ${menu.label} (${menu.id})`);
            inserted++;
        } else {
            console.log(`  ⏭️  Exists: ${menu.label} (${menu.id})`);
        }
    }

    console.log(`\nMenus synced: ${inserted} inserted, ${CORE_MENUS.length - inserted} already existed`);
    return inserted;
}

async function createVisibilityForOwner() {
    console.log('\n' + '='.repeat(80));
    console.log('[Visibility] Creating visibility records for owner role');
    console.log('='.repeat(80));

    // Find owner role (system role)
    const ownerRoles = await db
        .select({ id: roles.id, organizationId: roles.organizationId })
        .from(roles)
        .where(eq(roles.slug, 'owner'));

    console.log(`Found ${ownerRoles.length} owner roles`);

    // Get non-platform menu IDs (owner can see all except platform menus)
    const allMenus = await db.select({ id: menus.id, label: menus.label }).from(menus);
    const nonPlatformMenus = allMenus.filter(m => !PLATFORM_MENU_IDS.includes(m.id));

    console.log(`Non-platform menus for owner: ${nonPlatformMenus.length}`);

    let created = 0;

    for (const role of ownerRoles) {
        for (const menu of nonPlatformMenus) {
            // Check if visibility record exists
            const existing = await db
                .select()
                .from(roleMenuVisibility)
                .where(and(
                    eq(roleMenuVisibility.roleId, role.id),
                    eq(roleMenuVisibility.menuId, menu.id),
                    isNull(roleMenuVisibility.organizationId)
                ))
                .limit(1);

            if (existing.length === 0) {
                await db.insert(roleMenuVisibility).values({
                    roleId: role.id,
                    menuId: menu.id,
                    organizationId: null, // Global scope
                    visible: true,
                });
                created++;
            }
        }
    }

    console.log(`Created ${created} visibility records for owner roles`);
    return created;
}

async function createVisibilityForAdmin() {
    console.log('\n' + '='.repeat(80));
    console.log('[Visibility] Creating visibility records for admin role');
    console.log('='.repeat(80));

    // Find admin roles
    const adminRoles = await db
        .select({ id: roles.id, organizationId: roles.organizationId })
        .from(roles)
        .where(eq(roles.slug, 'admin'));

    console.log(`Found ${adminRoles.length} admin roles`);

    // Get non-platform menu IDs (admin can see all except platform menus)
    const allMenus = await db.select({ id: menus.id, label: menus.label }).from(menus);
    const nonPlatformMenus = allMenus.filter(m => !PLATFORM_MENU_IDS.includes(m.id));

    console.log(`Non-platform menus: ${nonPlatformMenus.length}`);

    let created = 0;

    for (const role of adminRoles) {
        for (const menu of nonPlatformMenus) {
            // Check if visibility record exists
            const existing = await db
                .select()
                .from(roleMenuVisibility)
                .where(and(
                    eq(roleMenuVisibility.roleId, role.id),
                    eq(roleMenuVisibility.menuId, menu.id),
                    isNull(roleMenuVisibility.organizationId)
                ))
                .limit(1);

            if (existing.length === 0) {
                await db.insert(roleMenuVisibility).values({
                    roleId: role.id,
                    menuId: menu.id,
                    organizationId: null, // Global scope
                    visible: true,
                });
                created++;
            }
        }
    }

    console.log(`Created ${created} visibility records for admin roles`);
    return created;
}

async function createVisibilityForMember() {
    console.log('\n' + '='.repeat(80));
    console.log('[Visibility] Creating visibility records for member role');
    console.log('='.repeat(80));

    // Find member roles
    const memberRoles = await db
        .select({ id: roles.id, organizationId: roles.organizationId })
        .from(roles)
        .where(eq(roles.slug, 'member'));

    console.log(`Found ${memberRoles.length} member roles`);

    // Member can only see basic menus
    const memberMenuIds = [
        'core:dashboard',
        'core:notifications',
        'core:invitations',
    ];

    let created = 0;

    for (const role of memberRoles) {
        for (const menuId of memberMenuIds) {
            // Check if visibility record exists
            const existing = await db
                .select()
                .from(roleMenuVisibility)
                .where(and(
                    eq(roleMenuVisibility.roleId, role.id),
                    eq(roleMenuVisibility.menuId, menuId),
                    isNull(roleMenuVisibility.organizationId)
                ))
                .limit(1);

            if (existing.length === 0) {
                await db.insert(roleMenuVisibility).values({
                    roleId: role.id,
                    menuId: menuId,
                    organizationId: null, // Global scope
                    visible: true,
                });
                created++;
            }
        }
    }

    console.log(`Created ${created} visibility records for member roles`);
    return created;
}

async function main() {
    console.log('Starting menu sync and visibility setup...\n');

    try {
        await syncMenus();
        await createVisibilityForOwner();
        await createVisibilityForAdmin();
        await createVisibilityForMember();

        console.log('\n' + '='.repeat(80));
        console.log('✅ Menu sync and visibility setup completed!');
        console.log('='.repeat(80));

        // Show summary
        const totalMenus = await db.select({ count: menus.id }).from(menus);
        const totalVis = await db.select({ count: roleMenuVisibility.id }).from(roleMenuVisibility);
        console.log(`\nTotal menus: ${totalMenus.length}`);
        console.log(`Total visibility records: ${totalVis.length}`);

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }

    process.exit(0);
}

main();
