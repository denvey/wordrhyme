/**
 * Add Missing Permissions to Admin Role
 *
 * Adds Media, Webhook, Core, and System permissions to existing admin roles.
 * Run: pnpm --filter @wordrhyme/server tsx src/db/seed/seed-admin-missing-permissions.ts
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

// Import schemas
import { roles, rolePermissions } from '../schema/definitions';

/**
 * New permissions to add for admin role
 */
const MISSING_PERMISSIONS = [
    { action: 'manage', subject: 'Media' },     // Media library
    { action: 'manage', subject: 'Webhook' },   // Webhooks menu
    { action: 'manage', subject: 'Core' },      // API Tokens, Audit Logs
    { action: 'manage', subject: 'System' },    // Hooks, System Settings
];

async function addMissingPermissions() {
    console.log('🔧 Adding missing permissions to admin roles...\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const db = drizzle(databaseUrl);

    try {
        // Find all admin roles
        const adminRoles = await db
            .select({ id: roles.id, organizationId: roles.organizationId, name: roles.name })
            .from(roles)
            .where(eq(roles.slug, 'admin'));

        if (adminRoles.length === 0) {
            console.log('✅ No admin roles found. Nothing to update.');
            process.exit(0);
        }

        console.log(`📋 Found ${adminRoles.length} admin roles to update:\n`);

        let totalAdded = 0;

        for (const role of adminRoles) {
            console.log(`  ➤ ${role.name} (org: ${role.organizationId})`);

            for (const permission of MISSING_PERMISSIONS) {
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
        console.log(`   Processed ${adminRoles.length} admin roles`);
        console.log(`   Added ${totalAdded} new permissions`);
        console.log('='.repeat(50));

    } catch (error) {
        console.error('❌ Update failed:', error);
        process.exit(1);
    }
}

addMissingPermissions();
