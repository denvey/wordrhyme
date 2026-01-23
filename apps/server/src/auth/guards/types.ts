/**
 * Guard Chain Types
 *
 * Types for the admin Guard Chain that enforces:
 * - RBAC (role-based access control)
 * - Tenant isolation
 * - Target user validation
 */

/**
 * Membership record with status
 */
export interface Membership {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  status: 'active' | 'banned' | 'pending';
  banReason?: string | null;
  banExpires?: Date | null;
  createdAt: Date;
}

/**
 * Tenant context attached to request by TenantContextGuard
 */
export interface TenantContext {
  organizationId: string;
  callerMembership: Membership | null;
  callerRole: string;
}

/**
 * Target user info attached to request by TargetUserGuard
 */
export interface TargetUser {
  id: string;
  membership: Membership;
}

/**
 * User info attached to request by AuthGuard
 */
export interface AuthUser {
  id: string;
  role?: string;
  email?: string;
}

/**
 * Extended request with guard context
 * Compatible with NestJS/Fastify request structure
 */
export interface GuardedRequest {
  user?: AuthUser;
  tenantContext?: TenantContext;
  targetUser?: TargetUser;
  // Standard request properties
  url: string;
  method: string;
  ip: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

/**
 * Admin roles that can perform Layer 2 operations
 */
export const ADMIN_ROLES = ['admin', 'super-admin', 'admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Platform admin role (can perform cross-tenant operations)
 */
export const PLATFORM_ADMIN_ROLE = 'admin';

/**
 * Audit action types for admin operations
 */
export type AdminAuditAction =
  // Layer 1 - Tenant member management
  | 'member.invite'
  | 'member.remove'
  | 'member.role_update'
  // Layer 2 - Super admin operations
  | 'user.ban'
  | 'user.unban'
  | 'user.impersonate_start'
  | 'user.impersonate_stop'
  | 'user.session_revoke'
  | 'user.session_revoke_all'
  | 'user.password_reset'
  | 'user.role_update'
  | 'user.delete'
  // Security events
  | 'security.cross_tenant_attempt'
  | 'security.unauthorized_admin_access'
  | 'security.rate_limit_exceeded'
  | 'security.tenant_context_violation';
