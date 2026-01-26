/**
 * 配置全局管理员权限
 *
 * 在 Platform 组织中创建 admin 角色并配置超级权限
 */
import { db } from '../../src/db/client.js';
import { roles, rolePermissions } from '../../src/db/schema/definitions.js';
import { eq, and } from 'drizzle-orm';

async function setupGlobalAdminPermissions() {
  console.log('\n=== Setting up Global Admin Permissions ===\n');

  const platformOrgId = 'platform';

  // 1. 查找或创建 Platform 组织的 admin 角色
  let adminRole = await db.select()
    .from(roles)
    .where(and(
      eq(roles.slug, 'admin'),
      eq(roles.organizationId, platformOrgId)
    ))
    .limit(1);

  let adminRoleId: string;

  if (adminRole.length === 0) {
    console.log('Creating admin role in Platform organization...');
    const newRole = await db.insert(roles).values({
      slug: 'admin',
      name: 'Platform Administrator',
      organizationId: platformOrgId,
      description: 'Global administrator with full platform access',
    }).returning();
    adminRoleId = newRole[0]!.id;
    console.log('Created admin role:', adminRoleId);
  } else {
    adminRoleId = adminRole[0]!.id;
    console.log('Admin role already exists:', adminRoleId);
  }

  // 2. 配置超级权限: manage all
  const superPermission = await db.select()
    .from(rolePermissions)
    .where(and(
      eq(rolePermissions.roleId, adminRoleId),
      eq(rolePermissions.action, 'manage'),
      eq(rolePermissions.subject, 'all')
    ))
    .limit(1);

  if (superPermission.length === 0) {
    console.log('Creating super permission: manage all');
    await db.insert(rolePermissions).values({
      roleId: adminRoleId,
      action: 'manage',
      subject: 'all',
      source: 'core',
    });
    console.log('✓ Super permission created');
  } else {
    console.log('✓ Super permission already exists');
  }

  console.log('\n=== Setup Complete ===\n');
  console.log('Global admin (user.role = "admin") will now have full platform access');

  process.exit(0);
}

setupGlobalAdminPermissions().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
