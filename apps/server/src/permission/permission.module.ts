import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { PermissionKernel } from './permission-kernel';
import { PermissionService } from './permission.service';
import { PermissionCache } from './permission-cache';

/**
 * PermissionModule - Permission system module
 *
 * Provides:
 * - PermissionKernel: Core permission checking logic
 * - PermissionService: Plugin permission capability provider
 * - PermissionCache: Redis-based permission caching
 */
@Module({
    imports: [CacheModule],
    providers: [PermissionKernel, PermissionService, PermissionCache],
    exports: [PermissionKernel, PermissionService, PermissionCache],
})
export class PermissionModule {}
