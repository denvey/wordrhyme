/**
 * Capability Parser
 *
 * Handles dual API format for permission checks:
 * 1. Legacy three-segment string: "content:read:space" -> { action: "read", subject: "Content" }
 * 2. CASL-style: ("read", "Content") -> { action: "read", subject: "Content" }
 *
 * This allows gradual migration from legacy format to CASL while maintaining backwards compatibility.
 */

/**
 * Parsed capability result
 */
export interface ParsedCapability {
    action: string;
    subject: string;
    /** The subject instance for ABAC checks (e.g., the actual article being accessed) */
    subjectInstance?: unknown;
}

/**
 * Resource to Subject mapping
 * Maps legacy resource names to CASL subject names
 */
const RESOURCE_TO_SUBJECT: Record<string, string> = {
    content: 'Content',
    user: 'User',
    organization: 'Organization',
    team: 'Team',
    menu: 'Menu',
    plugin: 'Plugin',
    role: 'Role',
    permission: 'Permission',
    audit: 'AuditLog',
    core: 'Core',
};

/**
 * Action aliases for legacy format
 */
const ACTION_ALIASES: Record<string, string> = {
    manage: 'manage',
    read: 'read',
    create: 'create',
    update: 'update',
    delete: 'delete',
    '*': 'manage',
};

/**
 * Parse a capability from various input formats
 *
 * @param input - The capability input (string or tuple)
 * @param subjectInstance - Optional subject instance for ABAC checks
 * @returns Parsed capability with action and subject
 *
 * @example
 * // Legacy three-segment format
 * parseCapability("content:read:space")
 * // { action: "read", subject: "Content" }
 *
 * // CASL-style tuple (via overload)
 * parseCapability("read", "Content")
 * // { action: "read", subject: "Content" }
 *
 * // With subject instance
 * parseCapability("read", "Content", { id: "123", ownerId: "456" })
 * // { action: "read", subject: "Content", subjectInstance: { id: "123", ownerId: "456" } }
 *
 * // Plugin capability format
 * parseCapability("plugin:com.vendor.seo:settings.read")
 * // { action: "read", subject: "plugin:com.vendor.seo:settings" }
 */
export function parseCapability(capability: string): ParsedCapability;
export function parseCapability(action: string, subject: string, subjectInstance?: unknown): ParsedCapability;
export function parseCapability(
    actionOrCapability: string,
    subject?: string,
    subjectInstance?: unknown
): ParsedCapability {
    // CASL-style: (action, subject, ?instance)
    if (subject !== undefined) {
        return {
            action: actionOrCapability,
            subject,
            subjectInstance,
        };
    }

    // Legacy three-segment string format
    const capability = actionOrCapability;
    const parts = capability.split(':');

    if (parts.length < 2) {
        // Invalid format, return as-is
        return {
            action: 'manage',
            subject: capability,
        };
    }

    // Handle wildcard superadmin
    if (capability === '*:*:*') {
        return {
            action: 'manage',
            subject: 'all',
        };
    }

    // Handle plugin capability format: plugin:pluginId:action or plugin:pluginId:resource.action
    if (parts[0] === 'plugin' && parts.length >= 3) {
        const pluginId = parts[1]!;
        const actionPart = parts.slice(2).join(':');

        // Check if actionPart contains a dot (resource.action format)
        const dotIndex = actionPart.lastIndexOf('.');
        if (dotIndex !== -1) {
            const resource = actionPart.substring(0, dotIndex);
            const action = actionPart.substring(dotIndex + 1);
            return {
                action: normalizeAction(action),
                subject: `plugin:${pluginId}:${resource}`,
            };
        }

        // Simple plugin action
        return {
            action: normalizeAction(actionPart),
            subject: `plugin:${pluginId}`,
        };
    }

    // Standard format: resource:action:scope (scope is ignored for CASL)
    const resource = parts[0]!;
    const action = parts[1]!;

    return {
        action: normalizeAction(action),
        subject: normalizeSubject(resource),
    };
}

/**
 * Normalize action to CASL format
 */
function normalizeAction(action: string): string {
    return ACTION_ALIASES[action.toLowerCase()] ?? action.toLowerCase();
}

/**
 * Normalize resource to CASL subject format
 */
function normalizeSubject(resource: string): string {
    const lower = resource.toLowerCase();
    return RESOURCE_TO_SUBJECT[lower] ?? capitalize(lower);
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Check if a capability string is in legacy format
 */
export function isLegacyFormat(capability: string): boolean {
    const parts = capability.split(':');
    return parts.length === 3 && !capability.startsWith('plugin:');
}

/**
 * Convert legacy capability to CASL format string
 *
 * @example
 * legacyToCasl("content:read:space") // "read Content"
 * legacyToCasl("*:*:*") // "manage all"
 */
export function legacyToCasl(capability: string): string {
    const parsed = parseCapability(capability);
    return `${parsed.action} ${parsed.subject}`;
}

/**
 * Convert plugin permission key to CASL format
 *
 * Plugin manifest format: "settings.read" or just "read"
 * Result subject: "plugin:{pluginId}:settings" or "plugin:{pluginId}"
 *
 * @example
 * pluginPermissionToCasl("settings.read", "com.vendor.seo")
 * // { action: "read", subject: "plugin:com.vendor.seo:settings" }
 *
 * pluginPermissionToCasl("manage", "com.vendor.seo")
 * // { action: "manage", subject: "plugin:com.vendor.seo" }
 */
export function pluginPermissionToCasl(
    permissionKey: string,
    pluginId: string
): ParsedCapability {
    const dotIndex = permissionKey.lastIndexOf('.');
    if (dotIndex !== -1) {
        const resource = permissionKey.substring(0, dotIndex);
        const action = permissionKey.substring(dotIndex + 1);
        return {
            action: normalizeAction(action),
            subject: `plugin:${pluginId}:${resource}`,
        };
    }

    return {
        action: normalizeAction(permissionKey),
        subject: `plugin:${pluginId}`,
    };
}
