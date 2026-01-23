import { Module } from '@nestjs/common';
import { PermissionKernel } from './permission-kernel';
import { PermissionService } from './permission.service';

/**
 * PermissionModule - Permission system module
 *
 * Provides:
 * - PermissionKernel: Core permission checking logic
 * - PermissionService: Plugin permission capability provider
 */
@Module({
    providers: [PermissionKernel, PermissionService],
    exports: [PermissionKernel, PermissionService],
})
export class PermissionModule {}
