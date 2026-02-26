/**
 * useMenus Hook
 *
 * React hook for fetching and managing dynamic menus from the database via tRPC.
 * Includes utilities for building menu trees and icon resolution.
 */
import { useMemo } from 'react';
import { trpc } from '../lib/trpc';
import { useSession } from '../lib/auth-client';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Menu item from database */
export interface MenuItem {
    id: string;
    code?: string;
    source: string;
    organizationId: string;
    label: string;
    icon: string | null;
    path: string;
    openMode?: 'route' | 'external';
    parentId: string | null;
    order: number;
    requiredPermission: string | null;
    target: 'admin' | 'web';
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
    children?: MenuItem[];
}

/** Menu tree node with resolved icon */
export interface MenuTreeNode extends MenuItem {
    IconComponent: LucideIcon | null;
    children: MenuTreeNode[];
}

/**
 * Resolve a Lucide icon name to its component
 * Supports both PascalCase (LayoutDashboard) and kebab-case (layout-dashboard)
 */
export function resolveIcon(iconName: string | null): LucideIcon | null {
    if (!iconName) return null;

    // Cast to unknown first, then to our target type
    const icons = LucideIcons as unknown as Record<string, LucideIcon | undefined>;

    // Try direct lookup first (if already PascalCase)
    let icon = icons[iconName];
    if (icon) return icon;

    // Convert kebab-case to PascalCase (e.g., 'layout-dashboard' -> 'LayoutDashboard')
    const pascalCase = iconName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');

    icon = icons[pascalCase];
    return icon ?? null;
}

/**
 * Build menu tree with resolved icons
 */
function buildMenuTree(menus: MenuItem[]): MenuTreeNode[] {
    const resolveChildren = (items: MenuItem[] | undefined): MenuTreeNode[] => {
        if (!items) return [];
        return items.map(item => ({
            ...item,
            // Server payload may identify logical menu key as `code`.
            // Keep `id` stable and aligned with i18n/menu code where possible.
            id: item.code ?? item.id,
            IconComponent: resolveIcon(item.icon),
            children: item.children ? resolveChildren(item.children) : [],
        }));
    };

    return resolveChildren(menus);
}

/**
 * Static fallback menus for when tRPC is unavailable
 */
const FALLBACK_MENUS: MenuItem[] = [
    {
        id: 'core:dashboard',
        source: 'core',
        organizationId: 'default',
        label: 'Dashboard',
        icon: 'LayoutDashboard',
        path: '/',
        parentId: null,
        order: 0,
        requiredPermission: null,
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'core:plugins',
        source: 'core',
        organizationId: 'default',
        label: 'Plugins',
        icon: 'Puzzle',
        path: '/plugins',
        parentId: null,
        order: 10,
        requiredPermission: 'plugin:read:organization',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'core:members',
        source: 'core',
        organizationId: 'default',
        label: 'Members',
        icon: 'Users',
        path: '/members',
        parentId: null,
        order: 20,
        requiredPermission: 'member:read:organization',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'core:roles',
        source: 'core',
        organizationId: 'default',
        label: 'Roles',
        icon: 'ShieldCheck',
        path: '/roles',
        parentId: null,
        order: 21,
        requiredPermission: 'role:read:organization',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'core:tenant-audit',
        source: 'core',
        organizationId: 'default',
        label: 'Audit Logs',
        icon: 'History',
        path: '/audit',
        parentId: null,
        order: 21.5,
        requiredPermission: 'AuditLog:read',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'core:files',
        source: 'core',
        organizationId: 'default',
        label: 'Files',
        icon: 'FileIcon',
        path: '/files',
        parentId: null,
        order: 22,
        requiredPermission: 'file:read:organization',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'core:assets',
        source: 'core',
        organizationId: 'default',
        label: 'Assets',
        icon: 'Image',
        path: '/assets',
        parentId: null,
        order: 23,
        requiredPermission: 'asset:read:organization',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'platform:users',
        source: 'core',
        organizationId: 'default',
        label: 'Platform Users',
        icon: 'Shield',
        path: '/platform/users',
        parentId: null,
        order: 25,
        requiredPermission: 'admin',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'platform:settings',
        source: 'core',
        organizationId: 'default',
        label: 'System Settings',
        icon: 'Settings2',
        path: '/platform/settings',
        parentId: null,
        order: 26,
        requiredPermission: 'organization:update:organization',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'platform:feature-flags',
        source: 'core',
        organizationId: 'default',
        label: 'Feature Flags',
        icon: 'Flag',
        path: '/platform/feature-flags',
        parentId: null,
        order: 27,
        requiredPermission: 'organization:update:organization',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'platform:cache',
        source: 'core',
        organizationId: 'default',
        label: 'Cache Management',
        icon: 'Database',
        path: '/platform/cache',
        parentId: null,
        order: 28,
        requiredPermission: 'organization:update:organization',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'platform:plugin-health',
        source: 'core',
        organizationId: 'default',
        label: 'Plugin Health',
        icon: 'Activity',
        path: '/platform/plugin-health',
        parentId: null,
        order: 29,
        requiredPermission: 'organization:update:organization',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'platform:audit',
        source: 'core',
        organizationId: 'default',
        label: 'Audit Logs',
        icon: 'History',
        path: '/platform/audit',
        parentId: null,
        order: 30,
        requiredPermission: 'core:audit:read',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'platform:hooks',
        source: 'core',
        organizationId: 'default',
        label: 'Hooks',
        icon: 'Webhook',
        path: '/platform/hooks',
        parentId: null,
        order: 31,
        requiredPermission: 'system:read:organization',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'core:notifications',
        source: 'core',
        organizationId: 'default',
        label: 'Notifications',
        icon: 'Bell',
        path: '/notifications',
        parentId: null,
        order: 30,
        requiredPermission: null,
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'core:notification-templates',
        source: 'core',
        organizationId: 'default',
        label: 'Notification Templates',
        icon: 'FileText',
        path: '/notifications/templates',
        parentId: null,
        order: 31,
        requiredPermission: 'organization:update:organization',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'core:notification-test',
        source: 'core',
        organizationId: 'default',
        label: 'Notification Test',
        icon: 'FlaskConical',
        path: '/notifications/test',
        parentId: null,
        order: 32,
        requiredPermission: 'organization:update:organization',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'core:webhooks',
        source: 'core',
        organizationId: 'default',
        label: 'Webhooks',
        icon: 'Webhook',
        path: '/webhooks',
        parentId: null,
        order: 33,
        requiredPermission: 'Webhook:read',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'core:api-tokens',
        source: 'core',
        organizationId: 'default',
        label: 'API Tokens',
        icon: 'Key',
        path: '/api-tokens',
        parentId: null,
        order: 34,
        requiredPermission: 'core:api-tokens:read',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: 'core:settings',
        source: 'core',
        organizationId: 'default',
        label: 'Settings',
        icon: 'Settings',
        path: '/settings',
        parentId: null,
        order: 100,
        requiredPermission: 'organization:update:organization',
        target: 'admin',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
];

/**
 * Hook for loading menus from database via tRPC
 * Uses server-side role visibility filtering.
 * Only falls back to static menus if there's a network error.
 * Waits for session to be available before fetching to ensure proper authentication.
 */
export function useMenus(target: 'admin' | 'web' = 'admin') {
    // Wait for session to be available before fetching menus
    const { data: session, isPending: isSessionLoading } = useSession();
    const isAuthenticated = !!session?.user;

    const { data, isLoading, error, refetch } = trpc.menu.list.useQuery(
        { target },
        {
            // Only fetch when session is available
            enabled: isAuthenticated,
            // Retry 3 times on failure
            retry: 3,
            // Cache for 5 minutes
            staleTime: 5 * 60 * 1000,
        }
    );

    const menus = useMemo(() => {
        // If we have data from server (even empty array), use it
        // Server handles role-based visibility filtering
        if (data !== undefined) {
            return buildMenuTree(data as MenuItem[]);
        }
        // Only use fallback if there's no data yet (loading or error)
        // This ensures server-side filtering is respected
        if (error) {
            console.warn('[useMenus] Server error, using fallback menus');
            return buildMenuTree(FALLBACK_MENUS.filter(m => m.target === target));
        }
        // Still loading, return empty
        return [];
    }, [data, error, target]);

    return {
        menus,
        isLoading: isSessionLoading || isLoading,
        error,
        refetch,
    };
}

/**
 * Convenience hook for admin menus
 */
export function useAdminMenus() {
    return useMenus('admin');
}

/**
 * Convenience hook for web menus
 */
export function useWebMenus() {
    return useMenus('web');
}
