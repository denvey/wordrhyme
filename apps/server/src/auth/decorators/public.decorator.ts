/**
 * Public Decorator
 *
 * Marks a route as public, bypassing AuthGuard.
 * Useful when AuthGuard is applied globally but specific routes should be public.
 *
 * @example
 * ```ts
 * @Get('health')
 * @Public()
 * healthCheck() {
 *   return { status: 'ok' };
 * }
 * ```
 */
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to mark a route as public (no authentication required).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
