/**
 * Extension Registry
 *
 * Singleton registry for managing plugin UI extensions.
 * Provides methods to register, unregister, and query extensions.
 */
import {
    ExtensionPoint,
    type Extension,
    type SidebarExtension,
    type SettingsTabExtension,
    type DashboardWidgetExtension,
    type HeaderActionExtension,
} from './extension-types';

type ExtensionChangeListener = (extensions: Extension[]) => void;

class ExtensionRegistryImpl {
    private extensions: Map<string, Extension> = new Map();
    private listeners: Set<ExtensionChangeListener> = new Set();

    /**
     * Register an extension
     */
    register(extension: Extension): void {
        const key = `${extension.pluginId}:${extension.id}`;
        if (this.extensions.has(key)) {
            console.warn(`Extension ${key} already registered, replacing...`);
        }
        this.extensions.set(key, extension);
        this.notifyListeners();
    }

    /**
     * Register multiple extensions at once
     */
    registerAll(extensions: Extension[]): void {
        for (const extension of extensions) {
            const key = `${extension.pluginId}:${extension.id}`;
            this.extensions.set(key, extension);
        }
        this.notifyListeners();
    }

    /**
     * Unregister an extension
     */
    unregister(pluginId: string, extensionId: string): boolean {
        const key = `${pluginId}:${extensionId}`;
        const deleted = this.extensions.delete(key);
        if (deleted) {
            this.notifyListeners();
        }
        return deleted;
    }

    /**
     * Unregister all extensions from a plugin
     */
    unregisterPlugin(pluginId: string): number {
        let count = 0;
        for (const key of this.extensions.keys()) {
            if (key.startsWith(`${pluginId}:`)) {
                this.extensions.delete(key);
                count++;
            }
        }
        if (count > 0) {
            this.notifyListeners();
        }
        return count;
    }

    /**
     * Get all extensions of a specific type
     */
    getExtensions<T extends Extension>(type: ExtensionPoint): T[] {
        const result: T[] = [];
        for (const extension of this.extensions.values()) {
            if (extension.type === type) {
                result.push(extension as T);
            }
        }
        return result.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    }

    /**
     * Get all sidebar extensions
     */
    getSidebarExtensions(): SidebarExtension[] {
        return this.getExtensions(ExtensionPoint.SIDEBAR);
    }

    /**
     * Get all settings tab extensions
     */
    getSettingsTabExtensions(): SettingsTabExtension[] {
        return this.getExtensions(ExtensionPoint.SETTINGS_TAB);
    }

    /**
     * Get all dashboard widget extensions
     */
    getDashboardWidgetExtensions(): DashboardWidgetExtension[] {
        return this.getExtensions(ExtensionPoint.DASHBOARD_WIDGET);
    }

    /**
     * Get all header action extensions
     */
    getHeaderActionExtensions(): HeaderActionExtension[] {
        return this.getExtensions(ExtensionPoint.HEADER_ACTION);
    }

    /**
     * Get all registered extensions
     */
    getAllExtensions(): Extension[] {
        return Array.from(this.extensions.values());
    }

    /**
     * Subscribe to extension changes
     */
    subscribe(listener: ExtensionChangeListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Clear all extensions (useful for testing)
     */
    clear(): void {
        this.extensions.clear();
        this.notifyListeners();
    }

    private notifyListeners(): void {
        const extensions = this.getAllExtensions();
        for (const listener of this.listeners) {
            try {
                listener(extensions);
            } catch (error) {
                console.error('Extension listener error:', error);
            }
        }
    }
}

/**
 * Singleton extension registry instance
 */
export const ExtensionRegistry = new ExtensionRegistryImpl();
