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
import { session } from '../../db/schema/auth-schema';
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
  tenantId: string;
  status: 'banned' | 'already_banned' | 'not_member';
  banExpires?: Date | null | undefined;
}

export interface UnbanResult {
  success: boolean;
  userId: string;
  tenantId: string;
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
   * @param tenantId - The tenant to ban them from
   * @param adminId - The admin performing the ban
   * @param dto - Ban options (reason, duration)
   */
  async banUserInTenant(
    userId: string,
    tenantId: string,
    adminId: string,
    dto: BanUserDto = {},
  ): Promise<BanResult> {
    // Get current membership
    const membership = await this.membershipService.getMembership(
      userId,
      tenantId,
    );

    if (!membership) {
      await this.auditService.log({
        action: 'user.ban',
        success: false,
        adminId,
        targetUserId: userId,
        tenantId,
        failureReason: 'User is not a member of this tenant',
      });

      return {
        success: false,
        userId,
        tenantId,
        status: 'not_member',
      };
    }

    if (membership.status === 'banned') {
      return {
        success: true,
        userId,
        tenantId,
        status: 'already_banned',
        banExpires: membership.banExpires,
      };
    }

    // Calculate ban expiration
    const banExpires = dto.expiresIn
      ? new Date(Date.now() + dto.expiresIn * 1000)
      : null;

    // Update membership status
    await this.membershipService.updateStatus(userId, tenantId, {
      status: 'banned',
      banReason: dto.reason ?? null,
      banExpires,
    });

    // Revoke all sessions for this user in this tenant
    // Note: This is a simplified implementation. In production, you'd need
    // to track which sessions belong to which tenant.
    await this.revokeUserSessionsForTenant(userId, tenantId);

    // Audit log
    await this.auditService.log({
      action: 'user.ban',
      success: true,
      adminId,
      targetUserId: userId,
      tenantId,
      details: {
        reason: dto.reason,
        expiresIn: dto.expiresIn,
        banExpires: banExpires?.toISOString(),
      },
    });

    this.logger.log(
      `User ${userId} banned from tenant ${tenantId} by admin ${adminId}`,
    );

    return {
      success: true,
      userId,
      tenantId,
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
    tenantId: string,
    adminId: string,
  ): Promise<UnbanResult> {
    const membership = await this.membershipService.getMembership(
      userId,
      tenantId,
    );

    if (!membership) {
      await this.auditService.log({
        action: 'user.unban',
        success: false,
        adminId,
        targetUserId: userId,
        tenantId,
        failureReason: 'User is not a member of this tenant',
      });

      return {
        success: false,
        userId,
        tenantId,
        status: 'not_member',
      };
    }

    if (membership.status !== 'banned') {
      return {
        success: true,
        userId,
        tenantId,
        status: 'not_banned',
      };
    }

    // Update membership status
    await this.membershipService.updateStatus(userId, tenantId, {
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
      tenantId,
    });

    this.logger.log(
      `User ${userId} unbanned in tenant ${tenantId} by admin ${adminId}`,
    );

    return {
      success: true,
      userId,
      tenantId,
      status: 'unbanned',
    };
  }

  /**
   * Check if a user is banned in a specific tenant
   */
  async isUserBanned(userId: string, tenantId: string): Promise<boolean> {
    const membership = await this.membershipService.getMembership(
      userId,
      tenantId,
    );

    if (!membership) return false;
    if (membership.status !== 'banned') return false;

    // Check if ban has expired
    if (membership.banExpires && membership.banExpires < new Date()) {
      // Auto-unban expired bans
      await this.membershipService.updateStatus(userId, tenantId, {
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
    tenantId: string,
  ): Promise<number> {
    try {
      const result = await db
        .delete(session)
        .where(
          and(
            eq(session.userId, userId),
            eq(session.activeOrganizationId, tenantId),
          ),
        );

      const deletedCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;

      this.logger.debug(
        `Revoked ${deletedCount} sessions for user ${userId} in tenant ${tenantId}`,
      );

      return deletedCount;
    } catch (error) {
      this.logger.error(
        `Failed to revoke sessions for user ${userId} in tenant ${tenantId}:`,
        error,
      );
      return 0;
    }
  }
}
