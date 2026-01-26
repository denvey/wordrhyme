/**
 * Diagnose User Membership and Role Assignment
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

async function diagnoseMembership() {
    const email = 'admin@example.com';

    console.log(`🔍 Diagnosing membership for ${email}...\n`);

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);

    try {
        // Get user info
        const users = await client`
            SELECT id, email, name, role
            FROM "user"
            WHERE email = ${email}
        `;

        if (users.length === 0) {
            console.log('❌ User not found!');
            process.exit(1);
        }

        const user = users[0];
        console.log('📋 User Information:');
        console.log('='.repeat(60));
        console.log(`Email: ${user.email}`);
        console.log(`Name: ${user.name}`);
        console.log(`User Role (user.role): ${user.role}`);
        console.log(`User ID: ${user.id}`);
        console.log('='.repeat(60));

        // Check Better Auth session/account
        const accounts = await client`
            SELECT * FROM account
            WHERE user_id = ${user.id}
        `;
        console.log(`\n📧 Better Auth Accounts: ${accounts.length}`);

        // Check organization memberships
        const memberships = await client`
            SELECT
                m.id as membership_id,
                m.organization_id as "organizationId",
                m.role_id as "roleId",
                m.user_id as "userId",
                o.name as org_name,
                r.slug as role_slug,
                r.name as role_name
            FROM member m
            LEFT JOIN organization o ON m.organization_id = o.id
            LEFT JOIN roles r ON m.role_id = r.id
            WHERE m.user_id = ${user.id}
        `;

        console.log(`\n👥 Organization Memberships: ${memberships.length}`);
        console.log('='.repeat(60));

        if (memberships.length === 0) {
            console.log('⚠️  No organization memberships found!');
            console.log('   This user is NOT a member of any organization.');
            console.log('   This is why they cannot see menus that require permissions!\n');

            // List all organizations
            const orgs = await client`
                SELECT id, name, slug
                FROM organization
                LIMIT 5
            `;

            console.log('Available organizations:');
            orgs.forEach(org => {
                console.log(`  - ${org.name} (${org.id})`);
            });
        } else {
            memberships.forEach(m => {
                console.log(`Organization: ${m.org_name}`);
                console.log(`  Org ID: ${m.organizationId}`);
                console.log(`  Role: ${m.role_name} (${m.role_slug})`);
                console.log(`  Role ID: ${m.roleId}`);
                console.log(`  Membership ID: ${m.membership_id}`);
                console.log('-'.repeat(60));
            });

            // Check role permissions
            for (const m of memberships) {
                if (m.roleId) {
                    const permissions = await client`
                        SELECT action, subject
                        FROM role_permissions
                        WHERE "roleId" = ${m.roleId}
                        ORDER BY subject, action
                    `;

                    console.log(`\n🔑 Permissions for role "${m.role_name}":`);
                    if (permissions.length === 0) {
                        console.log('  ⚠️  No permissions found!');
                    } else {
                        permissions.forEach(p => {
                            console.log(`  - ${p.action} ${p.subject}`);
                        });
                    }
                }
            }
        }

        console.log('\n' + '='.repeat(60));

    } catch (error) {
        console.error('❌ Diagnosis failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

diagnoseMembership();
