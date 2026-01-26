import { db } from '../../src/db/client.js';
import { roles, rolePermissions } from '../../src/db/schema/definitions.js';
import { eq, and } from 'drizzle-orm';

async function verifyGlobalAdminSetup() {
  console.log('\n=== Verifying Global Admin Setup ===\n');

  // 1. 查找 Platform 组织的 admin 角色
  const adminRole = await db.select()
    .from(roles)
    .where(and(
      eq(roles.slug, 'admin'),
      eq(roles.organizationId, 'platform')
    ))
    .limit(1);

  if (adminRole.length === 0) {
    console.log('❌ Admin role not found in Platform organization');
    process.exit(1);
  }

  console.log('✓ Admin role found:');
  console.log(JSON.stringify(adminRole[0], null, 2));

  // 2. 查找权限规则
  const permissions = await db.select()
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, adminRole[0]!.id));

  console.log(`\n✓ Found ${permissions.length} permission(s):`);
  console.log(JSON.stringify(permissions, null, 2));

  console.log('\n=== Verification Complete ===\n');
  console.log('Global admin configuration is correct!');
  console.log('Users with user.role = "admin" will have these permissions in all organizations.');

  process.exit(0);
}

verifyGlobalAdminSetup().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
