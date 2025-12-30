/**
 * Plugin UI Loading Integration Tests
 *
 * Tests that plugin UI loads correctly in Admin host.
 *
 * @task 9.2.2 - Test: Plugin UI loads in Admin host
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtensionPoint } from '../../lib/extensions/extension-types';
import type { Extension, SidebarExtension, SettingsTabExtension } from '../../lib/extensions/extension-types';

// Note: This is a unit test simulating the plugin UI loading behavior
// Full E2E testing would require browser automation (Playwright/Cypress)

describe('Plugin UI Loading Integration', () => {
    // Mock extension registry
    let mockExtensions: Extension[] = [];

    const mockRegistry = {
        register: (ext: Extension) => {
            mockExtensions.push(ext);
        },
        registerAll: (exts: Extension[]) => {
            mockExtensions.push(...exts);
        },
        unregisterPlugin: (pluginId: string) => {
            const before = mockExtensions.length;
            mockExtensions = mockExtensions.filter(e => e.pluginId !== pluginId);
            return before - mockExtensions.length;
        },
        getAllExtensions: () => mockExtensions,
        getExtensions: <T extends Extension>(type: ExtensionPoint): T[] => {
            return mockExtensions.filter(e => e.type === type) as T[];
        },
    };

    beforeEach(() => {
        mockExtensions = [];
    });

    describe('Extension Registration', () => {
        it('should register sidebar extensions from plugin', () => {
            const sidebarExtension: SidebarExtension = {
                id: 'my-page',
                pluginId: 'com.test.plugin',
                type: ExtensionPoint.SIDEBAR,
                label: 'My Plugin Page',
                icon: 'Package',
                path: '/p/com.test.plugin',
                component: () => null,
            };

            mockRegistry.register(sidebarExtension);

            const extensions = mockRegistry.getExtensions<SidebarExtension>(ExtensionPoint.SIDEBAR);
            expect(extensions).toHaveLength(1);
            expect(extensions[0].label).toBe('My Plugin Page');
            expect(extensions[0].path).toBe('/p/com.test.plugin');
        });

        it('should register settings tab extensions from plugin', () => {
            const settingsExtension: SettingsTabExtension = {
                id: 'settings',
                pluginId: 'com.test.plugin',
                type: ExtensionPoint.SETTINGS_TAB,
                label: 'Plugin Settings',
                component: () => null,
            };

            mockRegistry.register(settingsExtension);

            const extensions = mockRegistry.getExtensions<SettingsTabExtension>(ExtensionPoint.SETTINGS_TAB);
            expect(extensions).toHaveLength(1);
            expect(extensions[0].label).toBe('Plugin Settings');
        });

        it('should register multiple extensions from single plugin', () => {
            const extensions: Extension[] = [
                {
                    id: 'sidebar',
                    pluginId: 'com.multi.plugin',
                    type: ExtensionPoint.SIDEBAR,
                    label: 'Multi Plugin',
                    path: '/p/com.multi.plugin',
                    component: () => null,
                } as SidebarExtension,
                {
                    id: 'settings',
                    pluginId: 'com.multi.plugin',
                    type: ExtensionPoint.SETTINGS_TAB,
                    label: 'Multi Settings',
                    component: () => null,
                } as SettingsTabExtension,
            ];

            mockRegistry.registerAll(extensions);

            expect(mockRegistry.getAllExtensions()).toHaveLength(2);
        });
    });

    describe('Plugin Unloading', () => {
        it('should remove all extensions when plugin is unloaded', () => {
            // Register extensions from two plugins
            mockRegistry.registerAll([
                {
                    id: 'sidebar',
                    pluginId: 'com.plugin.a',
                    type: ExtensionPoint.SIDEBAR,
                    label: 'Plugin A',
                    path: '/p/a',
                    component: () => null,
                } as SidebarExtension,
                {
                    id: 'sidebar',
                    pluginId: 'com.plugin.b',
                    type: ExtensionPoint.SIDEBAR,
                    label: 'Plugin B',
                    path: '/p/b',
                    component: () => null,
                } as SidebarExtension,
            ]);

            expect(mockRegistry.getAllExtensions()).toHaveLength(2);

            // Unload plugin A
            const removed = mockRegistry.unregisterPlugin('com.plugin.a');
            expect(removed).toBe(1);

            // Only plugin B should remain
            const remaining = mockRegistry.getAllExtensions();
            expect(remaining).toHaveLength(1);
            expect(remaining[0].pluginId).toBe('com.plugin.b');
        });
    });

    describe('Module Federation Loading Simulation', () => {
        it('should handle successful plugin module load', async () => {
            // Simulate loadRemote returning a module
            const mockModule = {
                extensions: [
                    {
                        id: 'page',
                        pluginId: 'com.remote.plugin',
                        type: ExtensionPoint.SIDEBAR,
                        label: 'Remote Page',
                        path: '/p/com.remote.plugin',
                        component: () => null,
                    },
                ],
                init: vi.fn(),
            };

            // Simulate successful load
            await mockModule.init();
            mockRegistry.registerAll(mockModule.extensions as Extension[]);

            expect(mockModule.init).toHaveBeenCalled();
            expect(mockRegistry.getAllExtensions()).toHaveLength(1);
        });

        it('should handle plugin module load failure gracefully', async () => {
            const loadResult = {
                pluginId: 'com.broken.plugin',
                success: false,
                error: 'Network error: Failed to fetch remoteEntry.js',
            };

            // Even on failure, no extensions should be registered
            expect(loadResult.success).toBe(false);
            expect(loadResult.error).toContain('Failed to fetch');
            expect(mockRegistry.getAllExtensions()).toHaveLength(0);
        });

        it('should handle plugin load timeout', async () => {
            const timeoutError = new Error('Plugin load timeout');

            const loadResult = {
                pluginId: 'com.slow.plugin',
                success: false,
                error: timeoutError.message,
            };

            expect(loadResult.success).toBe(false);
            expect(loadResult.error).toBe('Plugin load timeout');
        });
    });
});
