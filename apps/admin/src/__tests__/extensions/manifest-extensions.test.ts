/**
 * Manifest Extension Schema Tests
 *
 * Validates the admin.extensions[] schema in pluginManifestSchema.
 */
import { describe, it, expect } from 'vitest';
import { pluginManifestSchema } from '@wordrhyme/plugin';

const baseManifest = {
    pluginId: 'com.example.plugin',
    version: '1.0.0',
    name: 'Test Plugin',
    vendor: 'Test',
    engines: { wordrhyme: '^0.1.0' },
};

describe('admin.extensions schema', () => {
    it('should accept manifest with nav.sidebar extension', () => {
        const result = pluginManifestSchema.safeParse({
            ...baseManifest,
            admin: {
                remoteEntry: './dist/admin/remoteEntry.js',
                extensions: [
                    {
                        id: 'test.page',
                        label: 'Test Page',
                        targets: [
                            { slot: 'nav.sidebar', path: '/p/com.example.plugin', order: 10 },
                        ],
                    },
                ],
            },
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.admin?.extensions).toHaveLength(1);
            expect(result.data.admin?.extensions?.[0]?.targets[0]?.slot).toBe('nav.sidebar');
        }
    });

    it('should accept manifest with settings.plugin extension', () => {
        const result = pluginManifestSchema.safeParse({
            ...baseManifest,
            admin: {
                remoteEntry: './dist/admin/remoteEntry.js',
                extensions: [
                    {
                        id: 'test.settings',
                        label: 'Test Settings',
                        targets: [{ slot: 'settings.plugin', order: 50 }],
                    },
                ],
            },
        });

        expect(result.success).toBe(true);
    });

    it('should accept manifest with multi-slot extension', () => {
        const result = pluginManifestSchema.safeParse({
            ...baseManifest,
            admin: {
                remoteEntry: './dist/admin/remoteEntry.js',
                extensions: [
                    {
                        id: 'test.main',
                        label: 'Test Plugin',
                        icon: 'Sparkles',
                        targets: [
                            { slot: 'nav.sidebar', path: '/p/com.example.plugin', icon: 'Mail', order: 50 },
                            { slot: 'settings.plugin', order: 50 },
                        ],
                    },
                ],
            },
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.admin?.extensions?.[0]?.targets).toHaveLength(2);
        }
    });

    it('should accept manifest with dashboard.widgets extension', () => {
        const result = pluginManifestSchema.safeParse({
            ...baseManifest,
            admin: {
                remoteEntry: './dist/admin/remoteEntry.js',
                extensions: [
                    {
                        id: 'test.widget',
                        label: 'Test Widget',
                        targets: [{ slot: 'dashboard.widgets', order: 10, colSpan: 2 }],
                    },
                ],
            },
        });

        expect(result.success).toBe(true);
    });

    it('should reject extension with empty targets array', () => {
        const result = pluginManifestSchema.safeParse({
            ...baseManifest,
            admin: {
                remoteEntry: './dist/admin/remoteEntry.js',
                extensions: [
                    { id: 'test.empty', label: 'Empty Targets', targets: [] },
                ],
            },
        });

        expect(result.success).toBe(false);
    });

    it('should reject extension without id', () => {
        const result = pluginManifestSchema.safeParse({
            ...baseManifest,
            admin: {
                remoteEntry: './dist/admin/remoteEntry.js',
                extensions: [
                    { label: 'No ID', targets: [{ slot: 'settings.plugin' }] },
                ],
            },
        });

        expect(result.success).toBe(false);
    });

    it('should reject extension without label', () => {
        const result = pluginManifestSchema.safeParse({
            ...baseManifest,
            admin: {
                remoteEntry: './dist/admin/remoteEntry.js',
                extensions: [
                    { id: 'test.nolabel', targets: [{ slot: 'settings.plugin' }] },
                ],
            },
        });

        expect(result.success).toBe(false);
    });

    it('should accept both extensions and legacy menus', () => {
        const result = pluginManifestSchema.safeParse({
            ...baseManifest,
            admin: {
                remoteEntry: './dist/admin/remoteEntry.js',
                extensions: [
                    {
                        id: 'test.page',
                        label: 'Test Page',
                        targets: [{ slot: 'nav.sidebar', path: '/p/com.example.plugin' }],
                    },
                ],
                menus: [
                    { label: 'Legacy Menu', path: '/p/com.example.plugin' },
                ],
            },
        });

        expect(result.success).toBe(true);
    });

    it('should accept generic slot targets', () => {
        const result = pluginManifestSchema.safeParse({
            ...baseManifest,
            admin: {
                remoteEntry: './dist/admin/remoteEntry.js',
                extensions: [
                    {
                        id: 'test.custom',
                        label: 'Custom Slot',
                        targets: [{ slot: 'article.editor.sidebar', order: 10 }],
                    },
                ],
            },
        });

        expect(result.success).toBe(true);
    });
});
