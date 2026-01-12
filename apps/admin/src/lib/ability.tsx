/**
 * CASL Ability Context
 *
 * Provides permission checking throughout the application.
 * Fetches user's permission rules from backend and creates CASL ability.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createMongoAbility, type MongoAbility, type RawRuleOf } from '@casl/ability';
import { createContextualCan } from '@casl/react';
import { trpc } from './trpc';

/**
 * Application subjects - resources that can be protected
 */
export type AppSubject =
    | 'all'
    | 'User'
    | 'Organization'
    | 'Team'
    | 'Content'
    | 'Menu'
    | 'Plugin'
    | 'Role'
    | 'Permission'
    | 'AuditLog'
    | 'Settings'
    | 'FeatureFlag';

/**
 * Application actions - operations on resources
 */
export type AppAction = 'manage' | 'create' | 'read' | 'update' | 'delete';

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
    permissions: T
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
    const [ability, setAbility] = useState<AppAbility>(defaultAbility);

    // Fetch user's permission rules from backend
    const { data: rulesData, isLoading } = trpc.permissions.myRules.useQuery(undefined, {
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
        return (
            <AbilityContext.Provider value={defaultAbility}>
                {children}
            </AbilityContext.Provider>
        );
    }

    return (
        <AbilityContext.Provider value={ability}>
            {children}
        </AbilityContext.Provider>
    );
}

/**
 * Permission constants for common checks
 */
export const Permissions = {
    // Settings permissions
    SETTINGS_READ: ['read', 'Settings'] as [AppAction, AppSubject],
    SETTINGS_MANAGE: ['manage', 'Settings'] as [AppAction, AppSubject],
    SETTINGS_UPDATE: ['update', 'Settings'] as [AppAction, AppSubject],

    // Feature Flag permissions
    FEATURE_FLAG_READ: ['read', 'FeatureFlag'] as [AppAction, AppSubject],
    FEATURE_FLAG_MANAGE: ['manage', 'FeatureFlag'] as [AppAction, AppSubject],
    FEATURE_FLAG_UPDATE: ['update', 'FeatureFlag'] as [AppAction, AppSubject],

    // Organization permissions
    ORG_MANAGE: ['manage', 'Organization'] as [AppAction, AppSubject],
    ORG_UPDATE: ['update', 'Organization'] as [AppAction, AppSubject],

    // Super admin (all permissions)
    SUPER_ADMIN: ['manage', 'all'] as [AppAction, AppSubject],
} as const;
