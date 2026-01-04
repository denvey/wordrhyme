/**
 * Session Decorator
 *
 * Extracts better-auth session from the request.
 * Works with AuthGuard to provide type-safe session access.
 *
 * @example
 * ```ts
 * @Get('profile')
 * @UseGuards(AuthGuard)
 * getProfile(@Session() session: BetterAuthSession) {
 *   return session.user;
 * }
 * ```
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { GuardedRequest } from '../guards/types';

/**
 * Session data from better-auth
 */
export interface BetterAuthSession {
  user: {
    id: string;
    email: string;
    name?: string;
    role?: string;
    image?: string;
    banned?: boolean;
    banReason?: string;
    banExpires?: Date;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    impersonatedBy?: string;
    activeOrganizationId?: string;
  };
}

/**
 * Parameter decorator to extract better-auth session from request.
 *
 * Must be used with AuthGuard to ensure session exists.
 */
export const Session = createParamDecorator(
  (data: keyof BetterAuthSession | undefined, ctx: ExecutionContext): BetterAuthSession | BetterAuthSession['user'] | BetterAuthSession['session'] | undefined => {
    const request = ctx.switchToHttp().getRequest<GuardedRequest & { betterAuthSession?: BetterAuthSession }>();
    const session = request.betterAuthSession;

    if (!session) {
      return undefined;
    }

    // If a specific key is requested, return only that part
    if (data && data in session) {
      return session[data];
    }

    return session;
  },
);
