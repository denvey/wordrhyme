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
  url: string | null  // null for directory nodes
  openMode?: 'route' | 'external'
  icon?: LucideIcon | null
  isActive?: boolean
  items?: NavMainItem[]  // Recursive structure for multi-level support
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
  const handleItemClick = (e: React.MouseEvent, item: { url: string | null; openMode?: string }) => {
    if (!item.url) return // Directory node, no navigation

    const mode = item.openMode || 'route'

    if (mode === 'external') {
      e.preventDefault()
      window.open(item.url, '_blank', 'noopener,noreferrer')
    } else if (isExternalUrl(item.url)) {
      e.preventDefault()
      navigate(`/iframe?url=${encodeURIComponent(item.url)}`)
    }
  }

  // Check if current path matches or starts with the given URL
  const isPathActive = (url: string | null): boolean => {
    if (!url) return false
    return location.pathname === url
  }

  // Check if current path is under the given URL (prefix match for parent/collapsible)
  const isPathUnder = (url: string | null): boolean => {
    if (!url || url === '/') return false
    return location.pathname === url || location.pathname.startsWith(url + '/')
  }

  // Check if menu item or any of its descendants contain the active path (recursive)
  const containsActivePath = (item: NavMainItem): boolean => {
    // Check if this item itself is active
    if (item.url && isPathUnder(item.url)) {
      return true
    }

    // Check if any child contains the active path (recursive)
    if (item.items && item.items.length > 0) {
      return item.items.some(child => containsActivePath(child))
    }

    return false
  }

  // Recursive function to render menu items with multi-level support
  const renderMenuItem = (item: NavMainItem, depth = 0): React.ReactNode => {
    const isActive = item.url ? isPathActive(item.url) : false
    const hasChildren = item.items && item.items.length > 0
    const shouldExpand = containsActivePath(item)  // Auto-expand if contains active path

    // Leaf node (no children)
    if (!hasChildren) {
      if (depth === 0) {
        // Top-level leaf item
        return (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton
              tooltip={item.title}
              isActive={isActive}
              asChild
            >
              <Link
                to={item.url || '#'}
                onClick={(e) => handleItemClick(e, item)}
              >
                {item.icon && <item.icon />}
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      } else {
        // Nested leaf item
        return (
          <SidebarMenuSubItem key={item.id}>
            <SidebarMenuSubButton asChild isActive={isActive}>
              <Link
                to={item.url || '#'}
                onClick={(e) => handleItemClick(e, item)}
              >
                <span>{item.title}</span>
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        )
      }
    }

    // Parent node with children (collapsible)
    return (
      <Collapsible
        key={item.id}
        asChild
        defaultOpen={shouldExpand}  // Auto-expand if contains active path
      >
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton tooltip={item.title} isActive={isActive} className="group/collapsible">
              {item.icon && <item.icon />}
              <span>{item.title}</span>
              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.items?.map((subItem) => renderMenuItem(subItem, depth + 1))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible >
    )
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => renderMenuItem(item, 0))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
