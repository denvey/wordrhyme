/**
 * Check Role Permissions Detail
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

async function checkRolePermissionsDetail() {
    console.log('🔍 Checking role_permissions table structure...\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);

    try {
        // First check table structure
        const columns = await client`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'role_permissions'
            ORDER BY ordinal_position
        `;

        console.log('📋 role_permissions table columns:');
        console.log('='.repeat(60));
        columns.forEach(c => {
            console.log(`  - ${c.column_name} (${c.data_type})`);
        });
        console.log('='.repeat(60));

        const roleId = '7ecbd0d5-1100-42e6-b3e9-a5718e633098'; // Owner role ID

        // Get detailed permission records (only existing columns)
        const permissions = await client`
            SELECT *
            FROM role_permissions
            WHERE role_id = ${roleId}
        `;

        console.log('📋 Role Permissions Detail:');
        console.log('='.repeat(60));
        console.log(JSON.stringify(permissions, null, 2));
        console.log('='.repeat(60));

        console.log('\n🔍 Analysis:');
        permissions.forEach((p, index) => {
            console.log(`\nPermission ${index + 1}:`);
            console.log(`  action: "${p.action}" (type: ${typeof p.action})`);
            console.log(`  subject: "${p.subject}" (type: ${typeof p.subject})`);
            console.log(`  fields: ${p.fields}`);
            console.log(`  conditions: ${p.conditions}`);
            console.log(`  inverted: ${p.inverted}`);

            // Check if this is a valid CASL rule
            if (p.subject === 'all') {
                console.log('  ⚠️  subject="all" - This should grant permission to ALL subjects');
            }
            if (p.action === 'manage') {
                console.log('  ⚠️  action="manage" - This should grant ALL actions (if resolveAction is configured)');
            }
        });

    } catch (error) {
        console.error('❌ Check failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

checkRolePermissionsDetail();
