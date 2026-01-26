/**
 * Plugin Notification Permission Tests
 *
 * Tests for permission checks in the plugin notification system:
 * - notification:send permission validation
 * - notification:send:batch permission validation
 * - Plugin manifest permission declarations
 * - Tenant/user validation
 */
import { describe, it, expect } from 'vitest';
import { PermissionDeniedError } from '../../plugins/capabilities/permission.capability.js';

describe('Plugin Notification Permissions', () => {
    describe('Permission Declaration Validation', () => {
        interface PluginManifest {
            notifications?: {
                permissions?: string[];
                types?: Array<{ id: string }>;
            };
        }

        function hasNotificationPermission(
            manifest: PluginManifest | undefined,
            permission: string
        ): boolean {
            return manifest?.notifications?.permissions?.includes(permission) ?? false;
        }

        it('should detect notification:send permission', () => {
            const manifest: PluginManifest = {
                notifications: {
                    permissions: ['notification:send'],
                    types: [{ id: 'new_comment' }],
                },
            };

            expect(hasNotificationPermission(manifest, 'notification:send')).toBe(true);
        });

        it('should detect notification:send:batch permission', () => {
            const manifest: PluginManifest = {
                notifications: {
                    permissions: ['notification:send', 'notification:send:batch'],
                    types: [{ id: 'bulk_update' }],
                },
            };

            expect(hasNotificationPermission(manifest, 'notification:send:batch')).toBe(true);
        });

        it('should return false when permission not declared', () => {
            const manifest: PluginManifest = {
                notifications: {
                    permissions: ['notification:read:own'],
                    types: [{ id: 'new_comment' }],
                },
            };

            expect(hasNotificationPermission(manifest, 'notification:send')).toBe(false);
        });

        it('should return false when notifications section missing', () => {
            const manifest: PluginManifest = {};

            expect(hasNotificationPermission(manifest, 'notification:send')).toBe(false);
        });

        it('should return false when permissions array missing', () => {
            const manifest: PluginManifest = {
                notifications: {
                    types: [{ id: 'new_comment' }],
                },
            };

            expect(hasNotificationPermission(manifest, 'notification:send')).toBe(false);
        });

        it('should return false for undefined manifest', () => {
            expect(hasNotificationPermission(undefined, 'notification:send')).toBe(false);
        });
    });

    describe('Permission Check Flow', () => {
        interface PluginContext {
            pluginId: string;
            organizationId?: string;
            manifest?: {
                notifications?: {
                    permissions?: string[];
                };
            };
        }

        function checkSendPermission(context: PluginContext): void {
            // 1. Validate tenant context
            if (!context.organizationId) {
                throw new Error('Cannot send notification without tenant context');
            }

            // 2. Validate notification permission declared in manifest
            const hasPermission = context.manifest?.notifications?.permissions?.includes('notification:send');
            if (!hasPermission) {
                throw new PermissionDeniedError('notification:send');
            }
        }

        it('should pass when all checks succeed', () => {
            const context: PluginContext = {
                pluginId: 'my-plugin',
                organizationId: 'tenant-123',
                manifest: {
                    notifications: {
                        permissions: ['notification:send'],
                    },
                },
            };

            expect(() => checkSendPermission(context)).not.toThrow();
        });

        it('should throw when tenant context missing', () => {
            const context: PluginContext = {
                pluginId: 'my-plugin',
                // organizationId missing
                manifest: {
                    notifications: {
                        permissions: ['notification:send'],
                    },
                },
            };

            expect(() => checkSendPermission(context)).toThrow('Cannot send notification without tenant context');
        });

        it('should throw PermissionDeniedError when permission missing', () => {
            const context: PluginContext = {
                pluginId: 'my-plugin',
                organizationId: 'tenant-123',
                manifest: {
                    notifications: {
                        permissions: [], // Empty permissions
                    },
                },
            };

            expect(() => checkSendPermission(context)).toThrow(PermissionDeniedError);
        });
    });

    describe('PermissionDeniedError', () => {
        it('should create error with capability name', () => {
            const error = new PermissionDeniedError('notification:send');

            expect(error.name).toBe('PermissionDeniedError');
            expect(error.capability).toBe('notification:send');
            expect(error.message).toContain('notification:send');
        });

        it('should be instance of Error', () => {
            const error = new PermissionDeniedError('notification:send:batch');

            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(PermissionDeniedError);
        });
    });

    describe('Notification Type Validation', () => {
        interface NotificationType {
            id: string;
            category: string;
        }

        interface PluginManifest {
            notifications?: {
                permissions?: string[];
                types?: NotificationType[];
            };
        }

        function validateNotificationType(
            manifest: PluginManifest | undefined,
            typeId: string
        ): { valid: boolean; error?: string } {
            if (!manifest?.notifications?.permissions?.includes('notification:send')) {
                return { valid: false, error: 'Permission notification:send not declared' };
            }

            const typeDef = manifest.notifications.types?.find(t => t.id === typeId);
            if (!typeDef) {
                return { valid: false, error: `Notification type '${typeId}' not declared in manifest` };
            }

            return { valid: true };
        }

        it('should validate declared type', () => {
            const manifest: PluginManifest = {
                notifications: {
                    permissions: ['notification:send'],
                    types: [
                        { id: 'new_comment', category: 'collaboration' },
                        { id: 'task_completed', category: 'system' },
                    ],
                },
            };

            expect(validateNotificationType(manifest, 'new_comment').valid).toBe(true);
            expect(validateNotificationType(manifest, 'task_completed').valid).toBe(true);
        });

        it('should reject undeclared type', () => {
            const manifest: PluginManifest = {
                notifications: {
                    permissions: ['notification:send'],
                    types: [{ id: 'new_comment', category: 'collaboration' }],
                },
            };

            const result = validateNotificationType(manifest, 'unknown_type');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('unknown_type');
            expect(result.error).toContain('not declared');
        });

        it('should reject when permission missing', () => {
            const manifest: PluginManifest = {
                notifications: {
                    permissions: [], // No notification:send
                    types: [{ id: 'new_comment', category: 'collaboration' }],
                },
            };

            const result = validateNotificationType(manifest, 'new_comment');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Permission');
        });
    });

    describe('Tenant/User Validation', () => {
        interface NotificationParams {
            userId: string;
            organizationId: string;
            pluginTenantId: string;
        }

        function validateTenantContext(params: NotificationParams): { valid: boolean; error?: string } {
            // Plugin can only send notifications within its tenant context
            if (params.organizationId !== params.pluginTenantId) {
                return {
                    valid: false,
                    error: 'Plugin cannot send notifications to users in different tenant',
                };
            }

            return { valid: true };
        }

        it('should allow notification within same tenant', () => {
            const params: NotificationParams = {
                userId: 'user-123',
                organizationId: 'tenant-456',
                pluginTenantId: 'tenant-456',
            };

            expect(validateTenantContext(params).valid).toBe(true);
        });

        it('should reject cross-tenant notification', () => {
            const params: NotificationParams = {
                userId: 'user-123',
                organizationId: 'tenant-456',
                pluginTenantId: 'tenant-789', // Different tenant
            };

            const result = validateTenantContext(params);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('different tenant');
        });
    });

    describe('Batch Permission Check', () => {
        interface PluginManifest {
            notifications?: {
                permissions?: string[];
            };
        }

        function hasBatchPermission(manifest: PluginManifest | undefined): boolean {
            const permissions = manifest?.notifications?.permissions ?? [];
            // Must have both base permission and batch permission
            return (
                permissions.includes('notification:send') &&
                permissions.includes('notification:send:batch')
            );
        }

        it('should require both send and batch permissions', () => {
            const manifest: PluginManifest = {
                notifications: {
                    permissions: ['notification:send', 'notification:send:batch'],
                },
            };

            expect(hasBatchPermission(manifest)).toBe(true);
        });

        it('should reject when only send permission', () => {
            const manifest: PluginManifest = {
                notifications: {
                    permissions: ['notification:send'],
                },
            };

            expect(hasBatchPermission(manifest)).toBe(false);
        });

        it('should reject when only batch permission (missing base)', () => {
            const manifest: PluginManifest = {
                notifications: {
                    permissions: ['notification:send:batch'],
                },
            };

            expect(hasBatchPermission(manifest)).toBe(false);
        });
    });
});
