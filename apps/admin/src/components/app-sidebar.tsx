/**
 * AppSidebar Component
 *
 * Dynamic sidebar that loads menus from the database via tRPC.
 * Replaces static sample data with real menu items including plugin menus.
 */
import * as React from "react"
import { GalleryVerticalEnd } from "lucide-react"
import { useTranslation } from "../lib/i18n"

import { NavMain, type NavMainItem } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarGroup,
  SidebarGroupLabel,
} from "@wordrhyme/ui"
import { useAdminMenus, type MenuTreeNode } from "../hooks/useMenus"

// User data (will be replaced with auth data in future)
const userData = {
  name: "Admin User",
  email: "admin@example.com",
  avatar: "/avatars/default.jpg",
}

// Teams data (will be replaced with organization data in future)
const teamsData = [
  {
    name: "My Organization",
    logo: GalleryVerticalEnd,
    plan: "Enterprise",
  },
]

/**
 * Convert menu id to i18n key: 'core:dashboard' → 'menu.core.dashboard'
 */
function menuI18nKey(id: string): string {
  return `menu.${id.replace(/:/g, '.')}`
}

/**
 * Convert database menu items to NavMainItem format
 */
function menuToNavItem(menu: MenuTreeNode, t: (key: string, defaultValue?: string) => string): NavMainItem {
  const menuKey = menu.code ?? menu.id
  const item: NavMainItem = {
    id: menuKey,
    title: t(menuI18nKey(menuKey), menu.label),
    url: menu.path,
    icon: menu.IconComponent,
  }

  if (menu.children.length > 0) {
    item.items = menu.children.map(child => ({
      id: child.code ?? child.id,
      title: t(menuI18nKey(child.code ?? child.id), child.label),
      url: child.path,
    }))
  }

  return item
}

/**
 * Loading skeleton for sidebar menus
 */
function MenusSkeleton() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Loading...</SidebarGroupLabel>
      <SidebarMenu>
        {[1, 2, 3].map((i) => (
          <SidebarMenuItem key={i}>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation()
  const { menus, isLoading, error } = useAdminMenus()

  // Convert menu tree to NavMainItem format
  const navItems = React.useMemo(() => {
    return menus.map(menu => menuToNavItem(menu, t))
  }, [menus, t])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={teamsData} />
      </SidebarHeader>
      <SidebarContent>
        {isLoading ? (
          <MenusSkeleton />
        ) : error ? (
          <SidebarGroup>
            <SidebarGroupLabel className="text-destructive">
              {t('nav.error', 'Failed to load menus')}
            </SidebarGroupLabel>
          </SidebarGroup>
        ) : (
          <NavMain items={navItems} label={t('nav.title', 'Navigation')} />
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
