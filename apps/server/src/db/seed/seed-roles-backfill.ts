/**
 * Backfill Roles Script
 *
 * Seeds default system roles for all existing organizations that don't have roles yet.
 * Run after migration: pnpm --filter @wordrhyme/server seed:roles
 *
 * Updated to use CASL format for permissions.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, notExists } from 'drizzle-orm';

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

// Import schemas
import { organization } from '../schema/auth-schema';
import { roles, rolePermissions } from '../schema/definitions';

/**
 * CASL Rule definition
 */
interface CaslRuleDef {
    action: string;
    subject: string;
    fields?: string[] | null;
    conditions?: Record<string, unknown> | null;
    inverted?: boolean;
}

/**
 * Role definition with CASL rules
 */
interface RoleDef {
    slug: string;
    name: string;
    description: string;
    rules: CaslRuleDef[];
}

// Default system role definitions in CASL format
const DEFAULT_SYSTEM_ROLES: RoleDef[] = [
    {
        slug: 'owner',
        name: 'Owner',
        description: 'Full access to all resources',
        rules: [
            { action: 'manage', subject: 'all' },
        ],
    },
    {
        slug: 'admin',
        name: 'Administrator',
        description: 'Manage organization, plugins, users, and content',
        rules: [
            { action: 'manage', subject: 'Organization' },
            { action: 'manage', subject: 'Plugin' },
            { action: 'manage', subject: 'User' },
            { action: 'manage', subject: 'Content' },
            { action: 'manage', subject: 'Role' },
            { action: 'manage', subject: 'Menu' },
            { action: 'update', subject: 'Settings' },
            { action: 'update', subject: 'FeatureFlag' },
        ],
    },
    {
        slug: 'member',
        name: 'Member',
        description: 'Read content and comment',
        rules: [
            { action: 'read', subject: 'Content' },
            { action: 'create', subject: 'Content' },
            { action: 'update', subject: 'Content', conditions: { ownerId: '${user.id}' } },
            { action: 'read', subject: 'User' },
        ],
    },
    {
        slug: 'viewer',
        name: 'Viewer',
        description: 'Read public content only',
        rules: [
            { action: 'read', subject: 'Content' },
        ],
    },
];

async function backfillRoles() {
    console.log('🔧 Backfilling default roles for existing organizations (CASL format)...\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);
    const db = drizzle(client);

    try {
        // Find organizations without any roles
        const orgsWithoutRoles = await db
            .select({ id: organization.id, name: organization.name })
            .from(organization)
            .where(
                notExists(
                    db.select().from(roles).where(eq(roles.organizationId, organization.id))
                )
            );

        if (orgsWithoutRoles.length === 0) {
            console.log('✅ All organizations already have roles. Nothing to backfill.');
            await client.end();
            process.exit(0);
        }

        console.log(`📋 Found ${orgsWithoutRoles.length} organizations without roles:\n`);

        for (const org of orgsWithoutRoles) {
            console.log(`  ➤ ${org.name} (${org.id})`);

            for (const roleDef of DEFAULT_SYSTEM_ROLES) {
                // Create the role
                const [role] = await db
                    .insert(roles)
                    .values({
                        organizationId: org.id,
                        name: roleDef.name,
                        slug: roleDef.slug,
                        description: roleDef.description,
                        isSystem: true,
                    })
                    .onConflictDoNothing()
                    .returning();

                // If role was created, add permissions in CASL format
                if (role) {
                    for (const rule of roleDef.rules) {
                        await db
                            .insert(rolePermissions)
                            .values({
                                roleId: role.id,
                                action: rule.action,
                                subject: rule.subject,
                                fields: rule.fields ?? null,
                                conditions: rule.conditions ?? null,
                                inverted: rule.inverted ?? false,
                            })
                            .onConflictDoNothing();
                    }
                }
            }

            console.log(`    ✓ Created ${DEFAULT_SYSTEM_ROLES.length} system roles with CASL rules`);
        }

        console.log('\n' + '='.repeat(50));
        console.log('🎉 Backfill complete!');
        console.log(`   Processed ${orgsWithoutRoles.length} organizations`);
        console.log('='.repeat(50));

    } catch (error) {
        console.error('❌ Backfill failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

backfillRoles();
