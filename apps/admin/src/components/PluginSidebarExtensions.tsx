/**
 * PluginSidebarExtensions Component
 *
 * Renders plugin sidebar items from the Extension Registry using shadcn/ui sidebar components.
 */
import { Suspense, memo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Skeleton } from '@wordrhyme/ui';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
} from '@wordrhyme/ui';
import { useSlotExtensions, PluginErrorBoundary, type NavTarget } from '../lib/extensions';
import type { SlotEntry } from '../lib/extensions';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

function resolveIcon(iconName: string | undefined): LucideIcon | null {
    if (!iconName) return null;
    const icons = LucideIcons as unknown as Record<string, LucideIcon | undefined>;
    const icon = icons[iconName];
    if (icon) return icon;
    const pascalCase = iconName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
    return icons[pascalCase] ?? null;
}

export const PluginSidebarExtensions = memo(function PluginSidebarExtensions() {
    const entries = useSlotExtensions('nav.sidebar');
    const location = useLocation();

    if (entries.length === 0) {
        return null;
    }

    return (
        <SidebarGroup>
            <SidebarGroupLabel>Plugins</SidebarGroupLabel>
            <SidebarMenu>
                {entries.map((entry) => {
                    const target = entry.target as NavTarget;
                    return (
                        <PluginErrorBoundary key={entry.extension.id} pluginId={entry.extension.pluginId}>
                            <Suspense fallback={<Skeleton className="h-8 w-full" />}>
                                <PluginSidebarItem
                                    entry={entry}
                                    path={target.path}
                                    isActive={
                                        location.pathname === target.path ||
                                        (target.path !== '/' && location.pathname.startsWith(target.path))
                                    }
                                />
                            </Suspense>
                        </PluginErrorBoundary>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
});

function PluginSidebarItem({
    entry,
    path,
    isActive,
}: {
    entry: SlotEntry;
    path: string;
    isActive: boolean;
}) {
    const Icon = resolveIcon(entry.extension.icon);

    return (
        <SidebarMenuItem>
            <SidebarMenuButton tooltip={entry.extension.label} isActive={isActive} asChild>
                <Link to={path}>
                    {Icon && <Icon />}
                    <span>{entry.extension.label}</span>
                </Link>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}

export default PluginSidebarExtensions;
