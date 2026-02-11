/**
 * 迁移: Content Subject 拆分为 Article/Page/Media
 *
 * 策略: 方案 C - 按角色分配（激进迁移）
 *
 * 背景:
 * - 现有 Subjects.Content 覆盖 articles/pages/media 三个表
 * - role_permissions 的 unique index 为 (roleId, action, subject)，不含 conditions
 * - 导致无法用 conditions 区分 Article/Page/Media
 *
 * 迁移规则（需要根据实际角色调整）:
 * - Editor 角色: Content → Article + Page (编辑器管理文章和页面)
 * - Admin 角色: Content → Article + Page + Media (管理员全部权限)
 * - Viewer 角色: Content → Article (仅查看文章)
 *
 * 执行步骤:
 * 1. 备份现有 Content 权限
 * 2. 按角色分配权限到细粒度 Subject
 * 3. 删除旧的 Content 权限
 * 4. 验证迁移结果
 *
 * @migration split_content_subject
 * @priority P0
 */

import { sql } from 'drizzle-orm';
import type { DrizzleDB } from '../db';

/**
 * 角色权限分配规则
 *
 * ⚠️ 重要: 根据您的实际角色配置修改此映射
 */
const ROLE_SUBJECT_MAPPING: Record<string, string[]> = {
  // 管理员 - 完全权限
  'admin': ['Article', 'Page', 'Media'],
  'superadmin': ['Article', 'Page', 'Media'],

  // 编辑器 - 文章和页面
  'editor': ['Article', 'Page'],
  'content-editor': ['Article', 'Page'],

  // 作者 - 仅文章
  'author': ['Article'],
  'writer': ['Article'],

  // 查看者 - 仅文章只读（后续可以用 actions 过滤）
  'viewer': ['Article'],
  'reader': ['Article'],

  // 媒体管理员 - 仅媒体
  'media-manager': ['Media'],
};

/**
 * 默认分配规则（如果角色不在映射中）
 *
 * 保守策略: 复制到所有三个 Subject，保持原有权限范围
 */
const DEFAULT_SUBJECTS = ['Article', 'Page', 'Media'];

/**
 * 向上迁移
 */
export async function up(db: DrizzleDB) {
  console.log('[Migration] Starting Content subject split...');

  // Step 1: 备份现有 Content 权限
  console.log('[Migration] Step 1: Backing up Content permissions...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS _backup_content_permissions_20240228 AS
    SELECT * FROM role_permissions WHERE subject = 'Content'
  `);

  const backupCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM _backup_content_permissions_20240228
  `);
  console.log(`[Migration] Backed up ${(backupCount.rows[0] as any)?.count ?? 0} Content permissions`);

  // Step 2: 获取所有角色
  const rolesResult = await db.execute(sql`
    SELECT DISTINCT r.id, r.slug, r.name
    FROM roles r
    INNER JOIN role_permissions rp ON r.id = rp.role_id
    WHERE rp.subject = 'Content'
  `);

  const roles = rolesResult.rows as Array<{ id: string; slug: string; name: string }>;
  console.log(`[Migration] Found ${roles.length} roles with Content permissions`);

  // Step 3: 按角色分配权限
  let insertedCount = 0;

  for (const role of roles) {
    const roleSlug = role.slug;
    const targetSubjects = ROLE_SUBJECT_MAPPING[roleSlug] ?? DEFAULT_SUBJECTS;

    console.log(`[Migration] Migrating role: ${role.name} (${roleSlug}) → Subjects: ${targetSubjects.join(', ')}`);

    for (const subject of targetSubjects) {
      // 插入新的细粒度权限
      const result = await db.execute(sql`
        INSERT INTO role_permissions (
          id,
          role_id,
          action,
          subject,
          fields,
          conditions,
          inverted,
          source,
          created_at,
          updated_at
        )
        SELECT
          gen_random_uuid(),
          role_id,
          action,
          ${subject},  -- 新的细粒度 Subject
          fields,
          NULL,        -- 清空 conditions（不再需要）
          inverted,
          source,
          created_at,
          NOW()
        FROM role_permissions
        WHERE role_id = ${role.id}
          AND subject = 'Content'
        ON CONFLICT (role_id, action, subject) DO NOTHING
      `);

      insertedCount += (result as any).rowCount ?? 0;
    }
  }

  console.log(`[Migration] Inserted ${insertedCount} new permissions`);

  // Step 4: 删除旧的 Content 权限
  console.log('[Migration] Step 4: Deleting old Content permissions...');
  const deleteResult = await db.execute(sql`
    DELETE FROM role_permissions WHERE subject = 'Content'
  `);

  console.log(`[Migration] Deleted ${(deleteResult as any).rowCount ?? 0} Content permissions`);

  // Step 5: 验证迁移结果
  console.log('[Migration] Step 5: Verifying migration...');
  const verifyResult = await db.execute(sql`
    SELECT
      subject,
      COUNT(*) as count
    FROM role_permissions
    WHERE subject IN ('Article', 'Page', 'Media', 'Content')
    GROUP BY subject
  `);

  console.log('[Migration] Current subject distribution:');
  for (const row of verifyResult.rows) {
    console.log(`  - ${(row as any).subject}: ${(row as any).count}`);
  }

  // 检查是否还有遗留的 Content
  const remainingContent = await db.execute(sql`
    SELECT COUNT(*) as count FROM role_permissions WHERE subject = 'Content'
  `);

  const remainingCount = (remainingContent.rows[0] as any)?.count ?? 0;
  if (remainingCount > 0) {
    console.warn(`[Migration] ⚠️ WARNING: ${remainingCount} Content permissions still exist!`);
  } else {
    console.log('[Migration] ✅ No remaining Content permissions');
  }

  console.log('[Migration] Content subject split completed successfully!');
}

/**
 * 向下迁移（回滚）
 */
export async function down(db: DrizzleDB) {
  console.log('[Migration] Rolling back Content subject split...');

  // Step 1: 删除细粒度权限
  console.log('[Migration] Step 1: Deleting Article/Page/Media permissions...');
  const deleteResult = await db.execute(sql`
    DELETE FROM role_permissions
    WHERE subject IN ('Article', 'Page', 'Media')
      AND created_at >= (
        SELECT MIN(created_at)
        FROM _backup_content_permissions_20240228
      )
  `);

  console.log(`[Migration] Deleted ${(deleteResult as any).rowCount ?? 0} permissions`);

  // Step 2: 恢复备份
  console.log('[Migration] Step 2: Restoring Content permissions from backup...');
  await db.execute(sql`
    INSERT INTO role_permissions (
      id,
      role_id,
      action,
      subject,
      fields,
      conditions,
      inverted,
      source,
      created_at,
      updated_at
    )
    SELECT
      id,
      role_id,
      action,
      subject,
      fields,
      conditions,
      inverted,
      source,
      created_at,
      NOW()
    FROM _backup_content_permissions_20240228
    ON CONFLICT (role_id, action, subject) DO NOTHING
  `);

  // Step 3: 删除备份表
  console.log('[Migration] Step 3: Dropping backup table...');
  await db.execute(sql`DROP TABLE IF EXISTS _backup_content_permissions_20240228`);

  console.log('[Migration] Rollback completed successfully!');
}

/**
 * 迁移后验证脚本
 *
 * 在生产环境执行前，请先在测试环境运行此脚本验证结果
 */
export async function verify(db: DrizzleDB) {
  console.log('[Verify] Checking migration results...\n');

  // 检查 1: 确认没有遗留 Content
  const contentCheck = await db.execute(sql`
    SELECT COUNT(*) as count FROM role_permissions WHERE subject = 'Content'
  `);
  const contentCount = (contentCheck.rows[0] as any)?.count ?? 0;

  console.log(`✓ Remaining Content permissions: ${contentCount}`);
  if (contentCount > 0) {
    console.error('  ❌ FAIL: Content permissions should be 0');
    return false;
  }

  // 检查 2: 确认细粒度 Subject 存在
  const subjectCheck = await db.execute(sql`
    SELECT
      subject,
      COUNT(*) as count,
      COUNT(DISTINCT role_id) as role_count
    FROM role_permissions
    WHERE subject IN ('Article', 'Page', 'Media')
    GROUP BY subject
  `);

  console.log('\n✓ New subject distribution:');
  for (const row of subjectCheck.rows) {
    const r = row as any;
    console.log(`  - ${r.subject}: ${r.count} permissions across ${r.role_count} roles`);
  }

  // 检查 3: 对比备份表总数
  const backupCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM _backup_content_permissions_20240228
  `);
  const originalCount = (backupCount.rows[0] as any)?.count ?? 0;

  const newCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM role_permissions
    WHERE subject IN ('Article', 'Page', 'Media')
  `);
  const migratedCount = (newCount.rows[0] as any)?.count ?? 0;

  console.log(`\n✓ Permission count comparison:`);
  console.log(`  - Original Content permissions: ${originalCount}`);
  console.log(`  - New Article/Page/Media permissions: ${migratedCount}`);
  console.log(`  - Ratio: ${(migratedCount / originalCount).toFixed(2)}x`);

  if (migratedCount < originalCount) {
    console.warn('  ⚠️ WARNING: New permissions are fewer than original');
    console.warn('  This is expected if using specific role mapping (not DEFAULT_SUBJECTS)');
  }

  // 检查 4: 按角色验证
  console.log('\n✓ Role-level verification:');
  const roleCheck = await db.execute(sql`
    SELECT
      r.name,
      r.slug,
      COUNT(CASE WHEN rp.subject = 'Article' THEN 1 END) as article_perms,
      COUNT(CASE WHEN rp.subject = 'Page' THEN 1 END) as page_perms,
      COUNT(CASE WHEN rp.subject = 'Media' THEN 1 END) as media_perms
    FROM roles r
    INNER JOIN role_permissions rp ON r.id = rp.role_id
    WHERE rp.subject IN ('Article', 'Page', 'Media')
    GROUP BY r.id, r.name, r.slug
  `);

  for (const row of roleCheck.rows) {
    const r = row as any;
    console.log(`  - ${r.name} (${r.slug}):`);
    console.log(`      Article: ${r.article_perms}, Page: ${r.page_perms}, Media: ${r.media_perms}`);
  }

  console.log('\n✅ Verification completed!');
  return true;
}
