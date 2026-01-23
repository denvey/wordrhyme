/**
 * Audited Decorator
 *
 * Automatically logs success/failure audit entries for admin operations.
 * Applied to controller methods that need audit logging.
 */

import { SetMetadata } from '@nestjs/common';
import type { AdminAuditAction } from './types';

/**
 * Metadata key for storing audit action
 */
export const AUDIT_ACTION_KEY = 'audit:action';

/**
 * Decorator to mark a controller method for audit logging
 *
 * Usage:
 * ```typescript
 * @Audited('user.ban')
 * @UseGuards(AuthGuard, SuperAdminGuard, TenantContextGuard, TargetUserGuard)
 * @Post('users/:userId/ban')
 * async banUser(@Param('userId') userId: string) {
 *   // ...
 * }
 * ```
 *
 * The audit entry will automatically include:
 * - action: The specified action
 * - success: true/false based on whether the method throws
 * - adminId: From request.user.id
 * - targetUserId: From request.targetUser.id
 * - organizationId: From request.tenantContext.organizationId
 * - duration: Execution time in ms
 * - ipAddress, userAgent, requestId: From request headers
 *
 * Note: This decorator only sets metadata. The actual audit logging
 * is performed by the AuditInterceptor which should be applied
 * to the controller or globally.
 */
export const Audited = (action: AdminAuditAction) =>
  SetMetadata(AUDIT_ACTION_KEY, action);
