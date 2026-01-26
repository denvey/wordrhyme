import * as React from "react"
import { ChevronsUpDown, Plus } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Skeleton,
} from "@wordrhyme/ui"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@wordrhyme/ui"

/**
 * TeamSwitcher Props (Controlled Component)
 */
export interface TeamSwitcherProps {
  teams: Array<{
    id: string
    name: string
    logo: string | null // URL or null
    plan: string
  }>
  activeTeamId?: string | undefined
  isLoading: boolean
  onSwitchTeam: (teamId: string) => Promise<void>
  onCreateTeam: () => void
}

/**
 * Get initials from name for logo fallback
 */
function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.split(/[\s@]+/).filter(Boolean)
  const first = parts[0]
  if (first && first[0]) {
    return first[0].toUpperCase()
  }
  return '?'
}

/**
 * TeamSwitcher - Organization switcher component
 *
 * Controlled component for switching between user's organizations.
 * Supports loading state, empty state, and collapsed sidebar mode.
 */
export function TeamSwitcher({
  teams,
  activeTeamId,
  isLoading,
  onSwitchTeam,
  onCreateTeam,
}: TeamSwitcherProps) {
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'
  const [switching, setSwitching] = React.useState(false)

  // Find active team
  const activeTeam = teams.find(t => t.id === activeTeamId)

  // Loading state - show skeleton
  if (isLoading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <Skeleton className="size-8 rounded-lg" />
            {!isCollapsed && (
              <>
                <div className="grid flex-1 gap-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  // Empty state - no organizations
  if (teams.length === 0) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" onClick={onCreateTeam}>
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-muted">
              <Plus className="size-4" />
            </div>
            {!isCollapsed && (
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Create Organization</span>
                <span className="truncate text-xs text-muted-foreground">Get started</span>
              </div>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  // Handle team switch with loading state
  const handleSwitch = async (teamId: string) => {
    if (teamId === activeTeamId || switching) return
    try {
      setSwitching(true)
      await onSwitchTeam(teamId)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              disabled={switching}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {/* Logo */}
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                {activeTeam?.logo ? (
                  <img
                    src={activeTeam.logo}
                    alt={activeTeam.name}
                    className="size-6 rounded object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold">
                    {getInitials(activeTeam?.name ?? '')}
                  </span>
                )}
              </div>
              {/* Name and Plan (collapsed mode hides this) */}
              {!isCollapsed && (
                <>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {activeTeam?.name ?? 'Select Organization'}
                    </span>
                    <span className="truncate text-xs">
                      {activeTeam?.plan ?? 'No active org'}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </>
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side="right"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Organizations
            </DropdownMenuLabel>
            {teams.map((team, index) => (
              <DropdownMenuItem
                key={team.id}
                onClick={() => handleSwitch(team.id)}
                disabled={switching || team.id === activeTeamId}
                className="gap-2 p-2"
              >
                <div className="flex size-6 items-center justify-center rounded-sm border">
                  {team.logo ? (
                    <img
                      src={team.logo}
                      alt={team.name}
                      className="size-5 rounded object-cover"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground">
                      {getInitials(team.name)}
                    </span>
                  )}
                </div>
                <span className="flex-1">{team.name}</span>
                {index < 9 && (
                  <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 p-2"
              onClick={onCreateTeam}
              disabled={switching}
            >
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">Add organization</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
