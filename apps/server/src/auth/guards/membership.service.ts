/**
 * MembershipService
 *
 * Provides membership lookup for Guard Chain validation.
 * Used by TenantContextGuard and TargetUserGuard.
 */

import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import { member } from '@wordrhyme/db';
import type { Membership } from './types';

@Injectable()
export class MembershipService {
  /**
   * Get membership record for a user in a specific tenant
   *
   * @param userId - The user ID
   * @param organizationId - The tenant (organization) ID
   * @returns Membership record or null if not found
   */
  async getMembership(
    userId: string,
    organizationId: string,
  ): Promise<Membership | null> {
    const result = await db
      .select()
      .from(member)
      .where(
        and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
      )
      .limit(1);

    const row = result[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
      role: row.role,
      status: (row.status as 'active' | 'banned' | 'pending') ?? 'active',
      banReason: row.banReason,
      banExpires: row.banExpires,
      createdAt: row.createdAt,
    };
  }

  /**
   * Update membership status (for ban/unban operations)
   *
   * @param userId - The user ID
   * @param organizationId - The tenant (organization) ID
   * @param update - Status update data
   */
  async updateStatus(
    userId: string,
    organizationId: string,
    update: {
      status: 'active' | 'banned' | 'pending';
      banReason?: string | null;
      banExpires?: Date | null;
    },
  ): Promise<void> {
    await db
      .update(member)
      .set({
        status: update.status,
        banReason: update.banReason ?? null,
        banExpires: update.banExpires ?? null,
      })
      .where(
        and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
      );
  }

  /**
   * Check if user is an active member of the tenant
   *
   * @param userId - The user ID
   * @param organizationId - The tenant (organization) ID
   * @returns true if user is active member
   */
  async isActiveMember(userId: string, organizationId: string): Promise<boolean> {
    const membership = await this.getMembership(userId, organizationId);
    return membership !== null && membership.status === 'active';
  }
}
