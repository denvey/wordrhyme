/**
 * useMenus Hook
 *
 * React hook for fetching and managing dynamic menus from the database via tRPC.
 * Includes utilities for building menu trees and icon resolution.
 */
import { useMemo } from 'react';
import { trpc } from '../lib/trpc';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Menu item from database */
export interface MenuItem {
    id: string;
    source: string;
    organizationId: string;
    label: string;
    icon: string | null;
    path: string;
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
        id: 'platform:users',
        source: 'core',
        organizationId: 'default',
        label: 'Platform Users',
        icon: 'Shield',
        path: '/platform/users',
        parentId: null,
        order: 25,
        requiredPermission: 'platform-admin',
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
 * Falls back to static menus if server is unavailable
 */
export function useMenus(target: 'admin' | 'web' = 'admin') {
    const { data, isLoading, error, refetch } = trpc.menu.list.useQuery(
        { target },
        {
            // Retry 3 times on failure
            retry: 3,
            // Cache for 5 minutes
            staleTime: 5 * 60 * 1000,
        }
    );

    const menus = useMemo(() => {
        if (data && data.length > 0) {
            return buildMenuTree(data as MenuItem[]);
        }
        // Use fallback menus filtered by target
        return buildMenuTree(FALLBACK_MENUS.filter(m => m.target === target));
    }, [data, target]);

    return {
        menus,
        isLoading,
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
