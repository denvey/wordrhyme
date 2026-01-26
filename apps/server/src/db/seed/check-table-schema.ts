/**
 * Check Member Table Schema
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

async function checkTableSchema() {
    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);

    try {
        // Query member table structure
        const columns = await client`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'member'
            ORDER BY ordinal_position
        `;

        console.log('📋 Member table columns:');
        console.log('='.repeat(60));
        columns.forEach(c => {
            console.log(`  - ${c.column_name} (${c.data_type})`);
        });
        console.log('='.repeat(60));

        // Also check if there's a roles table
        const rolesColumns = await client`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'roles'
            ORDER BY ordinal_position
        `;

        console.log('\n📋 Roles table columns:');
        console.log('='.repeat(60));
        rolesColumns.forEach(c => {
            console.log(`  - ${c.column_name} (${c.data_type})`);
        });
        console.log('='.repeat(60));

        // Sample member data
        const members = await client`
            SELECT * FROM member LIMIT 3
        `;

        console.log('\n📊 Sample member records:');
        console.log('='.repeat(60));
        console.log(JSON.stringify(members, null, 2));

    } catch (error) {
        console.error('❌ Check failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

checkTableSchema();
