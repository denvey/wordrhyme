/**
 * Update Menu Permissions Script
 *
 * Updates requiredPermission for Members and Roles menus:
 * - Members menu: User:read → Member:read
 * - Roles menu: Use Role:read
 *
 * Run: pnpm --filter @wordrhyme/server seed:menu-permissions
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, or, like } from 'drizzle-orm';

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

// Import schemas
import { menus } from '../schema/definitions';

async function updateMenuPermissions() {
    console.log('🔧 Updating menu requiredPermission fields...\n');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }

    const client = postgres(databaseUrl);
    const db = drizzle(client);

    try {
        // Update Members menu: User:read → Member:read
        const membersResult = await db
            .update(menus)
            .set({ requiredPermission: 'Member:read' })
            .where(or(
                like(menus.code, '%members%'),
                like(menus.path, '%/members%')
            ))
            .returning();

        console.log(`✓ Updated ${membersResult.length} Members menu(s) to Member:read`);
        for (const menu of membersResult) {
            console.log(`  - ${menu.code}: ${menu.label} → Member:read`);
        }

        // Update Roles menu: → Role:read
        const rolesResult = await db
            .update(menus)
            .set({ requiredPermission: 'Role:read' })
            .where(or(
                like(menus.code, '%roles%'),
                like(menus.path, '%/roles%')
            ))
            .returning();

        console.log(`\n✓ Updated ${rolesResult.length} Roles menu(s) to Role:read`);
        for (const menu of rolesResult) {
            console.log(`  - ${menu.code}: ${menu.label} → Role:read`);
        }

        console.log('\n' + '='.repeat(50));
        console.log('🎉 Menu permissions updated!');
        console.log(`   Total updated: ${membersResult.length + rolesResult.length} menus`);
        console.log('='.repeat(50));

    } catch (error) {
        console.error('❌ Update failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

updateMenuPermissions();
