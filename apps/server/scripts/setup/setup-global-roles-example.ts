/**
 * 配置不同级别的全局角色
 *
 * 示例:创建全局订单查看员角色
 */
import { db } from '../../src/db/client.js';
import { roles, rolePermissions } from '../../src/db/schema/definitions.js';

async function setupGlobalRoles() {
  console.log('\n=== Setting up Global Roles ===\n');

  const platformOrgId = 'platform';

  // 1. 全局订单查看员 - 只能查看所有组织的订单
  const orderViewerRole = await db.insert(roles).values({
    slug: 'order-viewer',
    name: 'Global Order Viewer',
    organizationId: platformOrgId,
    description: 'Can view orders across all organizations',
  }).returning();

  await db.insert(rolePermissions).values({
    roleId: orderViewerRole[0]!.id,
    action: 'read',
    subject: 'Order',
    source: 'core',
  });

  console.log('✓ Created order-viewer role');

  // 2. 全局审计员 - 可以查看所有组织的审计日志
  const auditorRole = await db.insert(roles).values({
    slug: 'auditor',
    name: 'Global Auditor',
    organizationId: platformOrgId,
    description: 'Can view audit logs across all organizations',
  }).returning();

  await db.insert(rolePermissions).values([
    {
      roleId: auditorRole[0]!.id,
      action: 'read',
      subject: 'AuditLog',
      source: 'core',
    },
    {
      roleId: auditorRole[0]!.id,
      action: 'read',
      subject: 'Organization',
      source: 'core',
    },
  ]);

  console.log('✓ Created auditor role');

  // 3. 全局超级管理员 - 所有权限(已经创建)
  console.log('✓ Admin role already exists with manage all permission');

  console.log('\n=== Setup Complete ===\n');
  console.log('You can now assign these roles to users:');
  console.log('- UPDATE user SET role = "order-viewer" WHERE email = "viewer@example.com"');
  console.log('- UPDATE user SET role = "auditor" WHERE email = "auditor@example.com"');
  console.log('- UPDATE user SET role = "admin" WHERE email = "admin@example.com"');

  process.exit(0);
}

setupGlobalRoles().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
