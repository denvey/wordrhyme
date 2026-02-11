/**
 * Add I18n Permissions to Admin Role
 *
 * Adds I18nLanguage and I18nMessage manage permissions to existing admin roles.
 * Run: pnpm --filter @wordrhyme/server tsx src/db/seed/seed-i18n-permissions.ts
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

// Import schemas
import { roles, rolePermissions } from '../schema/definitions';

/**
 * I18n permissions to add for admin role
 */
const I18N_PERMISSIONS = [
    { action: 'manage', subject: 'I18nLanguage' },
    { action: 'manage', subject: 'I18nMessage' },
];

async function addI18nPermissions() {
    console.log('🌐 Adding I18n permissions to admin and owner roles...\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);
    const db = drizzle(client);

    try {
        // Find all admin and owner roles
        const targetRoles = await db
            .select({ id: roles.id, organizationId: roles.organizationId, name: roles.name, slug: roles.slug })
            .from(roles)
            .where(eq(roles.slug, 'admin'));

        const ownerRoles = await db
            .select({ id: roles.id, organizationId: roles.organizationId, name: roles.name, slug: roles.slug })
            .from(roles)
            .where(eq(roles.slug, 'owner'));

        const allRoles = [...targetRoles, ...ownerRoles];

        if (allRoles.length === 0) {
            console.log('✅ No admin/owner roles found. Nothing to update.');
            await client.end();
            process.exit(0);
        }

        console.log(`📋 Found ${allRoles.length} roles to update:\n`);

        let totalAdded = 0;

        for (const role of allRoles) {
            console.log(`  ➤ ${role.name} (${role.slug}) - org: ${role.organizationId}`);

            for (const permission of I18N_PERMISSIONS) {
                // Check if permission already exists
                const existing = await db
                    .select()
                    .from(rolePermissions)
                    .where(and(
                        eq(rolePermissions.roleId, role.id),
                        eq(rolePermissions.action, permission.action),
                        eq(rolePermissions.subject, permission.subject)
                    ))
                    .limit(1);

                if (existing.length > 0) {
                    console.log(`    ⊙ ${permission.action} ${permission.subject} (already exists)`);
                } else {
                    // Add new permission
                    await db
                        .insert(rolePermissions)
                        .values({
                            roleId: role.id,
                            action: permission.action,
                            subject: permission.subject,
                            fields: null,
                            conditions: null,
                            inverted: false,
                        });
                    console.log(`    ✓ ${permission.action} ${permission.subject} (added)`);
                    totalAdded++;
                }
            }
            console.log('');
        }

        console.log('='.repeat(50));
        console.log('🎉 Update complete!');
        console.log(`   Processed ${allRoles.length} roles`);
        console.log(`   Added ${totalAdded} new permissions`);
        console.log('='.repeat(50));

    } catch (error) {
        console.error('❌ Update failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

addI18nPermissions();
