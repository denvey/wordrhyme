/**
 * Reset User Role to 'user'
 *
 * Resets a user's role back to 'user'.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

async function resetUserRole() {
    const email = process.argv[2] || 'admin@example.com';

    console.log(`🔧 Resetting ${email} role to 'user'...\n`);

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);

    try {
        const result = await client`
            UPDATE "user"
            SET role = 'user'
            WHERE email = ${email}
            RETURNING email, role
        `;

        if (result.length === 0) {
            console.log(`❌ User not found: ${email}`);
            process.exit(1);
        }

        console.log('✅ User role reset successfully!');
        console.log(`   Email: ${result[0].email}`);
        console.log(`   Role: ${result[0].role}`);

    } catch (error) {
        console.error('❌ Reset failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

resetUserRole();
