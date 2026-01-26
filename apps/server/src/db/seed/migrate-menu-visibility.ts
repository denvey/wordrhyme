/**
 * Migration Script: Menu Visibility from requiredPermission to role_menu_visibility
 *
 * This script migrates the existing permission-based menu visibility to the new
 * role-menu mapping table.
 *
 * Logic:
 * 1. For menus with requiredPermission:
 *    - Find roles that have the required permission in role_permissions
 *    - Create visibility records for those roles
 * 2. For menus without requiredPermission:
 *    - Make them visible to all roles (default visible)
 *
 * Run with: npx tsx apps/server/src/db/seed/migrate-menu-visibility.ts
 */

import { db } from '../client';
import { menus, roles, rolePermissions, roleMenuVisibility } from '../schema/definitions';
import { eq, and, or, inArray, isNull, isNotNull } from 'drizzle-orm';

interface MigrationStats {
    totalMenus: number;
    menusWithPermission: number;
    menusWithoutPermission: number;
    visibilityRecordsCreated: number;
    errors: string[];
}

/**
 * Find roles that have a specific permission
 * Checks both exact matches and 'manage' action (which implies all actions)
 */
async function findRolesWithPermission(
    permission: string,
    organizationId: string | null
): Promise<string[]> {
    // Parse permission string (e.g., "user:read:organization" -> action=read, subject=user)
    const parts = permission.split(':');
    if (parts.length < 2) {
        console.warn(`[Migration] Invalid permission format: ${permission}`);
        return [];
    }

    const subject = parts[0];
    const action = parts[1];

    // Special case: admin
    if (permission === 'admin') {
        // Find all roles with slug 'admin' or 'owner'
        const adminRoles = await db
            .select({ id: roles.id })
            .from(roles)
            .where(
                or(
                    eq(roles.slug, 'admin'),
                    eq(roles.slug, 'owner')
                )
            );
        return adminRoles.map(r => r.id);
    }

    // Find roles with matching permission or 'manage' action on the same subject
    let query = db
        .select({ roleId: rolePermissions.roleId })
        .from(rolePermissions)
        .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
        .where(
            and(
                eq(rolePermissions.subject, subject),
                or(
                    eq(rolePermissions.action, action),
                    eq(rolePermissions.action, 'manage') // 'manage' implies all actions
                )
            )
        );

    const results = await query;
    return [...new Set(results.map(r => r.roleId))];
}

/**
 * Main migration function
 */
async function migrateMenuVisibility(): Promise<MigrationStats> {
    const stats: MigrationStats = {
        totalMenus: 0,
        menusWithPermission: 0,
        menusWithoutPermission: 0,
        visibilityRecordsCreated: 0,
        errors: [],
    };

    console.log('='.repeat(80));
    console.log('[Migration] Starting menu visibility migration');
    console.log('='.repeat(80));

    try {
        // Get all menus
        const allMenus = await db.select().from(menus);
        stats.totalMenus = allMenus.length;
        console.log(`[Migration] Found ${allMenus.length} menus to process`);

        // Get all roles
        const allRoles = await db.select().from(roles);
        console.log(`[Migration] Found ${allRoles.length} roles`);

        // Group roles by organization
        const rolesByOrg = new Map<string, typeof allRoles>();
        for (const role of allRoles) {
            const orgId = role.organizationId;
            if (!rolesByOrg.has(orgId)) {
                rolesByOrg.set(orgId, []);
            }
            rolesByOrg.get(orgId)!.push(role);
        }

        // Process each menu
        for (const menu of allMenus) {
            console.log(`\n[Migration] Processing menu: "${menu.label}" (${menu.id})`);
            console.log(`  - requiredPermission: ${menu.requiredPermission || 'null'}`);
            console.log(`  - source: ${menu.source}`);
            console.log(`  - organizationId: ${menu.organizationId}`);

            // Determine scope: core menus get global visibility, others get tenant-scoped
            const isGlobalMenu = menu.source === 'core';
            const targetOrgId = isGlobalMenu ? null : menu.organizationId;

            if (menu.requiredPermission) {
                stats.menusWithPermission++;

                // Find roles with the required permission
                const eligibleRoleIds = await findRolesWithPermission(
                    menu.requiredPermission,
                    menu.organizationId
                );

                console.log(`  - Found ${eligibleRoleIds.length} roles with permission`);

                // Create visibility records for eligible roles
                for (const roleId of eligibleRoleIds) {
                    try {
                        await db
                            .insert(roleMenuVisibility)
                            .values({
                                roleId,
                                menuId: menu.id,
                                organizationId: targetOrgId,
                                visible: true,
                            })
                            .onConflictDoNothing();
                        stats.visibilityRecordsCreated++;
                    } catch (err) {
                        const msg = `Failed to create visibility for role ${roleId}, menu ${menu.id}: ${err}`;
                        console.error(`  - ❌ ${msg}`);
                        stats.errors.push(msg);
                    }
                }
            } else {
                stats.menusWithoutPermission++;

                // No permission required - make visible to all roles
                // For global menus, use all roles; for tenant menus, use tenant's roles
                const targetRoles = isGlobalMenu
                    ? allRoles
                    : allRoles.filter(r => r.organizationId === menu.organizationId);

                console.log(`  - Making visible to ${targetRoles.length} roles (no permission required)`);

                for (const role of targetRoles) {
                    try {
                        await db
                            .insert(roleMenuVisibility)
                            .values({
                                roleId: role.id,
                                menuId: menu.id,
                                organizationId: targetOrgId,
                                visible: true,
                            })
                            .onConflictDoNothing();
                        stats.visibilityRecordsCreated++;
                    } catch (err) {
                        const msg = `Failed to create visibility for role ${role.id}, menu ${menu.id}: ${err}`;
                        console.error(`  - ❌ ${msg}`);
                        stats.errors.push(msg);
                    }
                }
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('[Migration] Migration completed');
        console.log('='.repeat(80));
        console.log(`Total menus: ${stats.totalMenus}`);
        console.log(`Menus with permission: ${stats.menusWithPermission}`);
        console.log(`Menus without permission: ${stats.menusWithoutPermission}`);
        console.log(`Visibility records created: ${stats.visibilityRecordsCreated}`);
        console.log(`Errors: ${stats.errors.length}`);

        if (stats.errors.length > 0) {
            console.log('\nErrors:');
            stats.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
        }

    } catch (error) {
        console.error('[Migration] Fatal error:', error);
        stats.errors.push(`Fatal error: ${error}`);
    }

    return stats;
}

/**
 * Verify migration results
 */
async function verifyMigration(): Promise<void> {
    console.log('\n' + '='.repeat(80));
    console.log('[Verification] Checking migration results');
    console.log('='.repeat(80));

    // Count visibility records
    const visibilityCount = await db
        .select({ count: roleMenuVisibility.id })
        .from(roleMenuVisibility);
    console.log(`Total visibility records: ${visibilityCount.length}`);

    // Check for menus without any visibility records
    const allMenus = await db.select().from(menus);
    const menusWithVisibility = await db
        .selectDistinct({ menuId: roleMenuVisibility.menuId })
        .from(roleMenuVisibility);

    const menuIdsWithVisibility = new Set(menusWithVisibility.map(m => m.menuId));
    const menusWithoutVisibility = allMenus.filter(m => !menuIdsWithVisibility.has(m.id));

    if (menusWithoutVisibility.length > 0) {
        console.log(`\n⚠️ Menus without any visibility records (${menusWithoutVisibility.length}):`);
        menusWithoutVisibility.forEach(m => {
            console.log(`  - ${m.label} (${m.id})`);
        });
    } else {
        console.log('✅ All menus have visibility records');
    }

    // Check global vs tenant visibility
    const globalRecords = await db
        .select({ count: roleMenuVisibility.id })
        .from(roleMenuVisibility)
        .where(isNull(roleMenuVisibility.organizationId));
    console.log(`Global visibility records: ${globalRecords.length}`);

    const tenantRecords = await db
        .select({ count: roleMenuVisibility.id })
        .from(roleMenuVisibility)
        .where(isNotNull(roleMenuVisibility.organizationId));
    console.log(`Tenant visibility records: ${tenantRecords.length}`);
}

// Main execution
async function main() {
    console.log('Starting menu visibility migration...\n');

    const stats = await migrateMenuVisibility();

    if (stats.errors.length === 0) {
        await verifyMigration();
        console.log('\n✅ Migration completed successfully!');
    } else {
        console.log('\n⚠️ Migration completed with errors. Please review.');
    }

    process.exit(stats.errors.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
