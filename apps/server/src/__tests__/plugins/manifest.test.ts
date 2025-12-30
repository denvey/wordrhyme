/**
 * Plugin Manifest Validation Tests
 *
 * Contract Compliance Tests:
 * - 9.1.6: Invalid plugin manifest rejected
 */
import { describe, it, expect } from 'vitest';
import { pluginManifestSchema } from '@wordrhyme/plugin';

describe('Plugin Manifest Validation (9.1.6)', () => {
    describe('valid manifests', () => {
        it('should accept a valid minimal manifest', () => {
            const manifest = {
                pluginId: 'com.example.hello',
                version: '1.0.0',
                name: 'Hello World Plugin',
                vendor: 'Example Inc',
                engines: {
                    wordrhyme: '^0.1.0',
                },
            };

            const result = pluginManifestSchema.safeParse(manifest);

            expect(result.success).toBe(true);
        });

        it('should accept a full manifest with all fields', () => {
            const manifest = {
                pluginId: 'com.example.analytics',
                version: '2.1.0',
                name: 'Analytics Plugin',
                description: 'Track user behavior and page views',
                vendor: 'Example Inc',
                type: 'full',
                runtime: 'node',
                engines: {
                    wordrhyme: '^0.1.0',
                    node: '>=20.0.0',
                },
                capabilities: {
                    ui: {
                        adminPage: true,
                        settingsTab: true,
                    },
                    data: {
                        read: true,
                        write: true,
                    },
                },
                permissions: {
                    definitions: [
                        { key: 'analytics.view', description: 'View analytics dashboard' },
                        { key: 'analytics.manage', description: 'Manage analytics settings' },
                    ],
                    required: ['content:read:space'],
                },
                server: {
                    entry: './dist/server/index.js',
                    router: true,
                    hooks: ['onInstall', 'onEnable', 'onDisable'],
                },
                admin: {
                    remoteEntry: './dist/admin/remoteEntry.js',
                    exposes: {
                        './SettingsTab': './src/components/SettingsTab',
                    },
                },
                dependencies: ['com.example.core'],
                dataRetention: {
                    onUninstall: 'archive',
                },
            };

            const result = pluginManifestSchema.safeParse(manifest);

            expect(result.success).toBe(true);
        });
    });

    describe('invalid manifests - pluginId', () => {
        it('should reject manifest without pluginId', () => {
            const manifest = {
                version: '1.0.0',
                name: 'Missing ID Plugin',
                vendor: 'Test',
                engines: { wordrhyme: '^0.1.0' },
            };

            const result = pluginManifestSchema.safeParse(manifest);

            expect(result.success).toBe(false);
        });

        it('should reject invalid pluginId format (not reverse-domain)', () => {
            const manifest = {
                pluginId: 'invalid-plugin-id', // Missing dot separator
                version: '1.0.0',
                name: 'Invalid ID Plugin',
                vendor: 'Test',
                engines: { wordrhyme: '^0.1.0' },
            };

            const result = pluginManifestSchema.safeParse(manifest);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain('reverse-domain');
            }
        });

        it('should reject pluginId with uppercase letters', () => {
            const manifest = {
                pluginId: 'com.Example.Plugin', // Uppercase not allowed
                version: '1.0.0',
                name: 'Uppercase Plugin',
                vendor: 'Test',
                engines: { wordrhyme: '^0.1.0' },
            };

            const result = pluginManifestSchema.safeParse(manifest);

            expect(result.success).toBe(false);
        });
    });

    describe('invalid manifests - version', () => {
        it('should reject manifest without version', () => {
            const manifest = {
                pluginId: 'com.example.plugin',
                name: 'No Version Plugin',
                vendor: 'Test',
                engines: { wordrhyme: '^0.1.0' },
            };

            const result = pluginManifestSchema.safeParse(manifest);

            expect(result.success).toBe(false);
        });

        it('should reject invalid version format', () => {
            const manifest = {
                pluginId: 'com.example.plugin',
                version: 'v1.0', // Missing patch version
                name: 'Bad Version Plugin',
                vendor: 'Test',
                engines: { wordrhyme: '^0.1.0' },
            };

            const result = pluginManifestSchema.safeParse(manifest);

            expect(result.success).toBe(false);
        });
    });

    describe('invalid manifests - engines', () => {
        it('should reject manifest without engines', () => {
            const manifest = {
                pluginId: 'com.example.plugin',
                version: '1.0.0',
                name: 'No Engines Plugin',
                vendor: 'Test',
            };

            const result = pluginManifestSchema.safeParse(manifest);

            expect(result.success).toBe(false);
        });

        it('should reject manifest without wordrhyme engine', () => {
            const manifest = {
                pluginId: 'com.example.plugin',
                version: '1.0.0',
                name: 'No WordRhyme Engine Plugin',
                vendor: 'Test',
                engines: {}, // Missing wordrhyme field
            };

            const result = pluginManifestSchema.safeParse(manifest);

            expect(result.success).toBe(false);
        });
    });

    describe('invalid manifests - permissions', () => {
        it('should reject invalid permission key format', () => {
            const manifest = {
                pluginId: 'com.example.plugin',
                version: '1.0.0',
                name: 'Bad Permissions Plugin',
                vendor: 'Test',
                engines: { wordrhyme: '^0.1.0' },
                permissions: {
                    definitions: [
                        { key: 'INVALID-KEY!' }, // Invalid characters
                    ],
                },
            };

            const result = pluginManifestSchema.safeParse(manifest);

            expect(result.success).toBe(false);
        });
    });

    describe('invalid manifests - type', () => {
        it('should reject invalid plugin type', () => {
            const manifest = {
                pluginId: 'com.example.plugin',
                version: '1.0.0',
                name: 'Invalid Type Plugin',
                vendor: 'Test',
                type: 'invalid-type', // Not a valid enum value
                engines: { wordrhyme: '^0.1.0' },
            };

            const result = pluginManifestSchema.safeParse(manifest);

            expect(result.success).toBe(false);
        });
    });

    describe('invalid manifests - dataRetention', () => {
        it('should reject invalid data retention strategy', () => {
            const manifest = {
                pluginId: 'com.example.plugin',
                version: '1.0.0',
                name: 'Invalid Retention Plugin',
                vendor: 'Test',
                engines: { wordrhyme: '^0.1.0' },
                dataRetention: {
                    onUninstall: 'invalid-strategy', // Not a valid enum
                },
            };

            const result = pluginManifestSchema.safeParse(manifest);

            expect(result.success).toBe(false);
        });
    });
});
