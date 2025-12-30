/**
 * SidebarHeader Component
 *
 * Displays WordRhyme logo and theme toggle in the sidebar header.
 * Replaces TeamSwitcher from the original sidebar-07 template.
 */
import * as React from "react"
import { Sparkles } from "lucide-react"
import {
    SidebarMenu,
    SidebarMenuItem,
    useSidebar,
} from "@wordrhyme/ui"
import { ThemeToggle } from "./ThemeToggle"

export function SidebarHeaderContent() {
    const { state } = useSidebar()
    const isCollapsed = state === "collapsed"

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <div className="flex w-full items-center gap-2 px-2 py-1.5">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                        <Sparkles className="size-4" />
                    </div>
                    {!isCollapsed && (
                        <>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-semibold">WordRhyme</span>
                                <span className="truncate text-xs text-muted-foreground">Admin Console</span>
                            </div>
                            <ThemeToggle />
                        </>
                    )}
                </div>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
