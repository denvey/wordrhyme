/**
 * Fix Menu Visibility
 *
 * Updates existing database to add missing menu visibility records.
 * Run this after updating seed-roles.ts to fix existing organizations.
 *
 * Run: pnpm --filter @wordrhyme/server exec tsx src/db/seed/fix-menu-visibility.ts
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { db } from '../client';
import { roles, roleMenuVisibility, menus } from '../schema/definitions';
import { eq, and, notLike, inArray } from 'drizzle-orm';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

/**
 * Basic menus that member/viewer can see
 */
const BASIC_MENU_IDS = ['core:dashboard'];

/**
 * Menu visibility strategy by role slug
 */
const ROLE_VISIBILITY: Record<string, 'all' | 'basic'> = {
    owner: 'all',
    admin: 'all',
    member: 'basic',
    viewer: 'basic',
};

async function fixMenuVisibility() {
    console.log('='.repeat(60));
    console.log('Fix Menu Visibility Script');
    console.log('='.repeat(60));

    // 1. Get all non-platform menus
    const allMenus = await db
        .select({ id: menus.id, label: menus.label })
        .from(menus)
        .where(and(
            eq(menus.organizationId, 'default'),
            notLike(menus.id, 'platform:%')
        ));

    console.log(`\n[1] Found ${allMenus.length} non-platform menus`);
    allMenus.forEach(m => console.log(`   - ${m.id}: ${m.label}`));

    // 2. Get all roles grouped by organization
    const allRoles = await db
        .select({
            id: roles.id,
            slug: roles.slug,
            organizationId: roles.organizationId,
            name: roles.name,
        })
        .from(roles);

    console.log(`\n[2] Found ${allRoles.length} roles`);

    // 3. Process each role
    let addedCount = 0;
    let skippedCount = 0;

    for (const role of allRoles) {
        const visibility = ROLE_VISIBILITY[role.slug];
        if (!visibility) {
            console.log(`   ⏭️  Skipping custom role: ${role.name} (${role.slug})`);
            skippedCount++;
            continue;
        }

        // Determine which menus this role should see
        let targetMenuIds: string[];
        if (visibility === 'all') {
            targetMenuIds = allMenus.map(m => m.id);
        } else {
            targetMenuIds = BASIC_MENU_IDS;
        }

        // Check existing visibility records
        const existingVisibility = await db
            .select({ menuId: roleMenuVisibility.menuId })
            .from(roleMenuVisibility)
            .where(eq(roleMenuVisibility.roleId, role.id));

        const existingMenuIds = new Set(existingVisibility.map(v => v.menuId));

        // Add missing visibility records
        const missingMenuIds = targetMenuIds.filter(id => !existingMenuIds.has(id));

        if (missingMenuIds.length > 0) {
            for (const menuId of missingMenuIds) {
                await db
                    .insert(roleMenuVisibility)
                    .values({
                        roleId: role.id,
                        menuId,
                        organizationId: null, // Global scope
                        visible: true,
                    })
                    .onConflictDoNothing();
            }
            console.log(`   ✅ Added ${missingMenuIds.length} menus to ${role.name} (${role.slug}) in ${role.organizationId}`);
            addedCount += missingMenuIds.length;
        } else {
            console.log(`   ℹ️  ${role.name} (${role.slug}) already has all required menus`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Summary:');
    console.log(`   Added: ${addedCount} visibility records`);
    console.log(`   Skipped: ${skippedCount} custom roles`);
    console.log('='.repeat(60));

    process.exit(0);
}

fixMenuVisibility().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
