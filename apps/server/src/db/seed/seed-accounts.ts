/**
 * Seed System Accounts
 *
 * Creates the default system accounts:
 * 1. Platform Admin - admin@wordrhyme.test (member of 'platform' org with admin role)
 * 2. Tenant Owner - owner@wordrhyme.test (member of 'default-org' with owner role)
 * 3. Tenant Member - member@wordrhyme.test (member of 'default-org' with member role)
 *
 * Architecture:
 * - 'platform' org: System organization for platform administrators
 * - 'default-org': Default tenant organization for testing
 * - Platform admins are members of 'platform' org, get admin role automatically
 * - No special code checks needed - unified role query system
 *
 * Run: pnpm --filter @wordrhyme/server exec tsx src/db/seed/seed-accounts.ts
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { db } from '../client';
import { user, account, organization, member } from '../schema/auth-schema';
import { roles, roleMenuVisibility, rolePermissions, menus } from '../schema/definitions';
import { eq, and } from 'drizzle-orm';
import { randomBytes, scryptSync } from 'crypto';
import { seedDefaultRoles } from './seed-roles';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

const TEST_PASSWORD = 'Test123456';
const PLATFORM_ORG_ID = 'platform';
const DEFAULT_ORG_ID = 'default-org';

// Generate ID compatible with better-auth
function generateId(length = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const randomValues = randomBytes(length);
    for (let i = 0; i < length; i++) {
        result += chars[randomValues[i]! % chars.length];
    }
    return result;
}

// Hash password using scrypt (compatible with better-auth)
function hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

// Account definitions
const ACCOUNTS = [
    {
        email: 'admin@wordrhyme.test',
        name: 'Platform Admin',
        userRole: 'admin', // Platform-level role (better-auth admin plugin)
        // Member of both platform org (as owner) and default-org (as owner)
        memberships: [
            { orgId: PLATFORM_ORG_ID, role: 'owner' },
            { orgId: DEFAULT_ORG_ID, role: 'owner' },
        ],
    },
    {
        email: 'owner@wordrhyme.test',
        name: 'Tenant Owner',
        userRole: 'user',
        memberships: [
            { orgId: DEFAULT_ORG_ID, role: 'owner' },
        ],
    },
    {
        email: 'member@wordrhyme.test',
        name: 'Tenant Member',
        userRole: 'user',
        memberships: [
            { orgId: DEFAULT_ORG_ID, role: 'member' },
        ],
    },
];

// Platform menu IDs (only visible to platform admin)
const PLATFORM_MENU_IDS = [
    'platform:users',
    'platform:settings',
    'platform:feature-flags',
    'platform:cache',
    'platform:plugin-health',
];

async function createPlatformOrganization(): Promise<void> {
    console.log('\n[1/5] Creating platform organization...');

    const existing = await db.select().from(organization).where(eq(organization.id, PLATFORM_ORG_ID)).limit(1);

    if (existing.length > 0) {
        console.log('   ✅ Platform organization already exists');
    } else {
        await db.insert(organization).values({
            id: PLATFORM_ORG_ID,
            name: 'Platform',
            slug: 'platform',
            createdAt: new Date(),
        });
        console.log('   ✅ Created platform organization');
    }

    const platformRolesToEnsure = [
        {
            slug: 'owner',
            name: 'Platform Owner',
            description: 'Platform owner with full system access',
        },
        {
            slug: 'admin',
            name: 'Platform Admin',
            description: 'Platform administrator with full system access',
        },
    ];

    for (const roleDef of platformRolesToEnsure) {
        const existingRole = await db
            .select()
            .from(roles)
            .where(and(eq(roles.slug, roleDef.slug), eq(roles.organizationId, PLATFORM_ORG_ID)))
            .limit(1);

        if (existingRole.length === 0) {
            const [role] = await db.insert(roles).values({
                organizationId: PLATFORM_ORG_ID,
                name: roleDef.name,
                slug: roleDef.slug,
                description: roleDef.description,
                isSystem: true,
            }).returning();

            if (role) {
                await db.insert(rolePermissions).values({
                    roleId: role.id,
                    action: 'manage',
                    subject: 'all',
                    fields: null,
                    conditions: null,
                    inverted: false,
                }).onConflictDoNothing();
            }
            console.log(`   ✅ Created ${roleDef.slug} role`);
        } else {
            console.log(`   ✅ Platform-${roleDef.slug} role already exists`);
        }
    }
}

async function createDefaultOrganization(): Promise<void> {
    console.log('\n[2/5] Creating default organization...');

    const existing = await db.select().from(organization).where(eq(organization.id, DEFAULT_ORG_ID)).limit(1);

    if (existing.length > 0) {
        console.log('   ✅ Default organization already exists');
    } else {
        await db.insert(organization).values({
            id: DEFAULT_ORG_ID,
            name: 'Default Organization',
            slug: 'default',
            createdAt: new Date(),
        });
        console.log('   ✅ Created default organization');
    }

    // Seed default roles for default organization
    console.log('   🔄 Seeding default roles...');
    await seedDefaultRoles(DEFAULT_ORG_ID, db);
    console.log('   ✅ Default roles seeded');
}

async function createAccounts(): Promise<void> {
    console.log('\n[3/5] Creating user accounts...');

    const hashedPassword = hashPassword(TEST_PASSWORD);

    for (const acc of ACCOUNTS) {
        // Check if user exists
        const existingUser = await db.select().from(user).where(eq(user.email, acc.email)).limit(1);

        let userId: string;

        if (existingUser.length > 0) {
            userId = existingUser[0]!.id;
            console.log(`   ℹ️  User exists: ${acc.email} (${userId})`);

            // Update user role if needed
            await db.update(user).set({ role: acc.userRole }).where(eq(user.id, userId));
        } else {
            // Create user
            userId = generateId();
            await db.insert(user).values({
                id: userId,
                email: acc.email,
                name: acc.name,
                emailVerified: true,
                role: acc.userRole,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Create account (for password auth)
            await db.insert(account).values({
                id: generateId(),
                accountId: userId,
                providerId: 'credential',
                userId: userId,
                password: hashedPassword,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            console.log(`   ✅ Created user: ${acc.email} (${userId})`);
        }

        // Create memberships in all organizations
        for (const { orgId, role } of acc.memberships) {
            const existingMember = await db
                .select()
                .from(member)
                .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
                .limit(1);

            if (existingMember.length > 0) {
                await db
                    .update(member)
                    .set({ role })
                    .where(eq(member.id, existingMember[0]!.id));
                console.log(`   ℹ️  Updated membership: ${acc.email} -> ${orgId}:${role}`);
            } else {
                await db.insert(member).values({
                    id: generateId(),
                    organizationId: orgId,
                    userId: userId,
                    role: role,
                    createdAt: new Date(),
                });
                console.log(`   ✅ Created membership: ${acc.email} -> ${orgId}:${role}`);
            }
        }
    }
}

async function setupMenuVisibility(): Promise<void> {
    console.log('\n[4/5] Setting up menu visibility...');

    // Get all menus
    const allMenus = await db.select().from(menus);
    const nonPlatformMenus = allMenus.filter((m) => !PLATFORM_MENU_IDS.includes(m.id));
    const platformMenus = allMenus.filter((m) => PLATFORM_MENU_IDS.includes(m.id));

    console.log(`   Found ${allMenus.length} menus (${platformMenus.length} platform, ${nonPlatformMenus.length} non-platform)`);

    // Setup visibility for platform organization roles
    const platformRoles = await db
        .select({ id: roles.id, slug: roles.slug })
        .from(roles)
        .where(eq(roles.organizationId, PLATFORM_ORG_ID));

    for (const role of platformRoles) {
        if (role.slug === 'admin' || role.slug === 'owner') {
            // Platform owner/admin sees ALL menus
            await db.delete(roleMenuVisibility).where(eq(roleMenuVisibility.roleId, role.id));
            for (const menu of allMenus) {
                await db.insert(roleMenuVisibility).values({
                    roleId: role.id,
                    menuId: menu.id,
                    organizationId: null, // Global visibility
                    visible: true,
                });
            }
            console.log(`   ✅ ${role.slug}: ${allMenus.length} menus visible`);
        }
    }

    // Setup visibility for default organization roles
    const defaultOrgRoles = await db
        .select({ id: roles.id, slug: roles.slug })
        .from(roles)
        .where(eq(roles.organizationId, DEFAULT_ORG_ID));

    for (const role of defaultOrgRoles) {
        let visibleMenus: typeof allMenus;

        if (role.slug === 'owner' || role.slug === 'admin') {
            // Owner and admin see all non-platform menus
            visibleMenus = nonPlatformMenus;
        } else if (role.slug === 'member') {
            // Member sees basic menus only
            visibleMenus = nonPlatformMenus.filter((m) =>
                ['core:dashboard', 'core:notifications', 'core:invitations'].includes(m.id)
            );
        } else {
            // Other roles see nothing by default
            visibleMenus = [];
        }

        // Clear existing visibility for this role
        await db.delete(roleMenuVisibility).where(eq(roleMenuVisibility.roleId, role.id));

        // Insert new visibility records
        for (const menu of visibleMenus) {
            await db.insert(roleMenuVisibility).values({
                roleId: role.id,
                menuId: menu.id,
                organizationId: null, // Global scope
                visible: true,
            });
        }

        console.log(`   ✅ ${role.slug}: ${visibleMenus.length} menus visible`);
    }
}

async function printSummary(): Promise<void> {
    console.log('\n[5/5] Summary');
    console.log('='.repeat(70));
    console.log('\n📋 Test Accounts Created:\n');
    console.log('   | Role            | Email                    | Password     | Organizations      |');
    console.log('   |-----------------|--------------------------|--------------|-------------------|');
    console.log('   | Platform Admin  | admin@wordrhyme.test     | Test123456   | platform, default |');
    console.log('   | Tenant Owner    | owner@wordrhyme.test     | Test123456   | default           |');
    console.log('   | Tenant Member   | member@wordrhyme.test    | Test123456   | default           |');
    console.log('\n📌 Architecture:');
    console.log('   - "platform" org: System organization for platform administrators');
    console.log('   - "default" org: Default tenant organization');
    console.log('   - Platform admins/owners are members of "platform" org with role = admin/owner');
    console.log('   - No special code checks - unified role query from both current org and platform org');
    console.log('\n📌 How to add a new Platform Admin:');
    console.log('   1. Create user account');
    console.log('   2. Add membership to "platform" org with role = "admin" or "owner"');
    console.log('   3. Done! The user will see all platform menus automatically');
    console.log('\n' + '='.repeat(70));
}

async function main(): Promise<void> {
    console.log('🚀 Seeding System Accounts...');
    console.log('='.repeat(70));

    try {
        await createPlatformOrganization();
        await createDefaultOrganization();
        await createAccounts();
        await setupMenuVisibility();
        await printSummary();

        console.log('\n✅ Seed completed successfully!\n');
    } catch (error) {
        console.error('\n❌ Seed failed:', error);
        process.exit(1);
    }

    process.exit(0);
}

main();
