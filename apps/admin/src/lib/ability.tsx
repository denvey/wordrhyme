import { type MongoAbility, type RawRuleOf, createMongoAbility } from "@casl/ability";
import { createContextualCan } from "@casl/react";
/**
 * CASL Ability Context
 *
 * Provides permission checking throughout the application.
 * Fetches user's permission rules from backend and creates CASL ability.
 */
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./auth";
import { trpc } from "./trpc";

/**
 * Application subjects - resources that can be protected
 *
 * Note:
 * - 'User' = Global user operations (platform admin level)
 * - 'Member' = Organization member operations (org admin level)
 */
export type AppSubject =
    | "all"
    | "User"
    | "Member"
    | "Organization"
    | "Team"
    | "Content"
    | "Menu"
    | "Plugin"
    | "Role"
    | "Permission"
    | "AuditLog"
    | "Settings"
    | "FeatureFlag"
    | "PlatformOAuth";

/**
 * Application actions - operations on resources
 */
export type AppAction = "manage" | "create" | "read" | "update" | "delete" | "invite" | "remove";

/**
 * Application ability type
 */
export type AppAbility = MongoAbility<[AppAction, AppSubject]>;

/**
 * Default empty ability (no permissions)
 */
const defaultAbility = createMongoAbility<[AppAction, AppSubject]>([]);

/**
 * Ability context
 */
const AbilityContext = createContext<AppAbility>(defaultAbility);

/**
 * CASL Can component - use for declarative permission checks
 * @example <Can I="update" a="Settings">...</Can>
 */
export const Can = createContextualCan(AbilityContext.Consumer);

/**
 * Hook to access current user's ability
 * @example const ability = useAbility(); if (ability.can('manage', 'Settings')) { ... }
 */
export function useAbility(): AppAbility {
    return useContext(AbilityContext);
}

/**
 * Hook to check a specific permission
 * @example const canManageSettings = useCan('manage', 'Settings');
 */
export function useCan(action: AppAction, subject: AppSubject): boolean {
    const ability = useAbility();
    return ability.can(action, subject);
}

/**
 * Hook to check multiple permissions
 * @example const { canRead, canUpdate } = usePermissions({ canRead: ['read', 'Settings'], canUpdate: ['update', 'Settings'] });
 */
export function usePermissions<T extends Record<string, [AppAction, AppSubject]>>(
    permissions: T,
): Record<keyof T, boolean> {
    const ability = useAbility();
    const result = {} as Record<keyof T, boolean>;

    for (const [key, [action, subject]] of Object.entries(permissions)) {
        result[key as keyof T] = ability.can(action, subject);
    }

    return result;
}

interface AbilityProviderProps {
    children: ReactNode;
}

/**
 * AbilityProvider - wraps the app to provide permission context
 *
 * Fetches user's permission rules from backend and creates CASL ability.
 * Must be placed inside tRPC provider and after authentication.
 */
export function AbilityProvider({ children }: AbilityProviderProps) {
    const { isAuthenticated } = useAuth();
    const [ability, setAbility] = useState<AppAbility>(defaultAbility);

    // Fetch user's permission rules from backend (only when authenticated)
    const { data: rulesData, isLoading } = trpc.permissions.myRules.useQuery(undefined, {
        enabled: isAuthenticated,
        // Refetch when window regains focus (user might have changed roles)
        refetchOnWindowFocus: true,
        // Cache for 5 minutes
        staleTime: 5 * 60 * 1000,
        // Don't throw on error, just use empty permissions
        retry: 1,
    });

    // Update ability when rules change
    useEffect(() => {
        if (rulesData?.rules) {
            const rules = rulesData.rules as RawRuleOf<AppAbility>[];
            const newAbility = createMongoAbility<[AppAction, AppSubject]>(rules);
            setAbility(newAbility);
        }
    }, [rulesData]);

    // Show loading state or provide ability
    if (isLoading) {
        // Use empty ability while loading - pages should handle this gracefully
        return <AbilityContext.Provider value={defaultAbility}>{children}</AbilityContext.Provider>;
    }

    return <AbilityContext.Provider value={ability}>{children}</AbilityContext.Provider>;
}

/**
 * Permission constants for common checks
 */
export const Permissions = {
    // Member permissions (organization-level member operations)
    MEMBER_READ: ["read", "Member"] as [AppAction, AppSubject],
    MEMBER_INVITE: ["invite", "Member"] as [AppAction, AppSubject],
    MEMBER_UPDATE: ["update", "Member"] as [AppAction, AppSubject],
    MEMBER_REMOVE: ["remove", "Member"] as [AppAction, AppSubject],

    // Role permissions (system-reserved, should be greyed out in UI)
    ROLE_READ: ["read", "Role"] as [AppAction, AppSubject],
    ROLE_MANAGE: ["manage", "Role"] as [AppAction, AppSubject],

    // Settings permissions
    SETTINGS_READ: ["read", "Settings"] as [AppAction, AppSubject],
    SETTINGS_MANAGE: ["manage", "Settings"] as [AppAction, AppSubject],
    SETTINGS_UPDATE: ["update", "Settings"] as [AppAction, AppSubject],

    // Feature Flag permissions
    FEATURE_FLAG_READ: ["read", "FeatureFlag"] as [AppAction, AppSubject],
    FEATURE_FLAG_MANAGE: ["manage", "FeatureFlag"] as [AppAction, AppSubject],
    FEATURE_FLAG_UPDATE: ["update", "FeatureFlag"] as [AppAction, AppSubject],

    // Organization permissions
    ORG_MANAGE: ["manage", "Organization"] as [AppAction, AppSubject],
    ORG_UPDATE: ["update", "Organization"] as [AppAction, AppSubject],

    // Super admin (all permissions)
    SUPER_ADMIN: ["manage", "all"] as [AppAction, AppSubject],
} as const;
