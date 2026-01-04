/**
 * Roles Decorator
 *
 * Metadata decorator to specify required roles for a route.
 * Used with RolesGuard to enforce role-based access control.
 *
 * @example
 * ```ts
 * @Get('admin-only')
 * @UseGuards(AuthGuard, RolesGuard)
 * @Roles('admin', 'super-admin')
 * adminOnly() {
 *   return { message: 'admin content' };
 * }
 * ```
 */
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for a route.
 * User must have at least one of the specified roles.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
