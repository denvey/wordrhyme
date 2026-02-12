export { PermissionModule } from './permission.module';
export { PermissionKernel, PermissionDeniedError } from './permission-kernel';
export { PermissionService } from './permission.service';
export type { PluginPermissionCapability } from './permission.service';
export {
    isValidCapabilityFormat,
    CAPABILITY_PATTERN,
    ROLE_PERMISSIONS,
    SENSITIVE_CAPABILITIES,
} from './permission.types';
export type { PermissionScope } from './permission.types';
