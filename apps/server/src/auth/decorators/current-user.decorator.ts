/**
 * CurrentUser Decorator
 *
 * Extracts the current user from better-auth session.
 * Shorthand for @Session('user').
 *
 * @example
 * ```ts
 * @Get('profile')
 * @UseGuards(AuthGuard)
 * getProfile(@CurrentUser() user: AuthUser) {
 *   return { id: user.id, email: user.email };
 * }
 *
 * // Or extract specific property
 * @Get('my-id')
 * @UseGuards(AuthGuard)
 * getMyId(@CurrentUser('id') userId: string) {
 *   return { userId };
 * }
 * ```
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { GuardedRequest } from '../guards/types';
import type { BetterAuthSession } from './session.decorator';

type UserProperty = keyof BetterAuthSession['user'];

/**
 * Parameter decorator to extract current user from request.
 *
 * Must be used with AuthGuard to ensure user exists.
 */
export const CurrentUser = createParamDecorator(
  (data: UserProperty | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<GuardedRequest & { betterAuthSession?: BetterAuthSession }>();
    const user = request.betterAuthSession?.user;

    if (!user) {
      return undefined;
    }

    // If a specific property is requested, return only that
    if (data && data in user) {
      return user[data];
    }

    return user;
  },
);
