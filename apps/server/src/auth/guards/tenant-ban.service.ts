/**
 * TenantBanService
 *
 * Provides tenant-level ban/unban operations.
 *
 * Unlike better-auth's global admin.banUser(), this service:
 * - Bans users within a specific tenant (via membership.status)
 * - Does not affect user's access to other tenants
 * - Revokes only tenant-specific sessions
 *
 * This is the recommended approach for multi-tenant SaaS.
 */

import { Injectable, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import { session } from '@wordrhyme/db';
import { MembershipService } from './membership.service';
import { GuardAuditService } from './guard-audit.service';

export interface BanUserDto {
  reason?: string;
  /** Ban duration in seconds. If not provided, ban is permanent. */
  expiresIn?: number;
}

export interface BanResult {
  success: boolean;
  userId: string;
  organizationId: string;
  status: 'banned' | 'already_banned' | 'not_member';
  banExpires?: Date | null | undefined;
}

export interface UnbanResult {
  success: boolean;
  userId: string;
  organizationId: string;
  status: 'unbanned' | 'not_banned' | 'not_member';
}

@Injectable()
export class TenantBanService {
  private readonly logger = new Logger(TenantBanService.name);

  constructor(
    private readonly membershipService: MembershipService,
    private readonly auditService: GuardAuditService,
  ) {}

  /**
   * Ban a user in a specific tenant
   *
   * Updates membership.status to 'banned' and revokes all tenant sessions.
   * Does NOT affect user's access to other tenants.
   *
   * @param userId - The user to ban
   * @param organizationId - The tenant to ban them from
   * @param adminId - The admin performing the ban
   * @param dto - Ban options (reason, duration)
   */
  async banUserInTenant(
    userId: string,
    organizationId: string,
    adminId: string,
    dto: BanUserDto = {},
  ): Promise<BanResult> {
    // Get current membership
    const membership = await this.membershipService.getMembership(
      userId,
      organizationId,
    );

    if (!membership) {
      await this.auditService.log({
        action: 'user.ban',
        success: false,
        adminId,
        targetUserId: userId,
        organizationId,
        failureReason: 'User is not a member of this tenant',
      });

      return {
        success: false,
        userId,
        organizationId,
        status: 'not_member',
      };
    }

    if (membership.status === 'banned') {
      return {
        success: true,
        userId,
        organizationId,
        status: 'already_banned',
        banExpires: membership.banExpires,
      };
    }

    // Calculate ban expiration
    const banExpires = dto.expiresIn
      ? new Date(Date.now() + dto.expiresIn * 1000)
      : null;

    // Update membership status
    await this.membershipService.updateStatus(userId, organizationId, {
      status: 'banned',
      banReason: dto.reason ?? null,
      banExpires,
    });

    // Revoke all sessions for this user in this tenant
    // Note: This is a simplified implementation. In production, you'd need
    // to track which sessions belong to which tenant.
    await this.revokeUserSessionsForTenant(userId, organizationId);

    // Audit log
    await this.auditService.log({
      action: 'user.ban',
      success: true,
      adminId,
      targetUserId: userId,
      organizationId,
      details: {
        reason: dto.reason,
        expiresIn: dto.expiresIn,
        banExpires: banExpires?.toISOString(),
      },
    });

    this.logger.log(
      `User ${userId} banned from tenant ${organizationId} by admin ${adminId}`,
    );

    return {
      success: true,
      userId,
      organizationId,
      status: 'banned',
      banExpires,
    };
  }

  /**
   * Unban a user in a specific tenant
   *
   * Restores membership.status to 'active'.
   */
  async unbanUserInTenant(
    userId: string,
    organizationId: string,
    adminId: string,
  ): Promise<UnbanResult> {
    const membership = await this.membershipService.getMembership(
      userId,
      organizationId,
    );

    if (!membership) {
      await this.auditService.log({
        action: 'user.unban',
        success: false,
        adminId,
        targetUserId: userId,
        organizationId,
        failureReason: 'User is not a member of this tenant',
      });

      return {
        success: false,
        userId,
        organizationId,
        status: 'not_member',
      };
    }

    if (membership.status !== 'banned') {
      return {
        success: true,
        userId,
        organizationId,
        status: 'not_banned',
      };
    }

    // Update membership status
    await this.membershipService.updateStatus(userId, organizationId, {
      status: 'active',
      banReason: null,
      banExpires: null,
    });

    // Audit log
    await this.auditService.log({
      action: 'user.unban',
      success: true,
      adminId,
      targetUserId: userId,
      organizationId,
    });

    this.logger.log(
      `User ${userId} unbanned in tenant ${organizationId} by admin ${adminId}`,
    );

    return {
      success: true,
      userId,
      organizationId,
      status: 'unbanned',
    };
  }

  /**
   * Check if a user is banned in a specific tenant
   */
  async isUserBanned(userId: string, organizationId: string): Promise<boolean> {
    const membership = await this.membershipService.getMembership(
      userId,
      organizationId,
    );

    if (!membership) return false;
    if (membership.status !== 'banned') return false;

    // Check if ban has expired
    if (membership.banExpires && membership.banExpires < new Date()) {
      // Auto-unban expired bans
      await this.membershipService.updateStatus(userId, organizationId, {
        status: 'active',
        banReason: null,
        banExpires: null,
      });
      return false;
    }

    return true;
  }

  /**
   * Revoke all sessions for a user in a specific tenant
   *
   * Note: This requires tracking which sessions belong to which tenant.
   * Since better-auth sessions have activeOrganizationId, we can use that.
   */
  private async revokeUserSessionsForTenant(
    userId: string,
    organizationId: string,
  ): Promise<number> {
    try {
      const result = await db
        .delete(session)
        .where(
          and(
            eq(session.userId, userId),
            eq(session.activeOrganizationId, organizationId),
          ),
        );

      const deletedCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;

      this.logger.debug(
        `Revoked ${deletedCount} sessions for user ${userId} in tenant ${organizationId}`,
      );

      return deletedCount;
    } catch (error) {
      this.logger.error(
        `Failed to revoke sessions for user ${userId} in tenant ${organizationId}:`,
        error,
      );
      return 0;
    }
  }
}
