/**
 * Auth Module
 *
 * Unified authentication module that provides:
 * - AuthGuard: Session validation
 * - RolesGuard: Role-based access control
 * - All auth decorators
 *
 * Also re-exports GuardsModule for admin operations.
 *
 * @example
 * ```ts
 * // app.module.ts
 * @Module({
 *   imports: [AuthModule],
 * })
 * export class AppModule {}
 *
 * // controller.ts
 * @Controller('users')
 * @UseGuards(AuthGuard)
 * export class UsersController {
 *   @Get('me')
 *   getMe(@CurrentUser() user: AuthUser) {
 *     return user;
 *   }
 *
 *   @Get('admin')
 *   @UseGuards(RolesGuard)
 *   @Roles('admin')
 *   adminOnly() {
 *     return { admin: true };
 *   }
 * }
 * ```
 */
import { Module, Global } from '@nestjs/common';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { GuardsModule } from './guards/guards.module';
import { TenantBanController } from './tenant-ban.controller';

@Global()
@Module({
  imports: [GuardsModule],
  controllers: [TenantBanController],
  providers: [AuthGuard, RolesGuard],
  exports: [AuthGuard, RolesGuard, GuardsModule],
})
export class AuthModule {}
