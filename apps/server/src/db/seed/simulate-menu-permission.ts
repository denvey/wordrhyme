/**
 * End-to-End Menu Permission Check Simulation
 *
 * This script simulates the exact flow that happens when filtering menus:
 * 1. Get user's roles from member table
 * 2. Load CASL rules from database
 * 3. Create CASL ability
 * 4. Check permissions for each menu
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';
import { createMongoAbility, RawRuleOf, MongoAbility } from '@casl/ability';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

type AppActions = 'manage' | 'create' | 'read' | 'update' | 'delete' | string;
type AppSubjects = 'all' | string;
type AppAbility = MongoAbility<[AppActions, AppSubjects]>;

// Capability parser (simplified from capability-parser.ts)
function parseCapability(capability: string) {
    const RESOURCE_TO_SUBJECT: Record<string, string> = {
        content: 'Content',
        user: 'User',
        organization: 'Organization',
        team: 'Team',
        menu: 'Menu',
        plugin: 'Plugin',
        role: 'Role',
        permission: 'Permission',
        audit: 'AuditLog',
        core: 'Core',
    };

    const parts = capability.split(':');

    if (parts.length < 2) {
        return { action: 'manage', subject: capability };
    }

    if (capability === '*:*:*') {
        return { action: 'manage', subject: 'all' };
    }

    // Standard format: resource:action:scope
    const resource = parts[0]!;
    const action = parts[1]!;

    const subject = RESOURCE_TO_SUBJECT[resource.toLowerCase()]
        ?? (resource.charAt(0).toUpperCase() + resource.slice(1));

    return { action, subject };
}

async function simulateMenuPermissionCheck() {
    console.log('🔬 END-TO-END MENU PERMISSION CHECK SIMULATION\n');
    console.log('='.repeat(80));

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);

    try {
        const userId = 'dUgWeEmeC6xEM3eN6SGdCW4Tybvmzrul'; // admin@example.com

        // Step 1: Get user's membership and roles
        console.log('\n📋 STEP 1: Get user membership');
        console.log('-'.repeat(80));

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

        if (memberships.length === 0) {
            console.log('❌ User has no organization memberships!');
            process.exit(1);
        }

        const membership = memberships[0];
        console.log(`User ID: ${userId}`);
        console.log(`Organization: ${membership.org_name} (${membership.organization_id})`);
        console.log(`Member Role: ${membership.member_role}`);

        const orgId = membership.organization_id;
        const roleNames = [membership.member_role];

        // Step 2: Load CASL rules from database
        console.log('\n📋 STEP 2: Load CASL rules from database');
        console.log('-'.repeat(80));

        // Find roles matching slug
        const roleRecords = await client`
            SELECT id, name, slug
            FROM roles
            WHERE slug = ANY(${roleNames})
            AND organization_id = ${orgId}
        `;

        console.log(`Looking for roles with slugs: [${roleNames.join(', ')}] in org ${orgId}`);
        console.log(`Found ${roleRecords.length} matching roles:`);
        roleRecords.forEach(r => {
            console.log(`  - ${r.name} (${r.slug}) - ID: ${r.id}`);
        });

        if (roleRecords.length === 0) {
            console.log('\n❌ PROBLEM FOUND: No roles match the user\'s member.role!');
            console.log('   This means the user has NO permissions.');

            // Check what roles exist
            const allRoles = await client`
                SELECT id, name, slug, organization_id
                FROM roles
                WHERE organization_id = ${orgId}
            `;
            console.log(`\n   Available roles in this organization:`);
            allRoles.forEach(r => {
                console.log(`   - ${r.slug}: ${r.name}`);
            });

            process.exit(1);
        }

        const roleIds = roleRecords.map(r => r.id);

        // Load permissions for these roles
        const permissions = await client`
            SELECT
                action,
                subject,
                fields,
                conditions,
                inverted
            FROM role_permissions
            WHERE role_id = ANY(${roleIds})
        `;

        console.log(`\nLoaded ${permissions.length} permission rules:`);
        permissions.forEach(p => {
            console.log(`  - ${p.action} ${p.subject}${p.inverted ? ' (inverted)' : ''}`);
        });

        // Step 3: Create CASL ability
        console.log('\n📋 STEP 3: Create CASL ability');
        console.log('-'.repeat(80));

        const rawRules: RawRuleOf<AppAbility>[] = permissions.map(p => ({
            action: p.action,
            subject: p.subject,
            fields: p.fields || undefined,
            conditions: p.conditions || undefined,
            inverted: p.inverted || false,
        }));

        console.log('Raw rules for CASL:', JSON.stringify(rawRules, null, 2));

        const ability = createMongoAbility<[AppActions, AppSubjects]>(rawRules, {
            resolveAction(action: string) {
                return action === 'manage'
                    ? ['manage', 'create', 'read', 'update', 'delete']
                    : action;
            },
        });

        console.log('✅ CASL ability created successfully');

        // Step 4: Get menus and check permissions
        console.log('\n📋 STEP 4: Check menu permissions');
        console.log('-'.repeat(80));

        const menus = await client`
            SELECT
                id,
                label,
                path,
                required_permission,
                target
            FROM menus
            WHERE target = 'admin'
            AND organization_id = ${orgId}
            ORDER BY "order", label
        `;

        console.log(`Found ${menus.length} admin menus to check:\n`);

        const results: { label: string; visible: boolean; reason: string }[] = [];

        for (const menu of menus) {
            const perm = menu.required_permission;
            let visible = false;
            let reason = '';

            if (!perm) {
                visible = true;
                reason = 'No permission required';
            } else if (perm === 'admin') {
                visible = false;
                reason = 'Requires admin role';
            } else {
                // Parse capability
                const parsed = parseCapability(perm);
                console.log(`  Menu: "${menu.label}"`);
                console.log(`    requiredPermission: "${perm}"`);
                console.log(`    Parsed: action="${parsed.action}", subject="${parsed.subject}"`);

                // Check with CASL
                const canAccess = ability.can(parsed.action, parsed.subject);
                console.log(`    ability.can("${parsed.action}", "${parsed.subject}") = ${canAccess}`);

                visible = canAccess;
                reason = canAccess
                    ? `Passed: ${parsed.action} ${parsed.subject}`
                    : `Denied: ${parsed.action} ${parsed.subject}`;

                console.log(`    Result: ${visible ? '✅ VISIBLE' : '❌ HIDDEN'}\n`);
            }

            results.push({ label: menu.label, visible, reason });
        }

        // Summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 SUMMARY');
        console.log('='.repeat(80));

        console.log('\n✅ Visible menus:');
        results.filter(r => r.visible).forEach(r => {
            console.log(`  - ${r.label}: ${r.reason}`);
        });

        console.log('\n❌ Hidden menus:');
        results.filter(r => !r.visible).forEach(r => {
            console.log(`  - ${r.label}: ${r.reason}`);
        });

        console.log('\n' + '='.repeat(80));

    } catch (error) {
        console.error('❌ Simulation failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

simulateMenuPermissionCheck();
