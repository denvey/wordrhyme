/**
 * TargetUserGuard
 *
 * Guard 3 in the Guard Chain: Target user tenant validation
 *
 * Extracts targetUserId from multiple sources (params, query, body)
 * and validates that the target user is an active member of the current tenant.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import type { GuardedRequest } from './types';
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
export class TargetUserGuard implements CanActivate {
  private readonly logger = new Logger(TargetUserGuard.name);

  constructor(
    private readonly membershipService: MembershipService,
    private readonly auditService: GuardAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const tenantId = request.tenantContext?.tenantId;
    const caller = request.user;

    if (!tenantId || !caller) {
      // This should not happen if guards are applied in correct order
      throw new ForbiddenException('Tenant context not available');
    }

    // Extract target user ID from multiple sources
    const targetUserId = this.extractTargetUserId(request);

    if (!targetUserId) {
      // Some operations don't require a target user (e.g., listUsers)
      // Allow these to pass through
      return true;
    }

    // Verify target user is a member of this tenant
    const targetMembership = await this.membershipService.getMembership(
      targetUserId,
      tenantId,
    );

    // Pending invitations don't count as members - can't be ban/deleted
    if (!targetMembership || targetMembership.status === 'pending') {
      const reason = targetMembership ? 'pending_member' : 'not_member';

      // Log cross-tenant operation attempt
      await this.auditService.logCrossTenantAttempt(
        caller.id,
        targetUserId,
        tenantId,
        request.url,
        reason,
        extractRequestMeta(request),
      );

      this.logger.warn(
        `TargetUserGuard: User ${caller.id} attempted operation on ${targetUserId} who is ${reason} in tenant ${tenantId}`,
      );
      throw new ForbiddenException('Target user is not a member of this tenant');
    }

    // Attach target user info to request
    request.targetUser = {
      id: targetUserId,
      membership: targetMembership,
    };

    return true;
  }

  /**
   * Extract target user ID from multiple request sources
   *
   * Priority:
   * 1. Path params: /admin/users/:userId/ban
   * 2. Query params: /admin/sessions?userId=xxx
   * 3. Body: { userId: 'xxx' }
   * 4. Body: { targetUserId: 'xxx' } (alternative naming)
   */
  private extractTargetUserId(request: GuardedRequest): string | null {
    // 1. Path params
    const params = request.params;
    if (params && params['userId']) {
      return params['userId'];
    }

    // 2. Query params
    const query = request.query;
    if (query && query['userId']) {
      return query['userId'];
    }

    // 3. Body - userId
    const body = request.body as Record<string, unknown> | undefined;
    if (body && typeof body['userId'] === 'string') {
      return body['userId'];
    }

    // 4. Body - targetUserId (alternative naming)
    if (body && typeof body['targetUserId'] === 'string') {
      return body['targetUserId'];
    }

    return null;
  }
}
