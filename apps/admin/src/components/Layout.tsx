/**
 * Layout Component
 *
 * Main layout using shadcn/ui sidebar-07 template structure.
 * Includes dynamic menu loading, plugin extensions, organization switching, and user authentication.
 */
import { Outlet, useNavigate } from 'react-router-dom';
import { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { toast } from 'sonner';
import { useAuth } from '../lib/auth';
import { useSession, useListOrganizations, organization as orgApi } from '../lib/auth-client';
import { useAdminMenus, type MenuTreeNode } from '../hooks/useMenus';
import { TeamSwitcher } from './team-switcher';
import { NavMain, type NavMainItem } from './nav-main';
import { NavUser } from './nav-user';
import { PluginSidebarExtensions } from './PluginSidebarExtensions';
import { PluginUILoader } from './PluginUILoader';
import { ImpersonationBanner } from './ImpersonationBanner';
import { NotificationCenter } from './NotificationCenter';
import { LanguageSwitcher } from './i18n';
import { CurrencySwitcher } from './currency';
import { trpc } from '../lib/trpc';

/**
 * Convert MenuTreeNode to NavMainItem format (recursive)
 */
function convertMenuToNavItem(menu: MenuTreeNode): NavMainItem {
    return {
        id: menu.id,
        title: menu.label,
        url: menu.path,  // Can be null for directory nodes
        openMode: menu.openMode,
        icon: menu.IconComponent,
        isActive: false,
        items: menu.children?.map(child => convertMenuToNavItem(child)),  // Recursive
    };
}

export function Layout() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { data: session } = useSession();
    const { menus, isLoading, error } = useAdminMenus();

    // Get user's organizations using Better Auth native API
    const { data: orgsData, isPending: isLoadingOrgs } = useListOrganizations();
    const organizations = orgsData ?? [];

    // Get active organization ID from session
    const activeOrgId = (session?.session as { activeOrganizationId?: string })?.activeOrganizationId;

    // Get current user's role in the active organization
    const { data: activeMember } = useQuery({
        queryKey: ['activeMember', activeOrgId],
        queryFn: async () => {
            const res = await orgApi.getActiveMember();
            return res.data;
        },
        enabled: !!activeOrgId,
    });

    // Switch organization mutation (using tRPC for ban check + audit logging)
    const switchOrg = trpc.organization.setActive.useMutation({
        onSuccess: async () => {
            // Success toast
            toast.success('Organization switched successfully');

            // Wait for Better Auth session cookie to propagate
            await new Promise(resolve => setTimeout(resolve, 300));

            // Reload page to refresh all state (session, menus, permissions)
            window.location.href = '/';
        },
        onError: (error: { message?: string }) => {
            console.error('[Layout] Switch organization error:', error);
            toast.error(error.message || 'Failed to switch organization');
        },
    });

    // Handle organization switch
    const handleSwitchTeam = async (teamId: string) => {
        if (teamId === activeOrgId) return; // Already active
        await switchOrg.mutateAsync({ organizationId: teamId });
    };

    // Handle create organization
    const handleCreateTeam = () => {
        navigate('/organizations/new');
    };

    // Convert organizations to TeamSwitcher format
    const teams = useMemo(() => {
        const activeRole = activeMember?.role;
        return organizations.map((org) => ({
            id: org.id,
            name: org.name,
            logo: org.logo ?? null,
            plan: org.id === activeOrgId && activeRole
                ? activeRole.charAt(0).toUpperCase() + activeRole.slice(1)
                : '',
        }));
    }, [organizations, activeOrgId, activeMember]);

    // ✅ Check for missing activeOrganizationId and guide user to select organization
    useEffect(() => {
        // Only check after session and organizations are loaded
        if (!session || isLoadingOrgs) return;

        // If user is logged in but has no active organization
        if (session.user && !activeOrgId) {
            // If user has organizations, auto-select the first one
            if (organizations.length > 0) {
                console.log('[Layout] No activeOrganizationId, auto-selecting first organization:', organizations[0].id);
                toast.warning('请选择一个组织继续操作');
                switchOrg.mutate({ organizationId: organizations[0].id });
            } else {
                // No organizations available - guide user to create one
                toast.warning('请先创建一个组织');
                navigate('/organizations/new');
            }
        }
    }, [session, activeOrgId, isLoadingOrgs, organizations, switchOrg, navigate]);

    // Convert menus to NavMainItem format
    // Backend already filters menus based on user permissions
    const navItems = useMemo(() => {
        return menus.map(convertMenuToNavItem);
    }, [menus]);

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
                        <TeamSwitcher
                            teams={teams}
                            activeTeamId={activeOrgId}
                            isLoading={isLoadingOrgs}
                            onSwitchTeam={handleSwitchTeam}
                            onCreateTeam={handleCreateTeam}
                        />
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
                            <NavMain items={navItems} label="System" />
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
                <SidebarInset data-slot="sidebar-inset" className="min-w-0">
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
                        <div className="ml-auto flex items-center gap-2">
                            <CurrencySwitcher className="w-[100px]" />
                            <LanguageSwitcher compact />
                            <NotificationCenter />
                        </div>
                    </header>
                    <main className="flex-1 min-w-0 overflow-hidden p-6">
                        <Outlet />
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </PluginUILoader>
    );
}
