/**
 * 迁移脚本：将 platform-admin 角色更新为 admin
 *
 * 这个脚本会：
 * 1. 将所有 user.role = 'platform-admin' 更新为 'admin'
 * 2. 显示受影响的用户
 *
 * 运行: pnpm tsx apps/server/scripts/migrate/migrate-platform-admin-to-admin.ts
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env') });

async function migratePlatformAdmin() {
    console.log('\n=== Migrating platform-admin to admin ===\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);

    try {
        // 1. 查找所有 platform-admin 用户
        const platformAdmins = await client`
            SELECT id, email, name, role
            FROM "user"
            WHERE role = 'platform-admin'
        `;

        if (platformAdmins.length === 0) {
            console.log('✅ No users with platform-admin role found. Migration not needed.');
            process.exit(0);
        }

        console.log(`Found ${platformAdmins.length} user(s) with platform-admin role:\n`);
        platformAdmins.forEach((user: any) => {
            console.log(`  - ${user.email} (${user.name || 'N/A'})`);
        });

        console.log('\n🔄 Updating roles to "admin"...\n');

        // 2. 更新所有 platform-admin 为 admin
        const result = await client`
            UPDATE "user"
            SET role = 'admin'
            WHERE role = 'platform-admin'
            RETURNING id, email, name, role
        `;

        console.log(`✅ Successfully updated ${result.length} user(s):\n`);
        result.forEach((user: any) => {
            console.log(`  - ${user.email} → role: ${user.role}`);
        });

        console.log('\n=== Migration Complete ===\n');
        console.log('All platform-admin users have been migrated to admin role.');
        console.log('Users should log out and log in again to see the changes.');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

migratePlatformAdmin();
