/**
 * Layout Component
 *
 * Main layout using shadcn/ui sidebar-07 template structure.
 * Includes dynamic menu loading, plugin extensions, theme toggle, and user authentication.
 */
import { Outlet } from 'react-router-dom';
import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
    SidebarProvider,
    SidebarInset,
    SidebarTrigger,
    Skeleton,
    Separator,
    Breadcrumb,
    BreadcrumbList,
    BreadcrumbItem,
    BreadcrumbPage,
} from '@wordrhyme/ui';
import { useAuth } from '../lib/auth';
import { useSession } from '../lib/auth-client';
import { useAdminMenus, type MenuTreeNode } from '../hooks/useMenus';
import { SidebarHeaderContent } from './sidebar-header';
import { NavMain, type NavMainItem } from './nav-main';
import { NavUser } from './nav-user';
import { PluginSidebarExtensions } from './PluginSidebarExtensions';
import { PluginUILoader } from './PluginUILoader';
import { ImpersonationBanner } from './ImpersonationBanner';

/**
 * Convert MenuTreeNode to NavMainItem format
 */
function convertMenuToNavItem(menu: MenuTreeNode): NavMainItem {
    return {
        id: menu.id,
        title: menu.label,
        url: menu.path,
        icon: menu.IconComponent,
        isActive: false,
        items: menu.children?.map(child => ({
            id: child.id,
            title: child.label,
            url: child.path,
        })),
    };
}

export function Layout() {
    const { user, logout } = useAuth();
    const { data: session } = useSession();
    const { menus, isLoading, error } = useAdminMenus();

    // Filter menus based on user role
    const filteredMenus = useMemo(() => {
        const userRole = session?.user?.role;
        return menus.filter((menu) => {
            // Platform-admin only menus
            if (menu.requiredPermission === 'platform-admin') {
                return userRole === 'platform-admin';
            }
            return true;
        });
    }, [menus, session?.user?.role]);

    // Convert menus to NavMainItem format
    const navItems = useMemo(() => {
        return filteredMenus.map(convertMenuToNavItem);
    }, [filteredMenus]);

    // Prepare user data for NavUser
    const userData = useMemo(() => {
        if (!user) return null;
        return {
            name: user.name || user.email.split('@')[0] || 'User',
            email: user.email,
        };
    }, [user]);

    return (
        <PluginUILoader>
            <SidebarProvider>
                <Sidebar collapsible="icon">
                    <SidebarHeader>
                        <SidebarHeaderContent />
                    </SidebarHeader>
                    <SidebarContent>
                        {isLoading ? (
                            // Show skeleton while loading
                            <div className="p-4 space-y-2">
                                <Skeleton className="h-8 w-full" />
                                <Skeleton className="h-8 w-full" />
                                <Skeleton className="h-8 w-full" />
                            </div>
                        ) : error ? (
                            // Show error state
                            <div className="p-4 flex items-center gap-2 text-destructive text-sm">
                                <AlertCircle className="h-4 w-4" />
                                <span>Failed to load menus</span>
                            </div>
                        ) : (
                            // Render navigation
                            <NavMain items={navItems} label="Platform" />
                        )}

                        {/* Plugin sidebar extensions */}
                        <PluginSidebarExtensions />
                    </SidebarContent>
                    <SidebarFooter>
                        {userData && (
                            <NavUser user={userData} onLogout={logout} />
                        )}
                    </SidebarFooter>
                    <SidebarRail />
                </Sidebar>
                <SidebarInset data-slot="sidebar-inset">
                    <ImpersonationBanner />
                    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem>
                                    <BreadcrumbPage>Admin Console</BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </header>
                    <main className="flex-1 p-6">
                        <Outlet />
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </PluginUILoader>
    );
}
