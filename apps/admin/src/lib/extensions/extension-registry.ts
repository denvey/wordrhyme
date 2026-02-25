import {
    CORE_SLOTS,
    isValidSlot,
    matchSlotPattern,
    type UIExtension,
    type SlotEntry,
    // Legacy types (kept for migration)
    ExtensionPoint,
    type Extension,
    type SidebarExtension,
    type SettingsTabExtension,
    type DashboardWidgetExtension,
    type HeaderActionExtension,
} from './extension-types';

class ExtensionRegistryImpl {
    private extensions: Map<string, UIExtension> = new Map();
    private slotIndex: Map<string, Set<string>> = new Map();
    private slotCache: Map<string, SlotEntry[]> = new Map();
    private listeners: Set<() => void> = new Set();

    // ─── New Slot-based API ───

    register(ext: UIExtension): void {
        const key = `${ext.pluginId}:${ext.id}`;
        this.extensions.set(key, ext);

        for (const target of ext.targets) {
            if (!isValidSlot(target.slot)) {
                if (process.env['NODE_ENV'] === 'development') {
                    throw new Error(
                        `Unknown slot "${target.slot}" in extension "${ext.id}". ` +
                        `Valid slots: ${CORE_SLOTS.join(', ')}`,
                    );
                }
                console.warn(
                    `[ExtensionRegistry] Skipping unknown slot "${target.slot}" for "${ext.id}"`,
                );
                continue;
            }
            let slotSet = this.slotIndex.get(target.slot);
            if (!slotSet) {
                slotSet = new Set();
                this.slotIndex.set(target.slot, slotSet);
            }
            slotSet.add(key);
            this.slotCache.delete(target.slot);
        }

        this.notify();
    }

    registerAll(exts: UIExtension[]): void {
        for (const ext of exts) {
            const key = `${ext.pluginId}:${ext.id}`;
            this.extensions.set(key, ext);

            for (const target of ext.targets) {
                if (!isValidSlot(target.slot)) {
                    if (process.env['NODE_ENV'] === 'development') {
                        throw new Error(
                            `Unknown slot "${target.slot}" in extension "${ext.id}".`,
                        );
                    }
                    console.warn(
                        `[ExtensionRegistry] Skipping unknown slot "${target.slot}" for "${ext.id}"`,
                    );
                    continue;
                }
                let slotSet = this.slotIndex.get(target.slot);
                if (!slotSet) {
                    slotSet = new Set();
                    this.slotIndex.set(target.slot, slotSet);
                }
                slotSet.add(key);
                this.slotCache.delete(target.slot);
            }
        }

        this.notify();
    }

    getBySlot(slotName: string): SlotEntry[] {
        const cached = this.slotCache.get(slotName);
        if (cached) return cached;

        const keys = this.slotIndex.get(slotName);
        if (!keys || keys.size === 0) {
            const empty: SlotEntry[] = [];
            this.slotCache.set(slotName, empty);
            return empty;
        }

        const entries: SlotEntry[] = [];
        for (const key of keys) {
            const ext = this.extensions.get(key);
            if (!ext) continue;
            const target = ext.targets.find(t => t.slot === slotName);
            if (target) {
                entries.push({ extension: ext, target });
            }
        }

        entries.sort((a, b) => (a.target.order ?? 100) - (b.target.order ?? 100));
        this.slotCache.set(slotName, entries);
        return entries;
    }

    getBySlotPattern(pattern: string): SlotEntry[] {
        const result: SlotEntry[] = [];
        const seen = new Set<string>();

        for (const [slotName] of this.slotIndex) {
            if (matchSlotPattern(pattern, slotName)) {
                for (const entry of this.getBySlot(slotName)) {
                    const key = `${entry.extension.pluginId}:${entry.extension.id}:${slotName}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        result.push(entry);
                    }
                }
            }
        }

        return result.sort((a, b) => (a.target.order ?? 100) - (b.target.order ?? 100));
    }

    unregisterPlugin(pluginId: string): number {
        let count = 0;
        const keysToRemove: string[] = [];

        for (const [key, ext] of this.extensions) {
            if (ext.pluginId === pluginId) {
                keysToRemove.push(key);
                count++;
            }
        }

        for (const key of keysToRemove) {
            const ext = this.extensions.get(key);
            this.extensions.delete(key);
            if (ext) {
                for (const target of ext.targets) {
                    const slotSet = this.slotIndex.get(target.slot);
                    if (slotSet) {
                        slotSet.delete(key);
                        if (slotSet.size === 0) {
                            this.slotIndex.delete(target.slot);
                        }
                    }
                    this.slotCache.delete(target.slot);
                }
            }
        }

        // Clean remote component cache entries for this plugin
        if (typeof window !== 'undefined' && count > 0) {
            this.cleanRemoteComponentCache(pluginId);
        }

        if (count > 0) {
            this.notify();
        }

        return count;
    }

    subscribe = (onStoreChange: () => void): (() => void) => {
        this.listeners.add(onStoreChange);
        return () => this.listeners.delete(onStoreChange);
    };

    getAll(): UIExtension[] {
        return Array.from(this.extensions.values());
    }

    clear(): void {
        this.extensions.clear();
        this.slotIndex.clear();
        this.slotCache.clear();
        this.notify();
    }

    // ─── Legacy compatibility API (will be removed in Phase 2 cleanup) ───

    /** @deprecated Use register() with UIExtension instead */
    registerLegacy(extension: Extension): void {
        const converted = this.convertLegacyExtension(extension);
        if (converted) {
            this.register(converted);
        }
    }

    /** @deprecated Use registerAll() with UIExtension[] instead */
    registerAllLegacy(extensions: Extension[]): void {
        const converted = extensions
            .map(ext => this.convertLegacyExtension(ext))
            .filter((ext): ext is UIExtension => ext !== null);
        if (converted.length > 0) {
            this.registerAll(converted);
        }
    }

    /** @deprecated Use getBySlot() instead */
    getExtensions<T extends Extension>(type: ExtensionPoint): T[] {
        const slotName = this.extensionPointToSlot(type);
        if (!slotName) return [];

        const entries = this.getBySlot(slotName);
        return entries.map(entry => this.convertToLegacyExtension(entry) as T);
    }

    /** @deprecated Use getBySlot('nav.sidebar') instead */
    getSidebarExtensions(): SidebarExtension[] {
        return this.getExtensions(ExtensionPoint.SIDEBAR);
    }

    /** @deprecated Use getBySlot('settings.plugin') instead */
    getSettingsTabExtensions(): SettingsTabExtension[] {
        return this.getExtensions(ExtensionPoint.SETTINGS_TAB);
    }

    /** @deprecated Use getBySlot('dashboard.widgets') instead */
    getDashboardWidgetExtensions(): DashboardWidgetExtension[] {
        return this.getExtensions(ExtensionPoint.DASHBOARD_WIDGET);
    }

    /** @deprecated */
    getHeaderActionExtensions(): HeaderActionExtension[] {
        return this.getExtensions(ExtensionPoint.HEADER_ACTION);
    }

    /** @deprecated Use getAll() instead */
    getAllExtensions(): Extension[] {
        return this.getAll().flatMap(ext => {
            const entries = ext.targets.map(t => ({ extension: ext, target: t }));
            return entries
                .map(entry => this.convertToLegacyExtension(entry))
                .filter((e): e is Extension => e !== null);
        });
    }

    // ─── Private helpers ───

    private notify(): void {
        for (const listener of this.listeners) {
            try {
                listener();
            } catch (error) {
                console.error('Extension listener error:', error);
            }
        }
    }

    private cleanRemoteComponentCache(pluginId: string): void {
        // remoteComponentCache is module-level in PluginSlot; we signal cleanup
        // through a well-known global for now. The PluginSlot module will
        // check this on next render.
        if (typeof window !== 'undefined') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const w = window as any;
            if (!w.__pluginCacheCleanup) w.__pluginCacheCleanup = [];
            w.__pluginCacheCleanup.push(pluginId);
        }
    }

    private extensionPointToSlot(type: ExtensionPoint): string | null {
        switch (type) {
            case ExtensionPoint.SIDEBAR: return 'nav.sidebar';
            case ExtensionPoint.SETTINGS_TAB: return 'settings.plugin';
            case ExtensionPoint.DASHBOARD_WIDGET: return 'dashboard.widgets';
            case ExtensionPoint.HEADER_ACTION: return null;
            default: return null;
        }
    }

    private convertLegacyExtension(ext: Extension): UIExtension | null {
        const strip = <T extends Record<string, unknown>>(obj: T): T => {
            const result = {} as Record<string, unknown>;
            for (const [k, v] of Object.entries(obj)) {
                if (v !== undefined) result[k] = v;
            }
            return result as T;
        };

        switch (ext.type) {
            case ExtensionPoint.SIDEBAR:
                return strip({
                    id: ext.id,
                    pluginId: ext.pluginId,
                    label: ext.label,
                    icon: ext.icon,
                    component: ext.component,
                    targets: [strip({ slot: 'nav.sidebar' as const, path: ext.path, order: ext.order, requiredPermission: ext.requiredPermission })],
                }) as UIExtension;
            case ExtensionPoint.SETTINGS_TAB:
                return strip({
                    id: ext.id,
                    pluginId: ext.pluginId,
                    label: ext.label,
                    icon: ext.icon,
                    component: ext.component,
                    targets: [strip({ slot: 'settings.plugin' as const, order: ext.order })],
                }) as UIExtension;
            case ExtensionPoint.DASHBOARD_WIDGET:
                return strip({
                    id: ext.id,
                    pluginId: ext.pluginId,
                    label: ext.title,
                    component: ext.component,
                    targets: [strip({ slot: 'dashboard.widgets' as const, order: ext.order, colSpan: ext.colSpan })],
                }) as UIExtension;
            default:
                return null;
        }
    }

    private convertToLegacyExtension(entry: SlotEntry): Extension | null {
        const { extension: ext, target } = entry;
        switch (target.slot) {
            case 'nav.sidebar':
                return {
                    id: ext.id,
                    pluginId: ext.pluginId,
                    type: ExtensionPoint.SIDEBAR,
                    label: ext.label,
                    icon: ext.icon,
                    path: 'path' in target ? target.path : '',
                    order: target.order,
                    requiredPermission: 'requiredPermission' in target ? target.requiredPermission : undefined,
                    component: ext.component!,
                } as SidebarExtension;
            case 'settings.plugin':
                return {
                    id: ext.id,
                    pluginId: ext.pluginId,
                    type: ExtensionPoint.SETTINGS_TAB,
                    label: ext.label,
                    icon: ext.icon,
                    order: target.order,
                    component: ext.component!,
                } as SettingsTabExtension;
            case 'dashboard.widgets':
            case 'dashboard.overview':
                return {
                    id: ext.id,
                    pluginId: ext.pluginId,
                    type: ExtensionPoint.DASHBOARD_WIDGET,
                    title: ext.label,
                    order: target.order,
                    colSpan: 'colSpan' in target ? target.colSpan : undefined,
                    component: ext.component!,
                } as DashboardWidgetExtension;
            default:
                return null;
        }
    }
}

export const ExtensionRegistry = new ExtensionRegistryImpl();
