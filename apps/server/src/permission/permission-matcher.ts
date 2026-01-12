/**
 * Permission Matcher - Pure functions for capability matching
 *
 * Stateless, framework-agnostic functions that can be:
 * - Unit tested independently
 * - Reused in frontend for UI permission checks
 * - Called from PermissionKernel or other services
 */

/**
 * Check if a required capability matches against available capabilities.
 * Supports wildcard matching: `content:*:*` matches `content:create:space`
 *
 * @param required - The capability being checked (e.g., "content:create:space")
 * @param available - Array of capabilities the user has
 * @returns true if any available capability grants the required permission
 *
 * @example
 * matchCapability("content:create:space", ["content:*:*"]) // true
 * matchCapability("content:delete:space", ["content:read:*"]) // false
 * matchCapability("*:*:*", ["*:*:*"]) // true (superadmin)
 */
export function matchCapability(required: string, available: string[]): boolean {
    for (const cap of available) {
        if (cap === required) return true;

        // Wildcard matching
        const capParts = cap.split(':');
        const reqParts = required.split(':');

        if (capParts.length !== reqParts.length) continue;

        const matches = capParts.every(
            (part, index) => part === '*' || part === reqParts[index]
        );

        if (matches) return true;
    }
    return false;
}

/**
 * Check if user has ALL of the required capabilities.
 *
 * @param requiredList - Array of capabilities that are all required
 * @param available - Array of capabilities the user has
 * @returns true only if all required capabilities are matched
 *
 * @example
 * canAll(["content:read:space", "content:create:space"], ["content:*:space"]) // true
 * canAll(["content:read:space", "member:invite:org"], ["content:*:*"]) // false
 */
export function canAll(requiredList: string[], available: string[]): boolean {
    return requiredList.every((req) => matchCapability(req, available));
}

/**
 * Check if user has ANY of the required capabilities.
 *
 * @param requiredList - Array of capabilities where at least one is needed
 * @param available - Array of capabilities the user has
 * @returns true if any required capability is matched
 *
 * @example
 * canAny(["content:create:space", "content:update:space"], ["content:create:*"]) // true
 * canAny(["member:invite:org", "role:create:org"], ["content:*:*"]) // false
 */
export function canAny(requiredList: string[], available: string[]): boolean {
    return requiredList.some((req) => matchCapability(req, available));
}

/**
 * Filter a list of capabilities to only those the user has.
 *
 * @param requiredList - Array of capabilities to filter
 * @param available - Array of capabilities the user has
 * @returns Subset of requiredList that the user has
 *
 * @example
 * filterCapabilities(
 *   ["content:create:space", "content:delete:space", "member:invite:org"],
 *   ["content:*:space"]
 * ) // ["content:create:space", "content:delete:space"]
 */
export function filterCapabilities(
    requiredList: string[],
    available: string[]
): string[] {
    return requiredList.filter((req) => matchCapability(req, available));
}

/**
 * Expand wildcard capabilities to specific capabilities.
 * Useful for UI display or permission comparison.
 *
 * @param wildcardCap - A capability that may contain wildcards
 * @param allPossible - All possible capabilities in the system
 * @returns Array of specific capabilities that the wildcard covers
 *
 * @example
 * expandWildcard("content:*:space", [
 *   "content:create:space",
 *   "content:read:space",
 *   "content:update:space",
 *   "content:delete:space",
 *   "member:invite:org"
 * ]) // ["content:create:space", "content:read:space", "content:update:space", "content:delete:space"]
 */
export function expandWildcard(
    wildcardCap: string,
    allPossible: string[]
): string[] {
    if (!wildcardCap.includes('*')) {
        return [wildcardCap];
    }
    return allPossible.filter((cap) => matchCapability(cap, [wildcardCap]));
}

/**
 * Parse a capability string into its components.
 *
 * @param capability - Capability in format "resource:action:scope"
 * @returns Parsed components or null if invalid
 *
 * @example
 * parseCapability("content:create:space")
 * // { resource: "content", action: "create", scope: "space" }
 */
export function parseCapability(capability: string): {
    resource: string;
    action: string;
    scope: string;
} | null {
    const parts = capability.split(':');
    if (parts.length !== 3) return null;

    // Safe: validated parts.length === 3 above
    return {
        resource: parts[0]!,
        action: parts[1]!,
        scope: parts[2]!,
    };
}

/**
 * Validate capability format (resource:action:scope).
 *
 * @param capability - String to validate
 * @returns true if format is valid
 */
export function isValidCapabilityFormat(capability: string): boolean {
    if (!capability || typeof capability !== 'string') return false;

    const parts = capability.split(':');
    if (parts.length !== 3) return false;

    // Each part must be non-empty and contain only valid characters
    const validPattern = /^[a-z0-9*_-]+$/i;
    return parts.every((part) => part.length > 0 && validPattern.test(part));
}
