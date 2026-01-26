"use client"

import { ChevronRight, type LucideIcon } from "lucide-react"
import { Link, useLocation, useNavigate } from "react-router-dom"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wordrhyme/ui"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@wordrhyme/ui"

export interface NavMainItem {
  id: string
  title: string
  url: string
  openMode?: 'route' | 'external'
  icon?: LucideIcon | null
  isActive?: boolean
  items?: {
    id: string
    title: string
    url: string
    openMode?: 'route' | 'external'
  }[]
}

/**
 * Check if URL is external (different domain from current page)
 */
function isExternalUrl(url: string): boolean {
  try {
    const urlObj = new URL(url, window.location.origin)
    return urlObj.origin !== window.location.origin
  } catch {
    return false
  }
}

export function NavMain({
  items,
  label = "Platform",
}: {
  items: NavMainItem[]
  label?: string
}) {
  const location = useLocation()
  const navigate = useNavigate()

  // Handle click based on openMode and URL
  // external mode -> new tab
  // non-external but external URL -> iframe
  // else -> normal route navigation
  const handleItemClick = (e: React.MouseEvent, item: { url: string; openMode?: string }) => {
    const mode = item.openMode || 'route'

    if (mode === 'external') {
      // External mode -> always open in new tab
      e.preventDefault()
      window.open(item.url, '_blank', 'noopener,noreferrer')
    } else if (isExternalUrl(item.url)) {
      // Not external mode, but URL is from different domain -> iframe
      e.preventDefault()
      navigate(`/iframe?url=${encodeURIComponent(item.url)}`)
    }
    // For normal routes, let the Link handle navigation
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isActive = location.pathname === item.url ||
            (item.url !== '/' && location.pathname.startsWith(item.url))
          const hasChildren = item.items && item.items.length > 0

          // If no children, render as simple link
          if (!hasChildren) {
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive}
                  asChild
                >
                  <Link
                    to={item.openMode === 'route' || !item.openMode ? item.url : '#'}
                    onClick={(e) => handleItemClick(e, item)}
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          }

          // With children, render as collapsible
          return (
            <Collapsible
              key={item.id}
              asChild
              defaultOpen={item.isActive || isActive}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title} isActive={isActive}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => {
                      const subIsActive = location.pathname === subItem.url
                      return (
                        <SidebarMenuSubItem key={subItem.id}>
                          <SidebarMenuSubButton asChild isActive={subIsActive}>
                            <Link
                              to={subItem.openMode === 'route' || !subItem.openMode ? subItem.url : '#'}
                              onClick={(e) => handleItemClick(e, subItem)}
                            >
                              <span>{subItem.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
