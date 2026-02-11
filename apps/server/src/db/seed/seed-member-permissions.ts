/**
 * Seed Member Permissions Script
 *
 * Adds Member:read and Role:read permissions to existing member roles.
 * Adds Member:manage (or invite/update/remove) to admin roles.
 *
 * Run: pnpm --filter @wordrhyme/server seed:member-permissions
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

async function seedMemberPermissions() {
    console.log('🔧 Adding Member and Role permissions to roles...\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);
    const db = drizzle(client);

    try {
        // Find all member roles
        const memberRoles = await db
            .select({ id: roles.id, organizationId: roles.organizationId, name: roles.name })
            .from(roles)
            .where(eq(roles.slug, 'member'));

        // Find all admin roles
        const adminRoles = await db
            .select({ id: roles.id, organizationId: roles.organizationId, name: roles.name })
            .from(roles)
            .where(eq(roles.slug, 'admin'));

        // Find all owner roles
        const ownerRoles = await db
            .select({ id: roles.id, organizationId: roles.organizationId, name: roles.name })
            .from(roles)
            .where(eq(roles.slug, 'owner'));

        console.log(`📋 Found ${memberRoles.length} member, ${adminRoles.length} admin, ${ownerRoles.length} owner roles\n`);

        let totalAdded = 0;

        // Helper to add permission
        const addPermission = async (roleId: string, action: string, subject: string) => {
            const result = await db
                .insert(rolePermissions)
                .values({
                    roleId,
                    action,
                    subject,
                    fields: null,
                    conditions: null,
                    inverted: false,
                })
                .onConflictDoNothing()
                .returning();
            return result.length > 0;
        };

        // Add permissions to member roles
        for (const role of memberRoles) {
            console.log(`  ➤ Member: ${role.name} (org: ${role.organizationId})`);

            // Add Member:read
            if (await addPermission(role.id, 'read', 'Member')) {
                totalAdded++;
                console.log(`    ✓ Added Member:read`);
            }

            // Add Role:read
            if (await addPermission(role.id, 'read', 'Role')) {
                totalAdded++;
                console.log(`    ✓ Added Role:read`);
            }
        }

        // Add Member:manage to admin roles (covers invite, update, remove)
        for (const role of adminRoles) {
            console.log(`  ➤ Admin: ${role.name} (org: ${role.organizationId})`);

            if (await addPermission(role.id, 'manage', 'Member')) {
                totalAdded++;
                console.log(`    ✓ Added Member:manage`);
            }
        }

        // Verify owner roles have manage all (they should already)
        for (const role of ownerRoles) {
            console.log(`  ➤ Owner: ${role.name} (org: ${role.organizationId})`);

            if (await addPermission(role.id, 'manage', 'Member')) {
                totalAdded++;
                console.log(`    ✓ Added Member:manage`);
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log('🎉 Update complete!');
        console.log(`   Processed ${memberRoles.length + adminRoles.length + ownerRoles.length} roles`);
        console.log(`   Added ${totalAdded} new permissions`);
        console.log('='.repeat(50));

    } catch (error) {
        console.error('❌ Update failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

seedMemberPermissions();
