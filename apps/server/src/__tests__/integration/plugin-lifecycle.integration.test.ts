/**
 * Plugin Lifecycle Integration Tests
 *
 * Tests the full plugin lifecycle: Install → Enable → Disable → Uninstall
 *
 * @task 9.2.1 - Test: Install → Enable → Disable → Uninstall plugin
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PluginManager } from '../../plugins/plugin-manager';
import { PluginManifest } from '@wordrhyme/plugin';

// Mock dependencies
vi.mock('glob', () => ({
    glob: vi.fn().mockResolvedValue([]),
}));

vi.mock('node:fs/promises', () => ({
    default: {
        access: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn(),
        readdir: vi.fn().mockResolvedValue([]),
    },
    access: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    readdir: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../db', () => {
    const insertBuilder = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    const updateBuilder = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
    };

    return {
        db: {
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnValue([]),
            insert: vi.fn(() => insertBuilder),
            update: vi.fn(() => updateBuilder),
            set: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            values: vi.fn().mockResolvedValue(undefined),
        },
    };
});

vi.mock('../../trpc/router', () => ({
    registerPluginRouter: vi.fn(),
    unregisterPluginRouter: vi.fn(),
}));

vi.mock('../../config/env', () => ({
    env: {
        PLUGIN_DIR: 'plugins',
        WORDRHYME_SAFE_MODE: false,
    },
}));

vi.mock('../../plugins/dependency-resolver', () => ({
    getCoreVersion: vi.fn().mockReturnValue('0.1.0'),
    resolveDependencies: vi.fn().mockImplementation((manifests) => ({
        valid: manifests,
        invalid: [],
        loadOrder: manifests.map((m: PluginManifest) => m.pluginId),
    })),
}));

describe('Plugin Lifecycle Integration', () => {
    let pluginManager: PluginManager;

    const testManifest: PluginManifest = {
        pluginId: 'com.test.lifecycle',
        version: '1.0.0',
        name: 'Lifecycle Test Plugin',
        vendor: 'Test',
        type: 'full',
        runtime: 'node',
        engines: { wordrhyme: '^0.1.0' },
        permissions: {
            definitions: [{ key: 'test.read', description: 'Test read permission' }],
            required: [],
        },
    };

    beforeEach(() => {
        pluginManager = new PluginManager();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Full Lifecycle: Install → Enable → Disable → Uninstall', () => {
        it('should complete full plugin lifecycle', async () => {
            // Step 1: Install (load) plugin
            await (pluginManager as any).loadPlugin('/plugins/lifecycle-test', testManifest);

            // Verify plugin is loaded
            const loadedPlugin = pluginManager.getPlugin('com.test.lifecycle');
            expect(loadedPlugin).toBeDefined();
            expect(loadedPlugin?.manifest.pluginId).toBe('com.test.lifecycle');
            expect(loadedPlugin?.status).toBe('enabled');

            // Step 2: Disable plugin
            await pluginManager.disablePlugin('com.test.lifecycle');
            const disabledPlugin = pluginManager.getPlugin('com.test.lifecycle');
            expect(disabledPlugin?.status).toBe('disabled');

            // Step 3: Enable plugin again
            await pluginManager.enablePlugin('com.test.lifecycle');
            const enabledPlugin = pluginManager.getPlugin('com.test.lifecycle');
            expect(enabledPlugin?.status).toBe('enabled');

            // Step 4: Uninstall (unload) plugin
            await pluginManager.unloadPlugin('com.test.lifecycle');
            const unloadedPlugin = pluginManager.getPlugin('com.test.lifecycle');
            expect(unloadedPlugin).toBeUndefined();
        });

        it('should maintain plugin list integrity through lifecycle', async () => {
            // Start with no plugins
            expect(pluginManager.getAllPlugins()).toHaveLength(0);

            // Load plugin
            await (pluginManager as any).loadPlugin('/plugins/lifecycle-test', testManifest);
            expect(pluginManager.getAllPlugins()).toHaveLength(1);

            // Disable doesn't remove from list
            await pluginManager.disablePlugin('com.test.lifecycle');
            expect(pluginManager.getAllPlugins()).toHaveLength(1);

            // Unload removes from list
            await pluginManager.unloadPlugin('com.test.lifecycle');
            expect(pluginManager.getAllPlugins()).toHaveLength(0);
        });

        it('should handle enable on already enabled plugin gracefully', async () => {
            await (pluginManager as any).loadPlugin('/plugins/lifecycle-test', testManifest);
            const plugin = pluginManager.getPlugin('com.test.lifecycle');
            expect(plugin?.status).toBe('enabled');

            // Enable again should not throw
            await expect(pluginManager.enablePlugin('com.test.lifecycle')).resolves.not.toThrow();
            expect(pluginManager.getPlugin('com.test.lifecycle')?.status).toBe('enabled');
        });

        it('should handle disable on already disabled plugin gracefully', async () => {
            await (pluginManager as any).loadPlugin('/plugins/lifecycle-test', testManifest);
            await pluginManager.disablePlugin('com.test.lifecycle');

            // Disable again should not throw
            await expect(pluginManager.disablePlugin('com.test.lifecycle')).resolves.not.toThrow();
            expect(pluginManager.getPlugin('com.test.lifecycle')?.status).toBe('disabled');
        });

        it('should handle unload on non-existent plugin gracefully', async () => {
            // Unload non-existent plugin should not throw
            await expect(pluginManager.unloadPlugin('com.nonexistent.plugin')).resolves.not.toThrow();
        });
    });
});
