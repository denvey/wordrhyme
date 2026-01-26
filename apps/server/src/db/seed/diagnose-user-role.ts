/**
 * Diagnose User Role and Permissions
 *
 * Checks the current user's role assignment and permissions.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

async function diagnoseUser() {
    console.log('🔍 Diagnosing user role and permissions...\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);

    try {
        // Query user information
        const users = await client`
            SELECT
                id,
                email,
                name,
                role as "userRole",
                email_verified as "emailVerified",
                created_at as "createdAt"
            FROM "user"
            WHERE email LIKE '%admin%'
            ORDER BY created_at DESC
            LIMIT 5
        `;

        console.log('📋 Admin Users:');
        console.log('='.repeat(80));
        for (const user of users) {
            console.log(`Email: ${user.email}`);
            console.log(`Name: ${user.name || 'N/A'}`);
            console.log(`User Role: ${user.userRole || 'N/A'}`);
            console.log(`Email Verified: ${user.emailVerified ? 'Yes' : 'No'}`);
            console.log(`User ID: ${user.id}`);

            // Query member roles for this user
            const memberRoles = await client`
                SELECT
                    m.id as member_id,
                    m."organizationId",
                    o.name as org_name,
                    r.slug as role_slug,
                    r.name as role_name,
                    r."isSystem"
                FROM members m
                JOIN organization o ON m."organizationId" = o.id
                LEFT JOIN roles r ON m."roleId" = r.id
                WHERE m."userId" = ${user.id}
            `;

            if (memberRoles.length > 0) {
                console.log('\n  Organization Memberships:');
                for (const membership of memberRoles) {
                    console.log(`    - Org: ${membership.org_name} (${membership.organizationId})`);
                    console.log(`      Role: ${membership.role_name} (${membership.role_slug})`);
                    console.log(`      System Role: ${membership.isSystem ? 'Yes' : 'No'}`);

                    // Query permissions for this role
                    if (membership.role_slug) {
                        const roleId = await client`
                            SELECT id FROM roles
                            WHERE slug = ${membership.role_slug}
                            AND "organizationId" = ${membership.organizationId}
                            LIMIT 1
                        `;

                        if (roleId.length > 0) {
                            const permissions = await client`
                                SELECT action, subject, fields, conditions
                                FROM role_permissions
                                WHERE "roleId" = ${roleId[0].id}
                                ORDER BY subject, action
                            `;

                            console.log(`      Permissions (${permissions.length} total):`);
                            permissions.slice(0, 10).forEach(p => {
                                console.log(`        - ${p.action} ${p.subject}`);
                            });
                            if (permissions.length > 10) {
                                console.log(`        ... and ${permissions.length - 10} more`);
                            }
                        }
                    }
                }
            } else {
                console.log('\n  ⚠️  No organization memberships found!');
            }

            console.log('='.repeat(80));
            console.log('');
        }

    } catch (error) {
        console.error('❌ Diagnosis failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

diagnoseUser();
