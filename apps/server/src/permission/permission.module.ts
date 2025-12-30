import { Global, Module } from '@nestjs/common';
import { PermissionKernel } from './permission-kernel';
import { PermissionService } from './permission.service';

/**
 * PermissionModule - Centralized authorization
 * 
 * Provides the PermissionKernel and PermissionService globally.
 * Implements white-list authorization per PERMISSION_GOVERNANCE.md.
 */
@Global()
@Module({
    providers: [PermissionKernel, PermissionService],
    exports: [PermissionKernel, PermissionService],
})
export class PermissionModule { }
