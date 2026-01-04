/**
 * SuperAdminGuard
 *
 * Guard 1 in the Guard Chain: RBAC enforcement
 *
 * Verifies that the caller has admin/super-admin role or is in adminUserIds.
 * Returns 403 Forbidden for non-admin callers.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import type { GuardedRequest } from './types';
import { ADMIN_ROLES } from './types';
import { GuardAuditService, type RequestMeta } from './guard-audit.service';

/**
 * Get admin user IDs from environment variable
 * Format: comma-separated list of user IDs
 */
function getAdminUserIds(): string[] {
  const envValue = process.env['ADMIN_USER_IDS'];
  if (!envValue) return [];
  return envValue.split(',').map((id) => id.trim()).filter(Boolean);
}

/**
 * Extract request metadata for audit logging
 */
function extractRequestMeta(request: GuardedRequest): RequestMeta {
  const headers = request.headers;
  return {
    ip: request.ip,
    userAgent: typeof headers['user-agent'] === 'string' ? headers['user-agent'] : undefined,
    requestId: typeof headers['x-request-id'] === 'string' ? headers['x-request-id'] : undefined,
  };
}

@Injectable()
export class SuperAdminGuard implements CanActivate {
  private readonly logger = new Logger(SuperAdminGuard.name);

  constructor(private readonly auditService: GuardAuditService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const user = request.user;

    if (!user) {
      this.logger.warn('SuperAdminGuard: No user in request');
      throw new ForbiddenException('Authentication required');
    }

    const userRole = user.role;

    // Check if user has admin role
    const hasAdminRole = userRole && ADMIN_ROLES.includes(userRole as (typeof ADMIN_ROLES)[number]);

    // Check if user is in adminUserIds config list
    const adminUserIds = getAdminUserIds();
    const isInAdminList = adminUserIds.includes(user.id);

    if (!hasAdminRole && !isInAdminList) {
      // Log unauthorized access attempt
      const tenantId = typeof request.headers['x-tenant-id'] === 'string'
        ? request.headers['x-tenant-id']
        : undefined;

      await this.auditService.logUnauthorizedAccess(
        user.id,
        userRole,
        request.url,
        tenantId,
        extractRequestMeta(request),
      );

      this.logger.warn(
        `SuperAdminGuard: Unauthorized access attempt by user ${user.id} with role ${userRole}`,
      );
      throw new ForbiddenException('Super admin role required');
    }

    return true;
  }
}
