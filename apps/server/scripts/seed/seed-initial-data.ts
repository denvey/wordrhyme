/**
 * 初始化数据脚本
 *
 * 功能：
 * 1. 创建 Platform 组织
 * 2. 创建系统管理员用户（使用 Better Auth API）
 * 3. 配置 Platform 组织的角色和权限
 * 4. 配置跨租户权限
 *
 * 运行：pnpm --filter @wordrhyme/server script:seed-initial
 */
import { db } from '../../src/db/client.js';
import { organization, user, member } from '../../src/db/schema/auth-schema.js';
import { roles, rolePermissions } from '../../src/db/schema/definitions.js';
import { menus } from '../../src/db/schema/menus.js';
import { eq, and } from 'drizzle-orm';
import { auth } from '../../src/auth/auth.js';

async function seedInitialData() {
    console.log('\n=== 初始化系统数据 ===\n');

    try {
        // ========================================
        // 1. 创建 Platform 组织
        // ========================================
        console.log('📦 创建 Platform 组织...');

        const existingPlatformOrg = await db
            .select()
            .from(organization)
            .where(eq(organization.id, 'platform'))
            .limit(1);

        let platformOrgId: string;

        if (existingPlatformOrg.length === 0) {
            const newOrg = await db.insert(organization).values({
                id: 'platform',
                name: 'Platform',
                slug: 'platform',
                logo: null,
                metadata: null,
                createdAt: new Date(),
            }).returning();
            platformOrgId = newOrg[0]!.id;
            console.log('  ✓ Platform 组织已创建');
        } else {
            platformOrgId = existingPlatformOrg[0]!.id;
            console.log('  ⊙ Platform 组织已存在');
        }

        // ========================================
        // 2. 创建系统管理员用户
        // ========================================
        console.log('\n👤 创建系统管理员...');

        const adminEmail = process.env['ADMIN_EMAIL'] || 'admin@example.com';
        const adminPassword = process.env['ADMIN_PASSWORD'] || 'Admin123456!';
        const adminName = process.env['ADMIN_NAME'] || 'System Administrator';

        const existingAdmin = await db
            .select()
            .from(user)
            .where(eq(user.email, adminEmail))
            .limit(1);

        let adminUserId: string;

        if (existingAdmin.length === 0) {
            // 使用 Better Auth API 创建用户（不需要 HTTP 请求）
            console.log('  使用 Better Auth API 创建用户...');
            const result = await auth.api.createUser({
                body: {
                    name: adminName,
                    email: adminEmail,
                    password: adminPassword,
                    role: 'owner', // 设置为 owner 角色
                },
            });

            if (result && typeof result === 'object' && 'user' in result) {
                adminUserId = (result as { user: { id: string } }).user.id;
                console.log(`  ✓ 管理员已创建: ${adminEmail}`);
                console.log(`  ℹ 密码: ${adminPassword}`);
            } else {
                throw new Error('创建用户失败：返回格式不正确');
            }
        } else {
            adminUserId = existingAdmin[0]!.id;
            console.log(`  ⊙ 管理员已存在: ${adminEmail}`);
        }

        // ========================================
        // 3. 将管理员添加到 Platform 组织
        // ========================================
        console.log('\n🔗 配置管理员组织关系...');

        const existingMembership = await db
            .select()
            .from(member)
            .where(and(
                eq(member.userId, adminUserId),
                eq(member.organizationId, platformOrgId)
            ))
            .limit(1);

        if (existingMembership.length === 0) {
            await db.insert(member).values({
                id: crypto.randomUUID(),
                organizationId: platformOrgId,
                userId: adminUserId,
                role: 'owner', // Platform 组织的 owner
                createdAt: new Date(),
            });
            console.log('  ✓ 管理员已添加到 Platform 组织 (owner)');
        } else {
            console.log('  ⊙ 管理员已在 Platform 组织中');
        }

        // ========================================
        // 4. 创建 Platform 组织的角色
        // ========================================
        console.log('\n🎭 创建 Platform 组织角色...');

        const platformRoles = [
            {
                slug: 'owner',
                name: 'Owner',
                description: 'Platform organization owner with full access',
                isSystem: true,
            },
            {
                slug: 'admin',
                name: 'Administrator',
                description: 'Platform organization administrator',
                isSystem: true,
            },
            {
                slug: 'member',
                name: 'Member',
                description: 'Platform organization member',
                isSystem: true,
            },
        ];

        const createdRoles: Record<string, string> = {};

        for (const roleData of platformRoles) {
            const existingRole = await db
                .select()
                .from(roles)
                .where(and(
                    eq(roles.slug, roleData.slug),
                    eq(roles.organizationId, platformOrgId)
                ))
                .limit(1);

            if (existingRole.length === 0) {
                const newRole = await db.insert(roles).values({
                    organizationId: platformOrgId,
                    slug: roleData.slug,
                    name: roleData.name,
                    description: roleData.description,
                    isSystem: roleData.isSystem,
                }).returning();
                createdRoles[roleData.slug] = newRole[0]!.id;
                console.log(`  ✓ 创建角色: ${roleData.slug}`);
            } else {
                createdRoles[roleData.slug] = existingRole[0]!.id;
                console.log(`  ⊙ 角色已存在: ${roleData.slug}`);
            }
        }

        // ========================================
        // 5. 配置角色权限
        // ========================================
        console.log('\n🔐 配置角色权限...');

        // Owner 和 Admin 角色的权限
        const adminPermissions = [
            // 跨租户能力
            { action: 'manage', subject: 'cross-tenant' },

            // 用户管理
            { action: 'read', subject: 'User' },
            { action: 'create', subject: 'User' },
            { action: 'update', subject: 'User' },
            { action: 'delete', subject: 'User' },

            // 组织管理
            { action: 'read', subject: 'Organization' },
            { action: 'create', subject: 'Organization' },
            { action: 'update', subject: 'Organization' },
            { action: 'delete', subject: 'Organization' },

            // 角色管理
            { action: 'read', subject: 'Role' },
            { action: 'create', subject: 'Role' },
            { action: 'update', subject: 'Role' },
            { action: 'delete', subject: 'Role' },

            // 权限管理
            { action: 'read', subject: 'Permission' },
            { action: 'create', subject: 'Permission' },
            { action: 'update', subject: 'Permission' },
            { action: 'delete', subject: 'Permission' },

            // 审计日志
            { action: 'read', subject: 'AuditLog' },

            // 插件管理
            { action: 'manage', subject: 'Plugin' },

            // 菜单管理
            { action: 'manage', subject: 'Menu' },
        ];

        // 为 owner 和 admin 角色配置权限
        for (const roleSlug of ['owner', 'admin']) {
            const roleId = createdRoles[roleSlug];
            if (!roleId) continue;

            for (const perm of adminPermissions) {
                const existing = await db
                    .select()
                    .from(rolePermissions)
                    .where(and(
                        eq(rolePermissions.roleId, roleId),
                        eq(rolePermissions.action, perm.action),
                        eq(rolePermissions.subject, perm.subject)
                    ))
                    .limit(1);

                if (existing.length === 0) {
                    await db.insert(rolePermissions).values({
                        roleId,
                        action: perm.action,
                        subject: perm.subject,
                        source: 'core',
                    });
                }
            }
            console.log(`  ✓ 配置 ${roleSlug} 角色权限`);
        }

        // Member 角色的权限（只读）
        const memberPermissions = [
            { action: 'read', subject: 'User' },
            { action: 'read', subject: 'Organization' },
            { action: 'read', subject: 'AuditLog' },
        ];

        const memberRoleId = createdRoles['member'];
        if (memberRoleId) {
            for (const perm of memberPermissions) {
                const existing = await db
                    .select()
                    .from(rolePermissions)
                    .where(and(
                        eq(rolePermissions.roleId, memberRoleId),
                        eq(rolePermissions.action, perm.action),
                        eq(rolePermissions.subject, perm.subject)
                    ))
                    .limit(1);

                if (existing.length === 0) {
                    await db.insert(rolePermissions).values({
                        roleId: memberRoleId,
                        action: perm.action,
                        subject: perm.subject,
                        source: 'core',
                    });
                }
            }
            console.log('  ✓ 配置 member 角色权限');
        }

        // ========================================
        // 完成
        // ========================================
        // 6. 初始化 Platform 组织菜单
        // ========================================
        console.log('\n🍽️  初始化 Platform 组织菜单...');

        const platformMenus = [
            {
                source: 'core',
                organizationId: platformOrgId,
                label: '仪表盘',
                icon: 'LayoutDashboard',
                path: '/dashboard',
                order: 0,
                target: 'admin' as const,
                requiredPermission: null,
            },
            {
                source: 'core',
                organizationId: platformOrgId,
                label: '用户管理',
                icon: 'Users',
                path: '/users',
                order: 10,
                target: 'admin' as const,
                requiredPermission: 'read:User',
            },
            {
                source: 'core',
                organizationId: platformOrgId,
                label: '组织管理',
                icon: 'Building',
                path: '/organizations',
                order: 20,
                target: 'admin' as const,
                requiredPermission: 'read:Organization',
            },
            {
                source: 'core',
                organizationId: platformOrgId,
                label: '角色权限',
                icon: 'Shield',
                path: '/roles',
                order: 30,
                target: 'admin' as const,
                requiredPermission: 'read:Role',
            },
            {
                source: 'core',
                organizationId: platformOrgId,
                label: '审计日志',
                icon: 'FileText',
                path: '/audit',
                order: 40,
                target: 'admin' as const,
                requiredPermission: 'read:AuditLog',
            },
            {
                source: 'core',
                organizationId: platformOrgId,
                label: '系统设置',
                icon: 'Settings',
                path: '/settings',
                order: 50,
                target: 'admin' as const,
                requiredPermission: null,
            },
        ];

        for (const menu of platformMenus) {
            // 检查是否已存在
            const existingMenu = await db.execute(`
                SELECT id FROM menus
                WHERE organization_id = '${menu.organizationId}'
                AND path = '${menu.path}'
            `);

            if (existingMenu.length === 0) {
                await db.insert(menus).values(menu);
                console.log(`  ✓ 创建菜单: ${menu.label}`);
            } else {
                console.log(`  ⊙ 菜单已存在: ${menu.label}`);
            }
        }

        // ========================================
        console.log('\n=== 初始化完成 ===\n');
        console.log('✅ 系统已初始化！');
        console.log('');
        console.log('管理员账号:');
        console.log(`  邮箱: ${adminEmail}`);
        console.log(`  密码: ${adminPassword}`);
        console.log('');
        console.log('下一步:');
        console.log('  1. 启动应用: npm run dev');
        console.log('  2. 使用管理员账号登录');
        console.log('  3. 切换到 Platform 组织以使用跨租户功能');
        console.log('');

    } catch (error) {
        console.error('\n❌ 初始化失败:', error);
        process.exit(1);
    }
}

seedInitialData();
