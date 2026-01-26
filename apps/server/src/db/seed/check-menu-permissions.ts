/**
 * Check Menu Required Permissions
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

async function checkMenuPermissions() {
    console.log('🔍 Checking menu requiredPermission values...\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);

    try {
        // Get all admin menus
        const menus = await client`
            SELECT
                id,
                label,
                path,
                required_permission,
                target,
                organization_id
            FROM menus
            WHERE target = 'admin'
            ORDER BY "order", label
        `;

        console.log('📋 Admin Menus:');
        console.log('='.repeat(80));
        menus.forEach(m => {
            console.log(`${m.label.padEnd(20)} | ${(m.required_permission || 'null').padEnd(30)} | ${m.path}`);
        });
        console.log('='.repeat(80));

        console.log('\n🔍 Analysis:');
        const withPermissions = menus.filter(m => m.required_permission);
        console.log(`Menus with permissions: ${withPermissions.length}`);
        console.log(`Menus without permissions: ${menus.length - withPermissions.length}`);

        if (withPermissions.length > 0) {
            console.log('\n📝 Permission formats found:');
            const formats = new Set(withPermissions.map(m => {
                const perm = m.required_permission;
                const parts = perm.split(':');
                return `${parts.length} parts: "${perm}"`;
            }));
            formats.forEach(f => console.log(`  - ${f}`));
        }

        // Test parsing one permission
        if (withPermissions.length > 0) {
            const testPerm = withPermissions[0].required_permission;
            console.log(`\n🧪 Test parsing: "${testPerm}"`);
            const parts = testPerm.split(':');
            console.log(`  Parts: [${parts.map(p => `"${p}"`).join(', ')}]`);

            if (parts.length === 2) {
                console.log(`  ⚠️  Format appears to be: "{action}:{subject}"`);
                console.log(`  Expected legacy format: "{resource}:{action}:{scope}"`);
                console.log(`  Or CASL format should be checked as: can("${parts[0]}", "${parts[1]}")`);
            } else if (parts.length === 3) {
                console.log(`  Format: "{resource}:{action}:{scope}"`);
                console.log(`  Will be parsed as: resource="${parts[0]}", action="${parts[1]}", scope="${parts[2]}"`);
            }
        }

    } catch (error) {
        console.error('❌ Check failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

checkMenuPermissions();
