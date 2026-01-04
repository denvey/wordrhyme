/**
 * RolesGuard
 *
 * NestJS guard that enforces role-based access control.
 * Works with @Roles() decorator to restrict access to specific roles.
 *
 * @example
 * ```ts
 * @Get('admin')
 * @UseGuards(AuthGuard, RolesGuard)
 * @Roles('admin', 'super-admin')
 * adminOnly() {
 *   return { message: 'admin content' };
 * }
 * ```
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { GuardedRequest } from './types';
import type { BetterAuthSession } from '../decorators/session.decorator';

interface ExtendedRequest extends GuardedRequest {
  betterAuthSession?: BetterAuthSession;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No roles specified = allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ExtendedRequest>();
    const userRole = request.betterAuthSession?.user?.role ?? request.user?.role;

    if (!userRole) {
      throw new ForbiddenException('No role assigned to user');
    }

    const hasRole = requiredRoles.includes(userRole);

    if (!hasRole) {
      throw new ForbiddenException(
        `Required roles: ${requiredRoles.join(', ')}. Your role: ${userRole}`,
      );
    }

    return true;
  }
}
