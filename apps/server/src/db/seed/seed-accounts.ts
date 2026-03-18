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
import { roles, rolePermissions } from '../schema/definitions';
import { settings } from '@wordrhyme/db';
import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { hashPassword } from 'better-auth/crypto';
import { seedDefaultRoles } from './seed-roles';
import { seedOrganizationCurrencies } from './seed-currencies';

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

// Hash password using Better Auth's own hashPassword (scrypt-based)
// This ensures compatibility with Better Auth's verifyPassword

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

        let roleId: string;

        if (existingRole.length === 0) {
            const [role] = await db.insert(roles).values({
                organizationId: PLATFORM_ORG_ID,
                name: roleDef.name,
                slug: roleDef.slug,
                description: roleDef.description,
                isSystem: true,
            }).returning();

            roleId = role!.id;
            console.log(`   ✅ Created ${roleDef.slug} role`);
        } else {
            roleId = existingRole[0]!.id;
            console.log(`   ✅ Platform-${roleDef.slug} role already exists`);
        }

        // Always ensure 'manage all' permission exists (idempotent)
        await db.insert(rolePermissions).values({
            roleId,
            action: 'manage',
            subject: 'all',
            fields: null,
            conditions: null,
            inverted: false,
        }).onConflictDoNothing();
    }

    // Seed currencies for platform organization
    console.log('   🔄 Seeding platform currencies...');
    await seedOrganizationCurrencies(db, PLATFORM_ORG_ID, 'system');
    console.log('   ✅ Platform currencies seeded');
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

    // Seed currencies for default organization
    console.log('   🔄 Seeding currencies...');
    await seedOrganizationCurrencies(db, DEFAULT_ORG_ID, 'system');
    console.log('   ✅ Currencies seeded');
}

async function createAccounts(): Promise<void> {
    console.log('\n[3/5] Creating user accounts...');

    const hashedPassword = await hashPassword(TEST_PASSWORD);

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

async function seedCurrencyPolicy(): Promise<void> {
    console.log('\n[5/6] Seeding currency tenant policy...');

    const CURRENCY_POLICY_KEY = 'core.currency.policy';

    // Check if policy already exists
    const existing = await db
        .select()
        .from(settings)
        .where(and(eq(settings.scope, 'global'), eq(settings.key, CURRENCY_POLICY_KEY)))
        .limit(1);

    if (existing.length > 0) {
        console.log('   ✅ Currency policy already exists');
        return;
    }

    await db.insert(settings).values({
        scope: 'global',
        scopeId: null,
        organizationId: null,
        key: CURRENCY_POLICY_KEY,
        value: { mode: 'unified' },
        valueType: 'json',
        description: 'Currency tenant policy mode',
        createdBy: 'system',
        updatedBy: 'system',
    });
    console.log('   ✅ Currency policy initialized: { mode: "unified" }');
}

async function printSummary(): Promise<void> {
    console.log('\n[4/4] Summary');
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
        await seedCurrencyPolicy();
        await printSummary();

        console.log('\n✅ Seed completed successfully!\n');
    } catch (error) {
        console.error('\n❌ Seed failed:', error);
        process.exit(1);
    }

    process.exit(0);
}

main();
