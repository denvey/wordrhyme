/**
 * Check Owner Role Permissions
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

async function checkOwnerRole() {
    console.log('🔍 Checking owner role permissions...\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);

    try {
        // Get user info
        const userId = 'dUgWeEmeC6xEM3eN6SGdCW4Tybvmzrul'; // admin@example.com

        // Get user's membership
        const memberships = await client`
            SELECT
                m.id,
                m.organization_id,
                m.user_id,
                m.role as member_role,
                o.name as org_name
            FROM member m
            JOIN organization o ON m.organization_id = o.id
            WHERE m.user_id = ${userId}
        `;

        console.log('📋 User Memberships:');
        console.log('='.repeat(60));
        memberships.forEach(m => {
            console.log(`Organization: ${m.org_name}`);
            console.log(`  Member Role: ${m.member_role}`);
            console.log(`  Org ID: ${m.organization_id}`);
        });
        console.log('='.repeat(60));

        // Check if there's a 'roles' record with slug='owner' for this org
        for (const m of memberships) {
            console.log(`\n🔍 Checking roles table for org: ${m.org_name}`);

            const ownerRoles = await client`
                SELECT id, name, slug, organization_id
                FROM roles
                WHERE slug = 'owner'
                AND organization_id = ${m.organization_id}
            `;

            if (ownerRoles.length === 0) {
                console.log('  ⚠️  No owner role found in roles table!');
                console.log('  This means member.role="owner" cannot map to any role permissions!');
            } else {
                console.log(`  ✓ Found owner role: ${ownerRoles[0].name} (${ownerRoles[0].id})`);

                // Check permissions for this role
                const permissions = await client`
                    SELECT action, subject, fields, conditions
                    FROM role_permissions
                    WHERE role_id = ${ownerRoles[0].id}
                    ORDER BY subject, action
                `;

                console.log(`  Permissions: ${permissions.length} total`);
                if (permissions.length === 0) {
                    console.log('    ⚠️  No permissions configured!');
                } else {
                    permissions.forEach(p => {
                        console.log(`    - ${p.action} ${p.subject}`);
                    });
                }
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('🎯 DIAGNOSIS:');
        console.log('If member.role="owner" but no roles.slug="owner" exists,');
        console.log('then the user has NO permissions!');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('❌ Check failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

checkOwnerRole();
