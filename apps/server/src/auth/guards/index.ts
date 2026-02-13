/**
 * Guards Module Exports
 *
 * Guard Chain for admin operations:
 * AuthGuard → RolesGuard → TenantContextGuard → TargetUserGuard → AdminRateLimitGuard
 */

// Module
export { GuardsModule } from './guards.module';

// Guards
export { AuthGuard } from './auth.guard';
export { RolesGuard } from './roles.guard';

export { TenantContextGuard } from './tenant-context.guard';
export { TargetUserGuard } from './target-user.guard';
export { AdminRateLimitGuard } from './admin-rate-limit.guard';

// Services
export { MembershipService } from './membership.service';
export { GuardAuditService, type RequestMeta, type GuardAuditEntry } from './guard-audit.service';
export { TenantBanService, type BanUserDto, type BanResult, type UnbanResult } from './tenant-ban.service';

// Interceptors & Decorators
export { AuditInterceptor } from './audit.interceptor';
export { Audited, AUDIT_ACTION_KEY } from './audited.decorator';

// Types
export type {
  Membership,
  TenantContext,
  TargetUser,
  AuthUser,
  GuardedRequest,
  AdminAuditAction,
} from './types';
export { PLATFORM_ADMIN_ROLE } from './types';
