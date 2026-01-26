/**
 * Set User as Global Admin
 *
 * Updates a user's role to 'admin' (global administrator).
 * Run: tsx src/db/seed/set-admin.ts admin@example.com
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

async function setPlatformAdmin() {
    const email = process.argv[2];

    if (!email) {
        console.error('❌ Usage: tsx set-admin.ts <email>');
        console.error('   Example: tsx set-admin.ts admin@example.com');
        process.exit(1);
    }

    console.log(`🔧 Setting ${email} as global admin...\n`);

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);

    try {
        // Update user role to 'admin' (global administrator)
        const result = await client`
            UPDATE "user"
            SET role = 'admin'
            WHERE email = ${email}
            RETURNING id, email, name, role
        `;

        if (result.length === 0) {
            console.log(`❌ User not found: ${email}`);
            process.exit(1);
        }

        const user = result[0];
        console.log('✅ User updated successfully!');
        console.log('='.repeat(50));
        console.log(`Email: ${user.email}`);
        console.log(`Name: ${user.name || 'N/A'}`);
        console.log(`Role: ${user.role}`);
        console.log('='.repeat(50));
        console.log('\n🎉 User is now a global admin!');
        console.log('   Switch to Platform organization to access cross-tenant features.');
        console.log('   Please log out and log in again to see all menus.');

    } catch (error) {
        console.error('❌ Update failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

setPlatformAdmin();
