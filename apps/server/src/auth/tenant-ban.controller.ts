/**
 * TenantBan Controller
 *
 * Exposes tenant-level ban/unban API endpoints.
 * Uses TenantBanService for tenant-scoped bans (not global bans).
 */
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { TenantBanService, BanUserDto } from './guards/tenant-ban.service';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthUser } from './guards/types';

interface BanUserBody {
  userId: string;
  reason?: string;
  expiresIn?: number;
}

interface UnbanUserBody {
  userId: string;
}

@Controller('api/tenant-admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class TenantBanController {
  constructor(private readonly tenantBanService: TenantBanService) {}

  @Post('ban-user')
  async banUser(
    @Body() body: BanUserBody,
    @Headers('x-org-id') organizationId: string,
    @CurrentUser() admin: AuthUser,
  ) {
    if (!organizationId) {
      throw new BadRequestException('X-Org-Id header required');
    }
    if (!body.userId) {
      throw new BadRequestException('userId is required');
    }

    const dto: BanUserDto = {};
    if (body.reason) dto.reason = body.reason;
    if (body.expiresIn) dto.expiresIn = body.expiresIn;

    return this.tenantBanService.banUserInTenant(
      body.userId,
      organizationId,
      admin.id,
      dto,
    );
  }

  @Post('unban-user')
  async unbanUser(
    @Body() body: UnbanUserBody,
    @Headers('x-org-id') organizationId: string,
    @CurrentUser() admin: AuthUser,
  ) {
    if (!organizationId) {
      throw new BadRequestException('X-Org-Id header required');
    }
    if (!body.userId) {
      throw new BadRequestException('userId is required');
    }

    return this.tenantBanService.unbanUserInTenant(
      body.userId,
      organizationId,
      admin.id,
    );
  }
}
