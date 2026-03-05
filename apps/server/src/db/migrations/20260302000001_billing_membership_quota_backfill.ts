/**
 * Migration: Backfill membership userQuotas → tenantQuotas
 *
 * This migration moves user quotas that were created via membership/subscription
 * (sourceType='membership') to the tenant_quotas table, as the subscription system
 * now uses tenant-scoped quotas instead of user-scoped quotas.
 *
 * Safety: Idempotent via ON CONFLICT DO NOTHING.
 *
 * @migration billing_membership_quota_backfill
 */

import { sql } from 'drizzle-orm';
import type { Database } from '../client';

export async function up(db: Database): Promise<void> {
  // Find all user quotas from membership sources that have an organizationId
  // and insert them into tenant_quotas (deduplicating via unique constraint)
  const result = await db.execute(sql`
    INSERT INTO tenant_quotas (
      id,
      organization_id,
      subject,
      balance,
      priority,
      expires_at,
      source_type,
      source_id,
      metadata,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      uq.organization_id,
      uq.subject,
      uq.balance,
      100, -- default tenant priority (higher than user quotas)
      uq.expires_at,
      uq.source_type,
      uq.source_id,
      jsonb_build_object(
        'migratedFrom', 'user_quotas',
        'originalUserId', uq.user_id,
        'originalId', uq.id
      ),
      uq.created_at,
      uq.updated_at
    FROM user_quotas uq
    WHERE uq.source_type = 'membership'
      AND uq.organization_id IS NOT NULL
      AND uq.balance > 0
    ON CONFLICT (organization_id, subject, source_type, source_id) DO NOTHING
  `);

  const count = (result as { rowCount?: number }).rowCount ?? 0;
  console.log(`[Migration] Migrated ${count} membership user quotas to tenant_quotas`);
}

export async function down(_db: Database): Promise<void> {
  // No rollback: removing tenant_quotas rows created during migration would
  // require tracking them separately. Manual cleanup if needed.
  console.log('[Migration] Rollback not implemented for quota backfill migration');
}
