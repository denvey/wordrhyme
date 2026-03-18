import type { ComponentType } from 'react';

// ─── Slot 白名单 ───

export const CORE_SLOTS = [
    'nav.sidebar',
    'settings.plugin',
    'dashboard.widgets',
    'dashboard.overview',
    'article.editor.actions',
    'article.editor.sidebar',
    'entity.detail.sidebar',
    'entity.list.toolbar',

    // ─── Shop Plugin Slots ───
    // Product
    'shop.product.list.toolbar',       // Product list page toolbar (filters, import button etc.)
    'shop.product.list.bulk-actions',   // Bulk actions on selected products
    'shop.product.detail.actions',      // Product detail page action buttons
    'shop.product.detail.block',        // Inline card blocks on product detail
    'shop.product.detail.sidebar',      // Product detail sidebar panel
    'shop.product.edit.before',         // Before product edit form
    'shop.product.edit.after',          // After product edit form
    // Order
    'shop.order.list.toolbar',          // Order list page toolbar
    'shop.order.list.bulk-actions',     // Bulk actions on selected orders
    'shop.order.detail.actions',        // Order detail page action buttons
    'shop.order.detail.block',          // Inline card blocks on order detail
    'shop.order.detail.sidebar',        // Order detail sidebar panel
    // Global
    'shop.global.navigation',           // Shop sub-navigation menu items
] as const;

export type CoreSlot = (typeof CORE_SLOTS)[number];

export function isValidSlot(slot: string): slot is CoreSlot {
    return (CORE_SLOTS as readonly string[]).includes(slot);
}

export function matchSlotPattern(pattern: string, slotName: string): boolean {
    if (pattern === slotName) return true;
    if (!pattern.includes('*')) return false;
    const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.+') + '$',
    );
    return regex.test(slotName);
}

// ─── Target（slot-specific 配置） ───

export type Target = NavTarget | SettingsTarget | DashboardTarget | GenericTarget;

export interface NavTarget {
    slot: 'nav.sidebar';
    path: string;
    order?: number;
    requiredPermission?: string;
}

export interface SettingsTarget {
    slot: 'settings.plugin';
    order?: number;
    visibility?: 'platform' | 'all';
}

export interface DashboardTarget {
    slot: 'dashboard.widgets' | 'dashboard.overview';
    order?: number;
    colSpan?: 1 | 2 | 3 | 4;
}

export interface GenericTarget {
    slot: string;
    order?: number;
}

// ─── UIExtension（插件能力） ───

export interface UIExtension {
    id: string;
    pluginId: string;
    label: string;
    icon?: string;
    category?: string;
    component?: ComponentType<SlotContext>;
    remoteComponent?: string;
    targets: Target[];
}

export interface SlotContext {
    [key: string]: unknown;
}

export interface SlotEntry {
    extension: UIExtension;
    target: Target;
}

export interface PluginRemoteModule {
    extensions?: Omit<UIExtension, 'pluginId'>[];
    init?: () => void | Promise<void>;
}

// ─── 旧类型（保留供迁移过渡，Phase 2 清理时删除） ───

/** @deprecated Use Target-based UIExtension instead */
export enum ExtensionPoint {
    SIDEBAR = 'sidebar',
    SETTINGS_TAB = 'settings_tab',
    DASHBOARD_WIDGET = 'dashboard_widget',
    HEADER_ACTION = 'header_action',
}

/** @deprecated */
export interface ExtensionBase {
    id: string;
    pluginId: string;
    order?: number;
}

/** @deprecated */
export interface SidebarExtension extends ExtensionBase {
    type: ExtensionPoint.SIDEBAR;
    label: string;
    icon?: string;
    path: string;
    requiredPermission?: string;
    component: ComponentType;
}

/** @deprecated */
export interface SettingsTabExtension extends ExtensionBase {
    type: ExtensionPoint.SETTINGS_TAB;
    label: string;
    icon?: string;
    component: ComponentType;
}

/** @deprecated */
export interface DashboardWidgetExtension extends ExtensionBase {
    type: ExtensionPoint.DASHBOARD_WIDGET;
    title: string;
    colSpan?: 1 | 2 | 3 | 4;
    component: ComponentType;
}

/** @deprecated */
export interface HeaderActionExtension extends ExtensionBase {
    type: ExtensionPoint.HEADER_ACTION;
    tooltip: string;
    icon: string;
    onClick?: () => void;
    path?: string;
}

/** @deprecated */
export type Extension =
    | SidebarExtension
    | SettingsTabExtension
    | DashboardWidgetExtension
    | HeaderActionExtension;
