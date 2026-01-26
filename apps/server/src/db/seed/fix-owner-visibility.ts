/**
 * Fix Owner Role Visibility
 *
 * Removes platform menu visibility from owner role.
 * Owner (tenant admin) should NOT see platform-level menus.
 *
 * Run with: pnpm --filter @wordrhyme/server exec tsx src/db/seed/fix-owner-visibility.ts
 */

import { db } from '../client';
import { roles, roleMenuVisibility } from '../schema/definitions';
import { eq, and, inArray } from 'drizzle-orm';

// Platform menu IDs (should only be visible to platform admin)
const PLATFORM_MENU_IDS = [
    'platform:users',
    'platform:settings',
    'platform:feature-flags',
    'platform:cache',
    'platform:plugin-health',
];

async function main() {
    console.log('='.repeat(80));
    console.log('[Fix] Removing platform menu visibility from owner role');
    console.log('='.repeat(80));

    // Find owner roles
    const ownerRoles = await db
        .select({ id: roles.id, slug: roles.slug })
        .from(roles)
        .where(eq(roles.slug, 'owner'));

    console.log(`Found ${ownerRoles.length} owner roles`);

    if (ownerRoles.length === 0) {
        console.log('No owner roles found, nothing to fix');
        process.exit(0);
    }

    const ownerRoleIds = ownerRoles.map(r => r.id);

    // Delete platform menu visibility for owner roles
    const deleted = await db
        .delete(roleMenuVisibility)
        .where(and(
            inArray(roleMenuVisibility.roleId, ownerRoleIds),
            inArray(roleMenuVisibility.menuId, PLATFORM_MENU_IDS)
        ))
        .returning();

    console.log(`\nDeleted ${deleted.length} platform menu visibility records from owner roles`);

    // Verify
    console.log('\n[Verification] Checking remaining visibility for owner roles...');
    for (const role of ownerRoles) {
        const remaining = await db
            .select({ menuId: roleMenuVisibility.menuId })
            .from(roleMenuVisibility)
            .where(eq(roleMenuVisibility.roleId, role.id));

        const platformMenus = remaining.filter(r => PLATFORM_MENU_IDS.includes(r.menuId));
        console.log(`  Owner role ${role.id}: ${remaining.length} menus visible, ${platformMenus.length} platform menus`);

        if (platformMenus.length > 0) {
            console.log('  ⚠️  Warning: Still has platform menus:', platformMenus.map(m => m.menuId));
        } else {
            console.log('  ✅ No platform menus visible');
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Fix completed');
    console.log('='.repeat(80));

    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
