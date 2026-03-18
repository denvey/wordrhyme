/**
 * 迁移: File + Asset → Media (权限数据)
 *
 * 背景:
 * - files + assets 表合并为 media 表
 * - role_permissions 中的 File/Asset subject 需要统一为 Media
 * - unique index (roleId, action, subject) 可能导致冲突需处理
 *
 * 迁移规则:
 * - File subject → Media
 * - Asset subject → Media
 * - 冲突时 (同 roleId+action 同时存在 File 和 Asset) 保留一条
 *
 * @migration merge_file_asset_to_media
 * @priority P0
 */

import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * 向上迁移
 */
export async function up(db: Database) {
  console.log('[Migration] Starting File+Asset → Media permission merge...');

  // Step 1: 备份
  console.log('[Migration] Step 1: Backing up File/Asset permissions...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS _backup_file_asset_permissions_20260224 AS
    SELECT * FROM role_permissions WHERE subject IN ('File', 'Asset')
  `);

  const backupCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM _backup_file_asset_permissions_20260224
  `);
  const backupCountRows = backupCount as Array<{ count?: number }>;
  console.log(`[Migration] Backed up ${backupCountRows[0]?.count ?? 0} File/Asset permissions`);

  // Step 2: 将 File 权限更新为 Media（ON CONFLICT 忽略）
  console.log('[Migration] Step 2: Migrating File → Media...');
  const fileResult = await db.execute(sql`
    UPDATE role_permissions
    SET subject = 'Media', updated_at = NOW()
    WHERE subject = 'File'
      AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp2
        WHERE rp2.role_id = role_permissions.role_id
          AND rp2.action = role_permissions.action
          AND rp2.subject = 'Media'
      )
  `);
  console.log(`[Migration] Updated ${(fileResult as any).rowCount ?? 0} File → Media`);

  // Step 3: 删除剩余的 File 权限（已被 Media 覆盖的）
  const fileDeleteResult = await db.execute(sql`
    DELETE FROM role_permissions WHERE subject = 'File'
  `);
  console.log(`[Migration] Deleted ${(fileDeleteResult as any).rowCount ?? 0} duplicate File permissions`);

  // Step 4: 将 Asset 权限更新为 Media（ON CONFLICT 忽略）
  console.log('[Migration] Step 4: Migrating Asset → Media...');
  const assetResult = await db.execute(sql`
    UPDATE role_permissions
    SET subject = 'Media', updated_at = NOW()
    WHERE subject = 'Asset'
      AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp2
        WHERE rp2.role_id = role_permissions.role_id
          AND rp2.action = role_permissions.action
          AND rp2.subject = 'Media'
      )
  `);
  console.log(`[Migration] Updated ${(assetResult as any).rowCount ?? 0} Asset → Media`);

  // Step 5: 删除剩余的 Asset 权限
  const assetDeleteResult = await db.execute(sql`
    DELETE FROM role_permissions WHERE subject = 'Asset'
  `);
  console.log(`[Migration] Deleted ${(assetDeleteResult as any).rowCount ?? 0} duplicate Asset permissions`);

  // Step 6: 验证
  console.log('[Migration] Step 6: Verifying...');
  const verifyResult = await db.execute(sql`
    SELECT subject, COUNT(*) as count
    FROM role_permissions
    WHERE subject IN ('File', 'Asset', 'Media')
    GROUP BY subject
  `);
  const verifyRows = verifyResult as unknown as Array<{ subject: string; count: number }>;

  console.log('[Migration] Current subject distribution:');
  for (const row of verifyRows) {
    console.log(`  - ${row.subject}: ${row.count}`);
  }

  const remaining = await db.execute(sql`
    SELECT COUNT(*) as count FROM role_permissions WHERE subject IN ('File', 'Asset')
  `);
  const remainingRows = remaining as Array<{ count?: number }>;
  const remainingCount = remainingRows[0]?.count ?? 0;

  if (remainingCount > 0) {
    console.warn(`[Migration] ⚠️ WARNING: ${remainingCount} File/Asset permissions still exist!`);
  } else {
    console.log('[Migration] ✅ No remaining File/Asset permissions');
  }

  console.log('[Migration] File+Asset → Media merge completed!');
}

/**
 * 向下迁移（回滚）
 */
export async function down(db: Database) {
  console.log('[Migration] Rolling back File+Asset → Media merge...');

  // Step 1: 删除迁移后的 Media 权限
  console.log('[Migration] Step 1: Deleting Media permissions...');
  await db.execute(sql`
    DELETE FROM role_permissions WHERE subject = 'Media'
  `);

  // Step 2: 从备份恢复
  console.log('[Migration] Step 2: Restoring File/Asset permissions from backup...');
  await db.execute(sql`
    INSERT INTO role_permissions (
      id, role_id, action, subject, fields, conditions, inverted, source, created_at, updated_at
    )
    SELECT
      id, role_id, action, subject, fields, conditions, inverted, source, created_at, NOW()
    FROM _backup_file_asset_permissions_20260224
    ON CONFLICT (role_id, action, subject) DO NOTHING
  `);

  // Step 3: 删除备份表
  console.log('[Migration] Step 3: Dropping backup table...');
  await db.execute(sql`DROP TABLE IF EXISTS _backup_file_asset_permissions_20260224`);

  console.log('[Migration] Rollback completed!');
}
