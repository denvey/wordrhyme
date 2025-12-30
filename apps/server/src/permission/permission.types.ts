/**
 * Permission Scope - Defines the context for permission checks
 */
export interface PermissionScope {
    tenantId: string;
    spaceId?: string | undefined;
    projectId?: string | undefined;
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
 * Role permission mappings (hardcoded for MVP)
 * In production, this would be loaded from database
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
    admin: [
        // Full access (wildcard)
        '*:*:*',
    ],
    editor: [
        'content:*:*',
        'media:*:*',
    ],
    viewer: [
        'content:read:*',
        'media:read:*',
    ],
};
