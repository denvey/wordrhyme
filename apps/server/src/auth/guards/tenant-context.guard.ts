/**
 * TenantContextGuard
 *
 * Guard 2 in the Guard Chain: Caller tenant validation
 *
 * Validates that the caller is a member of the X-Tenant-Id tenant
 * (or is a admin who can operate across tenants).
 * Binds tenant context to the request.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { GuardedRequest } from './types';
import { PLATFORM_ADMIN_ROLE } from './types';
import { MembershipService } from './membership.service';
import { GuardAuditService, type RequestMeta } from './guard-audit.service';

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
export class TenantContextGuard implements CanActivate {
  private readonly logger = new Logger(TenantContextGuard.name);

  constructor(
    private readonly membershipService: MembershipService,
    private readonly auditService: GuardAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const organizationIdHeader = request.headers['x-tenant-id'];
    const organizationId = typeof organizationIdHeader === 'string' ? organizationIdHeader : undefined;
    const caller = request.user;

    if (!caller) {
      throw new ForbiddenException('Authentication required');
    }

    if (!organizationId) {
      throw new BadRequestException('X-Tenant-Id header required');
    }

    // Check if caller is a member of the tenant
    const callerMembership = await this.membershipService.getMembership(
      caller.id,
      organizationId,
    );

    if (!callerMembership) {
      // Platform-admin can operate across tenants
      const isPlatformAdmin = caller.role === PLATFORM_ADMIN_ROLE;

      if (!isPlatformAdmin) {
        // Log tenant context violation
        await this.auditService.logTenantViolation(
          caller.id,
          organizationId,
          request.url,
          extractRequestMeta(request),
        );

        this.logger.warn(
          `TenantContextGuard: User ${caller.id} attempted to access tenant ${organizationId} without membership`,
        );
        throw new ForbiddenException('Admin is not a member of this tenant');
      }
    }

    // Check if caller's membership is active (not banned)
    if (callerMembership && callerMembership.status === 'banned') {
      // Check if ban has expired
      const banExpires = callerMembership.banExpires ? new Date(callerMembership.banExpires) : null;
      if (!banExpires || banExpires > new Date()) {
        throw new ForbiddenException('Your access to this tenant has been suspended');
      }
      // Ban expired - could auto-unban here, but for now just allow access
    }

    // Bind tenant context to request
    request.tenantContext = {
      organizationId,
      callerMembership,
      callerRole: callerMembership?.role ?? PLATFORM_ADMIN_ROLE,
    };

    return true;
  }
}
