/**
 * Guards Module
 *
 * Provides the Guard Chain for admin operations:
 * - RolesGuard: RBAC enforcement (via @Roles decorator)
 * - TenantContextGuard: Caller tenant validation
 * - TargetUserGuard: Target user validation
 * - AdminRateLimitGuard: Rate limiting for sensitive operations
 *
 * Also provides:
 * - TenantBanService: Tenant-level ban/unban operations
 * - AuditInterceptor: Automatic audit logging
 */

import { Module, Global } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { TenantContextGuard } from './tenant-context.guard';
import { TargetUserGuard } from './target-user.guard';
import { AdminRateLimitGuard } from './admin-rate-limit.guard';
import { MembershipService } from './membership.service';
import { GuardAuditService } from './guard-audit.service';
import { TenantBanService } from './tenant-ban.service';
import { AuditInterceptor } from './audit.interceptor';

@Global()
@Module({
  providers: [
    // Services
    MembershipService,
    GuardAuditService,
    TenantBanService,
    // Guards
    RolesGuard,
    TenantContextGuard,
    TargetUserGuard,
    AdminRateLimitGuard,
    // Interceptors
    AuditInterceptor,
  ],
  exports: [
    MembershipService,
    GuardAuditService,
    TenantBanService,
    RolesGuard,
    TenantContextGuard,
    TargetUserGuard,
    AdminRateLimitGuard,
    AuditInterceptor,
  ],
})
export class GuardsModule {}
