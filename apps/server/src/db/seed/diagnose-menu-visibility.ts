/**
 * Diagnose Menu Visibility Script
 *
 * Check user role and menu visibility configuration
 * Run with: npx tsx apps/server/src/db/seed/diagnose-menu-visibility.ts
 */

import { db } from '../client';
import { sql } from 'drizzle-orm';

async function main() {
    const userEmail = 'admin@example.com';

    console.log('='.repeat(80));
    console.log(`[Diagnose] Checking menu visibility for: ${userEmail}`);
    console.log('='.repeat(80));

    // 1. Find user
    const userResult = await db.execute(sql`
        SELECT id, email, name FROM "user" WHERE email = ${userEmail}
    `);
    const userRows = Array.isArray(userResult) ? userResult : (userResult as any).rows || [];

    if (userRows.length === 0) {
        console.log('\n❌ User not found');
        process.exit(1);
    }

    const targetUser = userRows[0] as { id: string; email: string; name: string };
    console.log('\n[User Info]');
    console.log(`  ID: ${targetUser.id}`);
    console.log(`  Email: ${targetUser.email}`);
    console.log(`  Name: ${targetUser.name}`);

    // 2. Find user's memberships (all tables use snake_case column names)
    // Note: member.role stores the role slug, not the role ID
    const membershipResult = await db.execute(sql`
        SELECT
            m.id as member_id,
            m.organization_id as org_id,
            m.role as role_slug,
            r.id as role_id,
            r.name as role_name,
            r.organization_id as role_org_id
        FROM member m
        LEFT JOIN roles r ON m.role = r.slug
            AND (r.organization_id IS NULL OR r.organization_id = m.organization_id)
        WHERE m.user_id = ${targetUser.id}
    `);

    const memberRows = Array.isArray(membershipResult) ? membershipResult : (membershipResult as any).rows || [];

    console.log('\n[Memberships]');
    if (memberRows.length === 0) {
        console.log('  ❌ No memberships found');
    } else {
        for (const m of memberRows as Array<{
            member_id: string;
            org_id: string;
            role_slug: string;
            role_id: string | null;
            role_name: string | null;
            role_org_id: string | null;
        }>) {
            console.log(`  - Organization ID: ${m.org_id}`);
            console.log(`    Role Slug: ${m.role_slug}`);
            console.log(`    Role ID: ${m.role_id ?? 'NOT FOUND'}`);
            console.log(`    Role Name: ${m.role_name ?? 'NOT FOUND'}`);
            console.log(`    Role Org ID: ${m.role_org_id ?? 'null (system role)'}`);
        }
    }

    // 3. Get all admin menus
    const menusResult = await db.execute(sql`
        SELECT id, label, path, "order" FROM menus WHERE target = 'admin' ORDER BY "order"
    `);

    const menuRows = Array.isArray(menusResult) ? menusResult : (menusResult as any).rows || [];

    console.log('\n[All Admin Menus in Database]');
    console.log(`  Total: ${menuRows.length}`);
    for (const menu of menuRows as Array<{ id: string; label: string; path: string; order: number }>) {
        console.log(`  - ${menu.label} (${menu.id}) - ${menu.path}`);
    }

    // 4. Get visibility records for user's roles
    const roleIds = (memberRows as Array<{ role_id: string | null }>)
        .map(m => m.role_id)
        .filter((id): id is string => id !== null);

    if (roleIds.length === 0) {
        console.log('\n❌ No role IDs found for user (role lookup failed)');

        // Debug: list all roles
        const allRoles = await db.execute(sql`
            SELECT id, slug, name, organization_id FROM roles ORDER BY slug
        `);
        console.log('\n[All Roles in Database]');
        for (const r of (Array.isArray(allRoles) ? allRoles : (allRoles as any).rows || []) as Array<any>) {
            console.log(`  - ${r.name} (${r.slug}) - ID: ${r.id}, Org: ${r.organization_id ?? 'null'}`);
        }

        process.exit(1);
    }

    console.log('\n[Visibility Records for User Roles]');

    for (const roleId of roleIds) {
        // role_menu_visibility uses snake_case: role_id, menu_id, organization_id
        const visResult = await db.execute(sql`
            SELECT
                rmv.menu_id,
                m.label as menu_label,
                rmv.visible,
                rmv.organization_id
            FROM role_menu_visibility rmv
            LEFT JOIN menus m ON rmv.menu_id = m.id
            WHERE rmv.role_id = ${roleId}
            ORDER BY m.label
        `);

        const visRows = Array.isArray(visResult) ? visResult : (visResult as any).rows || [];

        const roleName = (memberRows as Array<{ role_id: string | null; role_name: string | null }>)
            .find(m => m.role_id === roleId)?.role_name;

        console.log(`\n  Role: ${roleName} (${roleId})`);
        console.log(`  Total visibility records: ${visRows.length}`);

        const rows = visRows as Array<{
            menu_id: string;
            menu_label: string;
            visible: boolean;
            organization_id: string | null;
        }>;

        const globalRecords = rows.filter(r => r.organization_id === null);
        const orgRecords = rows.filter(r => r.organization_id !== null);

        console.log(`  Global records: ${globalRecords.length}`);
        console.log(`  Org-specific records: ${orgRecords.length}`);

        if (globalRecords.length > 0) {
            console.log(`\n  Visible menus (global):`);
            for (const r of globalRecords.filter(r => r.visible)) {
                console.log(`    ✅ ${r.menu_label} (${r.menu_id})`);
            }

            const hiddenGlobal = globalRecords.filter(r => !r.visible);
            if (hiddenGlobal.length > 0) {
                console.log(`\n  Hidden menus (global):`);
                for (const r of hiddenGlobal) {
                    console.log(`    ❌ ${r.menu_label} (${r.menu_id})`);
                }
            }
        }
    }

    // 5. Simulate the filterMenusByRoleVisibility logic
    console.log('\n[Simulated filterMenusByRoleVisibility Result]');
    const orgId = (memberRows[0] as { org_id: string }).org_id;

    // Build role IDs list for SQL
    const roleIdsList = roleIds.map(id => `'${id}'`).join(', ');

    const visibilityQuery = await db.execute(sql.raw(`
        SELECT
            m.id as menu_id,
            m.label as menu_label,
            m.path,
            bool_or(COALESCE(tenant_vis.visible, global_vis.visible, false)) as is_visible
        FROM menus m
        LEFT JOIN role_menu_visibility global_vis
            ON m.id = global_vis.menu_id
            AND global_vis.organization_id IS NULL
            AND global_vis.role_id IN (${roleIdsList})
        LEFT JOIN role_menu_visibility tenant_vis
            ON m.id = tenant_vis.menu_id
            AND tenant_vis.organization_id = '${orgId}'
            AND tenant_vis.role_id IN (${roleIdsList})
        WHERE m.target = 'admin'
        GROUP BY m.id, m.label, m.path
        ORDER BY m.label
    `));

    const simRows = Array.isArray(visibilityQuery) ? visibilityQuery : (visibilityQuery as any).rows || [];

    console.log(`\n  Organization: ${orgId}`);
    console.log(`  Role IDs: ${roleIds.join(', ')}`);

    const typedSimRows = simRows as Array<{
        menu_id: string;
        menu_label: string;
        path: string;
        is_visible: boolean;
    }>;

    console.log(`\n  ✅ Visible menus (${typedSimRows.filter(r => r.is_visible).length}):`);
    for (const row of typedSimRows.filter(r => r.is_visible)) {
        console.log(`    - ${row.menu_label} (${row.path})`);
    }

    console.log(`\n  ❌ Hidden menus (${typedSimRows.filter(r => !r.is_visible).length}):`);
    for (const row of typedSimRows.filter(r => !r.is_visible)) {
        console.log(`    - ${row.menu_label} (${row.path})`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('Diagnosis complete');
    console.log('='.repeat(80));

    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
