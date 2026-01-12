export { PermissionModule } from './permission.module';
export { PermissionKernel, PermissionDeniedError } from './permission-kernel';
export { PermissionService } from './permission.service';
export type { PluginPermissionCapability } from './permission.service';
export type { PermissionScope, PermissionContext } from './permission.types';
export {
    isValidCapabilityFormat,
    CAPABILITY_PATTERN,
    SENSITIVE_CAPABILITIES,
} from './permission.types';

// CASL exports
export {
    createAppAbility,
    createAbilityFromRules,
    loadRulesFromDB,
    interpolateConditions,
    type AppAbility,
    type AppActions,
    type AppSubjects,
    type AbilityUserContext,
} from './casl-ability';

export {
    parseCapability,
    pluginPermissionToCasl,
    isLegacyFormat,
    legacyToCasl,
    type ParsedCapability,
} from './capability-parser';
