/**
 * Fix Admin Permissions Script
 *
 * Changes Settings and FeatureFlag permissions from 'manage' to 'update' for admin roles.
 * Run: pnpm --filter @wordrhyme/server seed:admin-permissions
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

async function fixAdminPermissions() {
    console.log('🔧 Fixing admin role permissions (manage → update for Settings/FeatureFlag)...\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);
    const db = drizzle(client);

    try {
        // Find all admin roles
        const adminRoles = await db
            .select({ id: roles.id, organizationId: roles.organizationId, name: roles.name })
            .from(roles)
            .where(eq(roles.slug, 'admin'));

        if (adminRoles.length === 0) {
            console.log('✅ No admin roles found. Nothing to update.');
            await client.end();
            process.exit(0);
        }

        console.log(`📋 Found ${adminRoles.length} admin roles to update:\n`);

        let totalUpdated = 0;

        for (const role of adminRoles) {
            console.log(`  ➤ ${role.name} (org: ${role.organizationId})`);

            // Update 'manage Settings' to 'update Settings'
            const settingsResult = await db
                .update(rolePermissions)
                .set({ action: 'update' })
                .where(and(
                    eq(rolePermissions.roleId, role.id),
                    eq(rolePermissions.subject, 'Settings'),
                    eq(rolePermissions.action, 'manage')
                ))
                .returning();

            if (settingsResult.length > 0) {
                totalUpdated++;
                console.log(`    ✓ Settings: manage → update`);
            }

            // Update 'manage FeatureFlag' to 'update FeatureFlag'
            const flagResult = await db
                .update(rolePermissions)
                .set({ action: 'update' })
                .where(and(
                    eq(rolePermissions.roleId, role.id),
                    eq(rolePermissions.subject, 'FeatureFlag'),
                    eq(rolePermissions.action, 'manage')
                ))
                .returning();

            if (flagResult.length > 0) {
                totalUpdated++;
                console.log(`    ✓ FeatureFlag: manage → update`);
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log('🎉 Update complete!');
        console.log(`   Processed ${adminRoles.length} admin roles`);
        console.log(`   Updated ${totalUpdated} permissions`);
        console.log('='.repeat(50));

    } catch (error) {
        console.error('❌ Update failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

fixAdminPermissions();
