/**
 * Check Menu Organization IDs
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

async function checkMenuOrgIds() {
    console.log('🔍 Checking menu organization IDs...\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);

    try {
        // Get all menus
        const menus = await client`
            SELECT
                id,
                label,
                organization_id,
                target
            FROM menus
            ORDER BY target, label
        `;

        console.log('📋 All menus in database:');
        console.log('='.repeat(80));
        menus.forEach(m => {
            console.log(`${m.label.padEnd(25)} | org_id: ${m.organization_id.padEnd(35)} | ${m.target}`);
        });
        console.log('='.repeat(80));

        // Get unique org IDs
        const orgIds = [...new Set(menus.map(m => m.organization_id))];
        console.log(`\n📊 Unique organization IDs in menus: ${orgIds.length}`);
        orgIds.forEach(id => console.log(`  - ${id}`));

        // Get user's org ID
        const userId = 'dUgWeEmeC6xEM3eN6SGdCW4Tybvmzrul';
        const memberships = await client`
            SELECT organization_id, o.name
            FROM member m
            JOIN organization o ON m.organization_id = o.id
            WHERE m.user_id = ${userId}
        `;

        console.log(`\n👤 User's organization:`);
        memberships.forEach(m => {
            console.log(`  - ${m.name}: ${m.organization_id}`);
        });

        // Check if there's a mismatch
        if (memberships.length > 0) {
            const userOrgId = memberships[0].organization_id;
            const menusForUserOrg = menus.filter(m => m.organization_id === userOrgId);

            console.log(`\n🔍 Menus for user's organization (${userOrgId}):`);
            if (menusForUserOrg.length === 0) {
                console.log('  ❌ NO MENUS FOUND!');
                console.log('\n  ⚠️  PROBLEM: Menus are stored with different organization_id');
                console.log('  The menu.list query filters by organization_id, so user sees no menus.');
            } else {
                menusForUserOrg.forEach(m => console.log(`  - ${m.label}`));
            }
        }

    } catch (error) {
        console.error('❌ Check failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

checkMenuOrgIds();
