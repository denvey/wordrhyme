// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ComponentType = (props: any) => any;

// ─── 类型定义（与 admin 侧 extension-types.ts 保持一致） ───

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

export interface SlotContext {
    [key: string]: unknown;
}

export interface UIExtensionDef {
    id: string;
    label: string;
    icon?: string;
    category?: string;
    component?: ComponentType;
    remoteComponent?: string;
    targets: Target[];
}

/** Remove undefined values from an object to satisfy exactOptionalPropertyTypes */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
    const result = {} as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) result[k] = v;
    }
    return result as T;
}

// ─── 辅助函数 ───

export function navExtension(ext: {
    id: string;
    label: string;
    icon?: string;
    component?: ComponentType;
    remoteComponent?: string;
    path: string;
    order?: number;
    requiredPermission?: string;
}): UIExtensionDef {
    const { path, order, requiredPermission, ...rest } = ext;
    const target: NavTarget = stripUndefined({
        slot: 'nav.sidebar' as const,
        path,
        order,
        requiredPermission,
    }) as NavTarget;
    return { ...stripUndefined(rest), targets: [target] };
}

export function settingsExtension(ext: {
    id: string;
    label: string;
    icon?: string;
    component?: ComponentType;
    remoteComponent?: string;
    order?: number;
    category?: string;
    visibility?: 'platform' | 'all';
}): UIExtensionDef {
    const { order, visibility, ...rest } = ext;
    const target: SettingsTarget = stripUndefined({
        slot: 'settings.plugin' as const,
        order,
        visibility,
    }) as SettingsTarget;
    return { ...stripUndefined(rest), targets: [target] };
}

export function dashboardExtension(ext: {
    id: string;
    label: string;
    icon?: string;
    component?: ComponentType;
    remoteComponent?: string;
    order?: number;
    colSpan?: 1 | 2 | 3 | 4;
}): UIExtensionDef {
    const { order, colSpan, ...rest } = ext;
    const target: DashboardTarget = stripUndefined({
        slot: 'dashboard.widgets' as const,
        order,
        colSpan,
    }) as DashboardTarget;
    return { ...stripUndefined(rest), targets: [target] };
}

export function multiSlotExtension(ext: {
    id: string;
    label: string;
    icon?: string;
    component?: ComponentType;
    remoteComponent?: string;
    category?: string;
    targets: Target[];
}): UIExtensionDef {
    return ext;
}
