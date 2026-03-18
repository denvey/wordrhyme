import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
/**
 * useMenus Hook
 *
 * React hook for fetching and managing dynamic menus from the database via tRPC.
 * Includes utilities for building menu trees and icon resolution.
 */
import { useMemo } from "react";
import { useSession } from "../lib/auth-client";
import { trpc } from "../lib/trpc";

/** Menu item from database */
export interface MenuItem {
    id: string;
    code?: string;
    source: string;
    organizationId: string;
    label: string;
    icon: string | null;
    path: string;
    openMode?: "route" | "external";
    parentId: string | null;
    order: number;
    requiredPermission: string | null;
    target: "admin" | "web";
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
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join("");

    icon = icons[pascalCase];
    return icon ?? null;
}

/**
 * Build menu tree with resolved icons
 */
function buildMenuTree(menus: MenuItem[]): MenuTreeNode[] {
    const resolveChildren = (items: MenuItem[] | undefined): MenuTreeNode[] => {
        if (!items) return [];
        return items.map((item) => ({
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
 * Hook for loading menus from database via tRPC
 * Uses server-side role visibility filtering.
 * Waits for session to be available before fetching to ensure proper authentication.
 */
export function useMenus(target: "admin" | "web" = "admin") {
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
        },
    );

    const menus = useMemo(() => {
        // If we have data from server (even empty array), use it
        // Server handles role-based visibility filtering
        if (data !== undefined) {
            return buildMenuTree(data as MenuItem[]);
        }
        // Loading or error: let the caller render loading/error state
        return [];
    }, [data]);

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
    return useMenus("admin");
}

/**
 * Convenience hook for web menus
 */
export function useWebMenus() {
    return useMenus("web");
}
