/**
 * AuditInterceptor
 *
 * Intercepts requests to methods decorated with @Audited and
 * automatically logs success/failure audit entries.
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { GuardAuditService } from './guard-audit.service';
import { AUDIT_ACTION_KEY } from './audited.decorator';
import type { GuardedRequest, AdminAuditAction } from './types';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: GuardAuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<AdminAuditAction>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    // If no @Audited decorator, just pass through
    if (!action) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const startTime = Date.now();

    // Extract audit context
    const auditContext = this.extractAuditContext(request);

    return next.handle().pipe(
      tap(() => {
        // Log successful operation
        const duration = Date.now() - startTime;
        this.logAudit(action, true, auditContext, duration);
      }),
      catchError((error: Error) => {
        // Log failed operation
        const duration = Date.now() - startTime;
        this.logAudit(action, false, auditContext, duration, error.message);
        return throwError(() => error);
      }),
    );
  }

  private extractAuditContext(request: GuardedRequest): AuditContext {
    const headers = request.headers;
    return {
      adminId: request.user?.id,
      adminRole: request.user?.role,
      targetUserId: request.targetUser?.id,
      organizationId: request.tenantContext?.organizationId,
      ipAddress: request.ip,
      userAgent:
        typeof headers['user-agent'] === 'string'
          ? headers['user-agent']
          : undefined,
      requestId:
        typeof headers['x-request-id'] === 'string'
          ? headers['x-request-id']
          : undefined,
    };
  }

  private logAudit(
    action: AdminAuditAction,
    success: boolean,
    ctx: AuditContext,
    duration: number,
    failureReason?: string,
  ): void {
    // Fire and forget - don't await
    this.auditService
      .log({
        action,
        success,
        adminId: ctx.adminId,
        adminRole: ctx.adminRole,
        targetUserId: ctx.targetUserId,
        organizationId: ctx.organizationId,
        details: { duration },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        failureReason,
      })
      .catch((error) => {
        this.logger.error('Failed to log audit entry:', error);
      });
  }
}

interface AuditContext {
  adminId?: string | undefined;
  adminRole?: string | undefined;
  targetUserId?: string | undefined;
  organizationId?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  requestId?: string | undefined;
}
