export { PermissionModule } from './permission.module';
export { PermissionKernel, PermissionDeniedError } from './permission-kernel';
export { PermissionService, PluginPermissionCapability } from './permission.service';
export {
    PermissionScope,
    isValidCapabilityFormat,
    CAPABILITY_PATTERN,
    ROLE_PERMISSIONS,
    SENSITIVE_CAPABILITIES,
} from './permission.types';
