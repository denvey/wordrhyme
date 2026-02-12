/**
 * Permission Scope - Defines the context for permission checks
 */
export interface PermissionScope {
    organizationId: string;
    spaceId?: string | undefined;
    projectId?: string | undefined;
}

/**
 * Permission Context - User context for permission evaluation
 * Can be passed explicitly or retrieved from AsyncLocalStorage
 */
export interface PermissionContext {
    requestId: string;
    userId?: string | undefined;
    organizationId?: string | undefined;
    userRole?: string | undefined;
    userRoles?: string[] | undefined;
    currentTeamId?: string | undefined;
}

/**
 * Capability format: `resource:action:scope`
 * Examples:
 * - core:users:manage
 * - content:create:space
 * - plugin:com.vendor.seo:settings.read
 */
export const CAPABILITY_PATTERN = /^[a-z_]+:[a-z_*]+:[a-z_*]+$/;

/**
 * Validate capability format
 */
export function isValidCapabilityFormat(capability: string): boolean {
    return CAPABILITY_PATTERN.test(capability);
}

/**
 * Sensitive capabilities that always require audit logging
 */
export const SENSITIVE_CAPABILITIES = [
    'plugin:install:*',
    'plugin:uninstall:*',
    'core:users:manage',
    'core:users:delete',
    'core:organization:delete',
];

/**
 * Role-Permission Mapping (MVP: In-memory constant)
 *
 * Maps roles to capabilities. In production, this would be a database table.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
    owner: ['*:*:*'],
    admin: ['organization:*:*', 'plugin:*:*', 'user:manage:*', 'content:*:*'],
    editor: ['content:create:space', 'content:update:own', 'content:read:*'],
    member: ['content:read:space', 'content:comment:*'],
    viewer: ['content:read:public'],
};
