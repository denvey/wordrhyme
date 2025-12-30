/**
 * PluginSidebarExtensions Component
 *
 * Renders plugin sidebar items from the Extension Registry using shadcn/ui sidebar components.
 */
import React, { Suspense, memo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Skeleton } from '@wordrhyme/ui';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
} from '@wordrhyme/ui';
import { useExtensions, PluginErrorBoundary } from './PluginUILoader';
import { ExtensionPoint, type SidebarExtension } from '../lib/extensions';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Resolve icon name to component
 */
function resolveIcon(iconName: string | undefined): LucideIcon | null {
    if (!iconName) return null;
    const icons = LucideIcons as unknown as Record<string, LucideIcon | undefined>;
    const icon = icons[iconName];
    if (icon) return icon;
    // Try PascalCase
    const pascalCase = iconName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
    return icons[pascalCase] ?? null;
}

/**
 * Render plugin sidebar extensions using shadcn/ui sidebar components
 */
export const PluginSidebarExtensions = memo(function PluginSidebarExtensions() {
    const extensions = useExtensions();
    const location = useLocation();

    // Filter to sidebar extensions only
    const sidebarExtensions = extensions.filter(
        (ext): ext is SidebarExtension => ext.type === ExtensionPoint.SIDEBAR
    );

    if (sidebarExtensions.length === 0) {
        return null;
    }

    return (
        <SidebarGroup>
            <SidebarGroupLabel>Plugins</SidebarGroupLabel>
            <SidebarMenu>
                {sidebarExtensions.map((ext) => (
                    <PluginErrorBoundary key={ext.id} pluginId={ext.pluginId}>
                        <Suspense fallback={<Skeleton className="h-8 w-full" />}>
                            <PluginSidebarItem
                                extension={ext}
                                isActive={
                                    location.pathname === ext.path ||
                                    (ext.path !== '/' && location.pathname.startsWith(ext.path))
                                }
                            />
                        </Suspense>
                    </PluginErrorBoundary>
                ))}
            </SidebarMenu>
        </SidebarGroup>
    );
});

/**
 * Individual plugin sidebar item
 */
function PluginSidebarItem({
    extension,
    isActive,
}: {
    extension: SidebarExtension;
    isActive: boolean;
}) {
    const Icon = resolveIcon(extension.icon);

    return (
        <SidebarMenuItem>
            <SidebarMenuButton tooltip={extension.label} isActive={isActive} asChild>
                <Link to={extension.path}>
                    {Icon && <Icon />}
                    <span>{extension.label}</span>
                </Link>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}

export default PluginSidebarExtensions;
