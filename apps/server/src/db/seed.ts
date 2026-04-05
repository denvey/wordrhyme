/**
 * Standalone Seed Script
 * 
 * Run directly with: pnpm db:seed
 * Loads .env and creates database connection independently.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { drizzle } from 'drizzle-orm/postgres-js';

// Load .env from project root first
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../.env') });

// Import schema tables (these don't depend on env.ts)
import { permissions, menus } from './schema';

// Create database connection (pass URL string directly to drizzle)
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
}

const db = drizzle(databaseUrl);

/**
 * Core Permissions
 */
const CORE_PERMISSIONS = [
    { capability: 'organization:read:instance', source: 'core', description: '查看组织信息' },
    { capability: 'organization:create:instance', source: 'core', description: '创建组织' },
    { capability: 'organization:update:organization', source: 'core', description: '修改组织设置' },
    { capability: 'organization:delete:organization', source: 'core', description: '删除组织' },
    { capability: 'user:read:organization', source: 'core', description: '查看组织成员' },
    { capability: 'user:invite:organization', source: 'core', description: '邀请成员' },
    { capability: 'user:manage:organization', source: 'core', description: '管理成员角色' },
    { capability: 'user:remove:organization', source: 'core', description: '移除成员' },
    { capability: 'content:read:public', source: 'core', description: '查看公开内容' },
    { capability: 'content:read:space', source: 'core', description: '查看空间内容' },
    { capability: 'content:create:space', source: 'core', description: '创建内容' },
    { capability: 'content:update:own', source: 'core', description: '修改自己的内容' },
    { capability: 'content:update:space', source: 'core', description: '修改空间内容' },
    { capability: 'content:delete:own', source: 'core', description: '删除自己的内容' },
    { capability: 'content:delete:space', source: 'core', description: '删除空间内容' },
    { capability: 'content:publish:space', source: 'core', description: '发布内容' },
    { capability: 'plugin:read:organization', source: 'core', description: '查看插件列表' },
    { capability: 'plugin:install:organization', source: 'core', description: '安装插件' },
    { capability: 'plugin:enable:organization', source: 'core', description: '启用插件' },
    { capability: 'plugin:disable:organization', source: 'core', description: '停用插件' },
    { capability: 'plugin:uninstall:organization', source: 'core', description: '卸载插件' },
    { capability: 'plugin:configure:organization', source: 'core', description: '配置插件' },
];

/**
 * Core Menus - from code definitions (RESOURCE_DEFINITIONS)
 */
import { generateCoreMenus } from './seeds/menus.seed';
import { seedGeoReferenceData } from './seed/seed-geo';

async function seed() {
    console.log('🌱 Seeding core permissions...');
    for (const perm of CORE_PERMISSIONS) {
        await db.insert(permissions).values(perm).onConflictDoNothing();
    }
    console.log(`✅ Seeded ${CORE_PERMISSIONS.length} core permissions`);

    console.log('🌱 Seeding core menus...');
    const coreMenus = generateCoreMenus();

    // Delete existing core system menus first (NULL organizationId breaks ON CONFLICT)
    const { eq, and } = await import('drizzle-orm');
    await db.delete(menus).where(and(
        eq(menus.type, 'system'),
        eq(menus.source, 'core')
    ));

    for (const def of coreMenus) {
        await db.insert(menus).values({
            code: def.code,
            type: def.type,
            source: def.source,
            organizationId: def.organizationId,
            label: def.label,
            icon: def.icon ?? null,
            path: def.path ?? null,
            openMode: 'route',
            parentCode: def.parentCode ?? null,
            order: def.order ?? 0,
            visible: true,
            requiredPermission: def.requiredPermission ?? null,
            target: def.target,
        });
    }
    console.log(`✅ Seeded ${coreMenus.length} core menus`);

    console.log('🌱 Seeding geo reference data...');
    await seedGeoReferenceData(db as any);
    console.log('✅ Seeded geo reference data');

    console.log('✅ Seed completed');
    process.exit(0);
}

seed().catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
});
