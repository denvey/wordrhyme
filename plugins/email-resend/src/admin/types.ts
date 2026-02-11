/**
 * Extension type definitions for plugin UI
 */
import type { ComponentType } from 'react';

export interface ExtensionBase {
    id: string;
    pluginId: string;
    order?: number;
}

export interface SidebarExtension extends ExtensionBase {
    type: 'sidebar';
    label: string;
    icon?: string;
    path: string;
    component: ComponentType;
}

export interface SettingsTabExtension extends ExtensionBase {
    type: 'settings_tab';
    label: string;
    component: ComponentType;
}

export type Extension = SidebarExtension | SettingsTabExtension;
