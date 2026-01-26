/**
 * 配置跨租户权限
 *
 * 新的权限组合模式：
 * 1. 配置 'cross-tenant' 权限（跨租户能力）
 * 2. 配置资源权限（如 'read:User', 'read:Order'）
 * 3. 两者组合使用：cross-tenant + read:Order = 跨租户读取订单
 *
 * 优点：
 * - 添加新资源时不需要添加新的跨租户权限
 * - 灵活组合：可以只给某些资源跨租户权限
 * - 清晰分离：跨租户能力 vs 资源访问权限
 */
import { db } from '../../src/db/client.js';
import { roles, rolePermissions } from '../../src/db/schema/definitions.js';
import { eq, and } from 'drizzle-orm';

async function setupCrossTenantPermissions() {
    console.log('\n=== Setting up Cross-Tenant Permissions (Composition Model) ===\n');

    const platformOrgId = 'platform';

    // 1. 查找 Platform 组织的 admin 角色
    const adminRole = await db.select()
        .from(roles)
        .where(and(
            eq(roles.slug, 'admin'),
            eq(roles.organizationId, platformOrgId)
        ))
        .limit(1);

    if (adminRole.length === 0) {
        console.error('❌ Admin role not found in Platform organization');
        console.log('Please run setup-global-admin.ts first');
        process.exit(1);
    }

    const adminRoleId = adminRole[0]!.id;
    console.log('✓ Found admin role:', adminRoleId);

    // 2. 配置跨租户能力权限（独立权限）
    console.log('\n配置跨租户能力权限...\n');

    const crossTenantPermission = {
        action: 'manage',
        subject: 'cross-tenant',
        description: '跨租户访问能力（必须与资源权限组合使用）',
    };

    const existingCrossTenant = await db.select()
        .from(rolePermissions)
        .where(and(
            eq(rolePermissions.roleId, adminRoleId),
            eq(rolePermissions.action, crossTenantPermission.action),
            eq(rolePermissions.subject, crossTenantPermission.subject)
        ))
        .limit(1);

    if (existingCrossTenant.length === 0) {
        await db.insert(rolePermissions).values({
            roleId: adminRoleId,
            action: crossTenantPermission.action,
            subject: crossTenantPermission.subject,
            source: 'core',
        });
        console.log(`  ✓ ${crossTenantPermission.action}:${crossTenantPermission.subject} - ${crossTenantPermission.description}`);
    } else {
        console.log(`  ⊙ ${crossTenantPermission.action}:${crossTenantPermission.subject} (已存在)`);
    }

    // 3. 配置资源权限（这些权限在所有组织都需要）
    console.log('\n配置资源访问权限...\n');

    const resourcePermissions = [
        // 用户管理
        { action: 'read', subject: 'User', description: '查看用户' },
        { action: 'update', subject: 'User', description: '更新用户' },
        { action: 'delete', subject: 'User', description: '删除用户' },

        // 组织管理
        { action: 'read', subject: 'Organization', description: '查看组织' },
        { action: 'update', subject: 'Organization', description: '更新组织' },
        { action: 'delete', subject: 'Organization', description: '删除组织' },

        // 订单管理（如果有）
        { action: 'read', subject: 'Order', description: '查看订单' },
        { action: 'update', subject: 'Order', description: '更新订单' },

        // 商品管理（如果有）
        { action: 'read', subject: 'Product', description: '查看商品' },
        { action: 'update', subject: 'Product', description: '更新商品' },

        // 审计日志
        { action: 'read', subject: 'AuditLog', description: '查看审计日志' },

        // 插件管理
        { action: 'manage', subject: 'Plugin', description: '管理插件' },
    ];

    for (const perm of resourcePermissions) {
        const existing = await db.select()
            .from(rolePermissions)
            .where(and(
                eq(rolePermissions.roleId, adminRoleId),
                eq(rolePermissions.action, perm.action),
                eq(rolePermissions.subject, perm.subject)
            ))
            .limit(1);

        if (existing.length === 0) {
            await db.insert(rolePermissions).values({
                roleId: adminRoleId,
                action: perm.action,
                subject: perm.subject,
                source: 'core',
            });
            console.log(`  ✓ ${perm.action}:${perm.subject} - ${perm.description}`);
        } else {
            console.log(`  ⊙ ${perm.action}:${perm.subject} (已存在)`);
        }
    }

    console.log('\n=== Setup Complete ===\n');
    console.log('权限组合模式已配置完成');
    console.log('');
    console.log('工作原理:');
    console.log('1. cross-tenant 权限 = 跨租户能力');
    console.log('2. 资源权限 (如 read:Order) = 访问特定资源的能力');
    console.log('3. 组合使用: cross-tenant + read:Order = 跨租户读取订单');
    console.log('');
    console.log('优点:');
    console.log('- 添加新资源时，只需配置资源权限');
    console.log('- 不需要为每个资源创建 :cross-tenant 变体');
    console.log('- 灵活控制：可以只给某些资源跨租户权限');
    console.log('');
    console.log('使用方法:');
    console.log('1. 用户必须有 user.role = "admin" (全局角色)');
    console.log('2. 切换到 Platform 组织');
    console.log('3. 系统检查: cross-tenant + read:Order → 允许跨租户查询订单');
    console.log('4. 系统检查: cross-tenant + read:User → 允许跨租户查询用户');

    process.exit(0);
}

setupCrossTenantPermissions().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
