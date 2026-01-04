/**
 * AuthGuard
 *
 * NestJS guard that validates better-auth session.
 * Fetches session from better-auth and populates request.
 *
 * Supports:
 * - @Public() decorator to bypass authentication
 * - Populates request.user and request.betterAuthSession
 *
 * @example
 * ```ts
 * @Controller('users')
 * @UseGuards(AuthGuard)
 * export class UsersController {
 *   @Get('me')
 *   getMe(@CurrentUser() user: AuthUser) {
 *     return user;
 *   }
 *
 *   @Get('health')
 *   @Public()
 *   health() {
 *     return { status: 'ok' };
 *   }
 * }
 * ```
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { auth } from '../auth';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { BetterAuthSession } from '../decorators/session.decorator';
import type { GuardedRequest, AuthUser } from './types';

interface ExtendedRequest extends GuardedRequest {
  betterAuthSession?: BetterAuthSession;
  raw?: {
    headers: Record<string, string | string[] | undefined>;
  };
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ExtendedRequest>();

    try {
      // Get session from better-auth using headers
      const headers = this.extractHeaders(request);
      const session = await auth.api.getSession({ headers });

      if (!session || !session.user) {
        throw new UnauthorizedException('Invalid or expired session');
      }

      // Check global ban status
      if (session.user.banned) {
        const banExpires = session.user.banExpires ? new Date(session.user.banExpires) : null;
        if (!banExpires || banExpires > new Date()) {
          throw new ForbiddenException(
            session.user.banReason
              ? `Account banned: ${session.user.banReason}`
              : 'Account has been banned'
          );
        }
      }

      // Build user object, only including defined properties
      const userObj: BetterAuthSession['user'] = {
        id: session.user.id,
        email: session.user.email,
      };
      if (session.user.name) userObj.name = session.user.name;
      if (session.user.role) userObj.role = session.user.role;
      if (session.user.image) userObj.image = session.user.image;
      if (session.user.banned) userObj.banned = session.user.banned;
      if (session.user.banReason) userObj.banReason = session.user.banReason;
      if (session.user.banExpires) userObj.banExpires = session.user.banExpires;

      // Build session object, only including defined properties
      const sessionObj: BetterAuthSession['session'] = {
        id: session.session.id,
        userId: session.session.userId,
        expiresAt: session.session.expiresAt,
      };
      if (session.session.impersonatedBy) sessionObj.impersonatedBy = session.session.impersonatedBy;
      if (session.session.activeOrganizationId) sessionObj.activeOrganizationId = session.session.activeOrganizationId;

      // Populate request with session data
      request.betterAuthSession = {
        user: userObj,
        session: sessionObj,
      };

      // Also populate legacy request.user for compatibility with existing guards
      const authUser: AuthUser = {
        id: session.user.id,
        email: session.user.email,
      };
      if (session.user.role) authUser.role = session.user.role;
      request.user = authUser;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error('AuthGuard error:', error);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractHeaders(request: ExtendedRequest): Headers {
    const headers = new Headers();
    const rawHeaders = request.raw?.headers ?? request.headers;

    Object.entries(rawHeaders).forEach(([key, value]) => {
      if (value) {
        headers.append(key, Array.isArray(value) ? value.join(',') : value);
      }
    });

    return headers;
  }
}
