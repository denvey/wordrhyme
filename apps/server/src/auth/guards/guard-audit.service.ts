/**
 * GuardAuditService
 *
 * Audit logging for Guard Chain security events.
 * Focuses on security violations and access control decisions.
 */

import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../db';
import { auditLogs } from '../../db/schema/audit-logs';
import type { AdminAuditAction } from './types';

export interface GuardAuditEntry {
  action: AdminAuditAction;
  success: boolean;
  failureReason?: string | undefined;
  adminId?: string | undefined;
  adminRole?: string | undefined;
  targetUserId?: string | undefined;
  tenantId?: string | undefined;
  details?: Record<string, unknown> | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  requestId?: string | undefined;
}

export interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
  requestId?: string | undefined;
}

@Injectable()
export class GuardAuditService {
  private readonly logger = new Logger(GuardAuditService.name);

  /**
   * Log a guard audit event
   *
   * Non-blocking - failures are logged but don't impact business logic
   */
  async log(entry: GuardAuditEntry): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        actorType: 'user',
        actorId: entry.adminId ?? 'anonymous',
        tenantId: entry.tenantId ?? 'unknown',
        organizationId: entry.tenantId ?? null,
        action: entry.action,
        resource: entry.targetUserId ? `user:${entry.targetUserId}` : undefined,
        result: entry.success ? 'allow' : 'deny',
        reason: entry.failureReason,
        metadata: {
          adminRole: entry.adminRole,
          targetUserId: entry.targetUserId,
          requestId: entry.requestId,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          ...entry.details,
        },
      });
    } catch (error) {
      // Audit log failure should not block business logic
      this.logger.error('Failed to write guard audit log:', error);
    }
  }

  /**
   * Log unauthorized admin access attempt
   */
  async logUnauthorizedAccess(
    userId: string | undefined,
    userRole: string | undefined,
    path: string,
    tenantId: string | undefined,
    requestMeta: RequestMeta,
  ): Promise<void> {
    await this.log({
      action: 'security.unauthorized_admin_access',
      success: false,
      adminId: userId,
      adminRole: userRole,
      tenantId,
      failureReason: 'Super admin role required',
      details: { path },
      ipAddress: requestMeta.ip,
      userAgent: requestMeta.userAgent,
      requestId: requestMeta.requestId,
    });
  }

  /**
   * Log tenant context violation
   */
  async logTenantViolation(
    adminId: string,
    attemptedTenantId: string,
    path: string,
    requestMeta: RequestMeta,
  ): Promise<void> {
    await this.log({
      action: 'security.tenant_context_violation',
      success: false,
      adminId,
      tenantId: attemptedTenantId,
      failureReason: 'Admin is not a member of this tenant',
      details: { path, attemptedTenantId },
      ipAddress: requestMeta.ip,
      userAgent: requestMeta.userAgent,
      requestId: requestMeta.requestId,
    });
  }

  /**
   * Log cross-tenant operation attempt
   */
  async logCrossTenantAttempt(
    adminId: string,
    targetUserId: string,
    tenantId: string,
    path: string,
    reason: 'pending_member' | 'not_member',
    requestMeta: RequestMeta,
  ): Promise<void> {
    await this.log({
      action: 'security.cross_tenant_attempt',
      success: false,
      adminId,
      targetUserId,
      tenantId,
      failureReason: `Target user is not a member of this tenant: ${reason}`,
      details: { path, reason },
      ipAddress: requestMeta.ip,
      userAgent: requestMeta.userAgent,
      requestId: requestMeta.requestId,
    });
  }
}
