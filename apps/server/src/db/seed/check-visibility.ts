/**
 * Check Role Menu Visibility
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

async function checkRoleMenuVisibility() {
    console.log('🔍 Checking role_menu_visibility...\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);

    try {
        // Get visibility records with menu and role info
        const visibility = await client`
            SELECT
                rmv.menu_id,
                rmv.role_id,
                rmv.organization_id as vis_org_id,
                rmv.visible,
                m.label as menu_label,
                m.organization_id as menu_org_id,
                r.slug as role_slug,
                r.organization_id as role_org_id
            FROM role_menu_visibility rmv
            LEFT JOIN menus m ON rmv.menu_id = m.id
            LEFT JOIN roles r ON rmv.role_id = r.id
            ORDER BY m.label, r.slug
        `;

        console.log('📋 Role Menu Visibility records:');
        console.log('='.repeat(120));
        console.log('Menu'.padEnd(25) + ' | ' + 'Role'.padEnd(15) + ' | ' + 'Visible'.padEnd(8) + ' | ' + 'Vis Org'.padEnd(40) + ' | Menu Org');
        console.log('-'.repeat(120));
        visibility.forEach(v => {
            const menuLabel = v['menu_label'] || '(unknown)';
            const roleSlug = v['role_slug'] || '(unknown)';
            const visible = v['visible'] ? 'YES' : 'NO';
            const visOrgId = v['vis_org_id'] === null ? '(NULL - GLOBAL)' : v['vis_org_id'];
            const menuOrgId = v['menu_org_id'] === null ? '(NULL - GLOBAL)' : v['menu_org_id'];
            console.log(`${menuLabel.padEnd(25)} | ${roleSlug.padEnd(15)} | ${visible.padEnd(8)} | ${visOrgId.toString().substring(0, 38).padEnd(40)} | ${menuOrgId}`);
        });
        console.log('='.repeat(120));

        // Check if there are any global visibility records
        const globalVisibility = visibility.filter(v => v['vis_org_id'] === null);
        console.log(`\n📊 Summary:`);
        console.log(`  - Total visibility records: ${visibility.length}`);
        console.log(`  - Global visibility records (vis_org_id = NULL): ${globalVisibility.length}`);

        // Get all roles
        console.log('\n📋 All roles by organization:');
        const roles = await client`
            SELECT id, slug, name, organization_id
            FROM roles
            ORDER BY organization_id, slug
        `;

        let currentOrg = '';
        roles.forEach(r => {
            if (r['organization_id'] !== currentOrg) {
                currentOrg = r['organization_id'];
                console.log(`\n  Organization: ${currentOrg}`);
            }
            console.log(`    - ${r['slug']}: ${r['id']}`);
        });

    } catch (error) {
        console.error('❌ Check failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

checkRoleMenuVisibility();
