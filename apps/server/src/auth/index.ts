/**
 * Auth Module Exports
 *
 * Provides unified authentication for NestJS with better-auth:
 *
 * Module:
 * - AuthModule: Import this in your app module
 *
 * Guards:
 * - AuthGuard: Validates session (use with @UseGuards)
 * - RolesGuard: Enforces role-based access (use with @Roles)
 *
 * Decorators:
 * - @Session(): Extract full session
 * - @CurrentUser(): Extract current user
 * - @Roles(...roles): Specify required roles
 * - @Public(): Mark route as public
 *
 * @example
 * ```ts
 * // app.module.ts
 * import { AuthModule } from './auth';
 *
 * @Module({ imports: [AuthModule] })
 * export class AppModule {}
 *
 * // controller.ts
 * import { AuthGuard, RolesGuard, CurrentUser, Roles, Public } from './auth';
 *
 * @Controller('users')
 * @UseGuards(AuthGuard)
 * export class UsersController {
 *   @Get('me')
 *   getMe(@CurrentUser() user) {
 *     return user;
 *   }
 *
 *   @Get('admin')
 *   @UseGuards(RolesGuard)
 *   @Roles('admin')
 *   adminOnly() {
 *     return { admin: true };
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

// Core auth instance
export { auth, type Auth } from './auth';

// Module
export { AuthModule } from './auth.module';

// Decorators
export {
  Session,
  type BetterAuthSession,
  CurrentUser,
  Roles,
  ROLES_KEY,
  Public,
  IS_PUBLIC_KEY,
} from './decorators';

// Guard Chain for admin operations
export * from './guards';
