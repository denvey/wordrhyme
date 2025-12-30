/**
 * Extension Point Types
 *
 * Defines the interfaces and types for plugin UI extensions.
 * Plugins can extend the Admin UI through these extension points.
 */
import type { ComponentType, ReactNode } from 'react';

/**
 * Available extension points in the Admin UI
 */
export enum ExtensionPoint {
    /** Sidebar navigation item */
    SIDEBAR = 'sidebar',
    /** Tab in the Settings page */
    SETTINGS_TAB = 'settings_tab',
    /** Dashboard widget */
    DASHBOARD_WIDGET = 'dashboard_widget',
    /** Header action button */
    HEADER_ACTION = 'header_action',
}

/**
 * Base extension interface
 */
export interface ExtensionBase {
    /** Unique identifier for this extension */
    id: string;
    /** Plugin ID that registered this extension */
    pluginId: string;
    /** Display order (lower = higher priority) */
    order?: number;
}

/**
 * Sidebar extension for navigation items
 */
export interface SidebarExtension extends ExtensionBase {
    type: ExtensionPoint.SIDEBAR;
    /** Display label */
    label: string;
    /** Lucide icon name */
    icon?: string;
    /** Route path */
    path: string;
    /** Required permission to view (optional) */
    requiredPermission?: string;
    /** React component for the page (lazy loaded) */
    component: ComponentType;
}

/**
 * Settings tab extension
 */
export interface SettingsTabExtension extends ExtensionBase {
    type: ExtensionPoint.SETTINGS_TAB;
    /** Tab label */
    label: string;
    /** Tab icon */
    icon?: string;
    /** React component for the tab content */
    component: ComponentType;
}

/**
 * Dashboard widget extension
 */
export interface DashboardWidgetExtension extends ExtensionBase {
    type: ExtensionPoint.DASHBOARD_WIDGET;
    /** Widget title */
    title: string;
    /** Grid column span (1-4) */
    colSpan?: 1 | 2 | 3 | 4;
    /** React component for the widget */
    component: ComponentType;
}

/**
 * Header action extension
 */
export interface HeaderActionExtension extends ExtensionBase {
    type: ExtensionPoint.HEADER_ACTION;
    /** Tooltip text */
    tooltip: string;
    /** Icon name */
    icon: string;
    /** Click handler or route path */
    onClick?: () => void;
    path?: string;
}

/**
 * Union type of all extensions
 */
export type Extension =
    | SidebarExtension
    | SettingsTabExtension
    | DashboardWidgetExtension
    | HeaderActionExtension;

/**
 * Plugin remote module interface
 * Plugins expose this at their Module Federation entry point
 */
export interface PluginRemoteModule {
    /** Plugin extensions to register */
    extensions?: Extension[];
    /** Optional initialization function */
    init?: () => void | Promise<void>;
}
