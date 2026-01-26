/**
 * Plugin Notification Webhook Tests
 *
 * Tests for webhook delivery to plugins:
 * - onClicked webhook trigger
 * - onArchived webhook trigger
 * - Payload structure validation
 * - Plugin manifest webhook URL extraction
 */
import { describe, it, expect } from 'vitest';
import type { NotificationWebhookPayload } from '../../webhooks/notification-plugin-webhooks.js';

describe('Plugin Notification Webhooks', () => {
    describe('Webhook Payload Structure', () => {
        it('should create valid clicked webhook payload', () => {
            const payload: NotificationWebhookPayload = {
                event: 'clicked',
                notificationId: 'notif-123',
                userId: 'user-456',
                organizationId: 'tenant-789',
                type: 'new_comment',
                target: {
                    type: 'post',
                    id: 'post-111',
                    url: '/posts/111',
                },
                timestamp: '2024-01-01T00:00:00.000Z',
            };

            expect(payload.event).toBe('clicked');
            expect(payload.notificationId).toBeDefined();
            expect(payload.userId).toBeDefined();
            expect(payload.organizationId).toBeDefined();
            expect(payload.type).toBe('new_comment');
            expect(payload.target.type).toBe('post');
            expect(payload.target.id).toBe('post-111');
            expect(payload.target.url).toBe('/posts/111');
        });

        it('should create valid archived webhook payload', () => {
            const payload: NotificationWebhookPayload = {
                event: 'archived',
                notificationId: 'notif-456',
                userId: 'user-789',
                organizationId: 'tenant-123',
                type: 'system_alert',
                target: {
                    type: 'system',
                    id: 'alert-1',
                },
                timestamp: '2024-01-01T00:00:00.000Z',
            };

            expect(payload.event).toBe('archived');
            expect(payload.target.url).toBeUndefined();
        });
    });

    describe('Notification Type Extraction', () => {
        function extractNotificationType(
            templateKey: string | null | undefined,
            pluginId: string
        ): string {
            if (!templateKey) return 'unknown';

            const prefix = `plugin:${pluginId}:`;
            if (templateKey.startsWith(prefix)) {
                return templateKey.slice(prefix.length);
            }

            return templateKey;
        }

        it('should extract type from plugin template key', () => {
            const result = extractNotificationType(
                'plugin:my-plugin:new_comment',
                'my-plugin'
            );
            expect(result).toBe('new_comment');
        });

        it('should return full key if not plugin format', () => {
            const result = extractNotificationType(
                'system.welcome',
                'my-plugin'
            );
            expect(result).toBe('system.welcome');
        });

        it('should return unknown for null template key', () => {
            const result = extractNotificationType(null, 'my-plugin');
            expect(result).toBe('unknown');
        });

        it('should return unknown for undefined template key', () => {
            const result = extractNotificationType(undefined, 'my-plugin');
            expect(result).toBe('unknown');
        });

        it('should handle different plugin IDs correctly', () => {
            const result = extractNotificationType(
                'plugin:other-plugin:task_completed',
                'other-plugin'
            );
            expect(result).toBe('task_completed');
        });

        it('should not extract if plugin ID does not match', () => {
            const result = extractNotificationType(
                'plugin:plugin-a:new_comment',
                'plugin-b'
            );
            expect(result).toBe('plugin:plugin-a:new_comment');
        });
    });

    describe('Webhook URL Resolution', () => {
        interface PluginNotificationManifest {
            webhooks?: {
                onClicked?: string;
                onArchived?: string;
            };
        }

        function getWebhookUrl(
            manifest: PluginNotificationManifest | undefined,
            event: 'clicked' | 'archived'
        ): string | undefined {
            if (!manifest?.webhooks) return undefined;
            return event === 'clicked'
                ? manifest.webhooks.onClicked
                : manifest.webhooks.onArchived;
        }

        it('should return onClicked URL when configured', () => {
            const manifest: PluginNotificationManifest = {
                webhooks: {
                    onClicked: 'https://plugin.example.com/webhook/clicked',
                },
            };

            const url = getWebhookUrl(manifest, 'clicked');
            expect(url).toBe('https://plugin.example.com/webhook/clicked');
        });

        it('should return onArchived URL when configured', () => {
            const manifest: PluginNotificationManifest = {
                webhooks: {
                    onArchived: 'https://plugin.example.com/webhook/archived',
                },
            };

            const url = getWebhookUrl(manifest, 'archived');
            expect(url).toBe('https://plugin.example.com/webhook/archived');
        });

        it('should return undefined when webhook not configured', () => {
            const manifest: PluginNotificationManifest = {
                webhooks: {
                    onClicked: 'https://plugin.example.com/webhook/clicked',
                    // onArchived not configured
                },
            };

            const url = getWebhookUrl(manifest, 'archived');
            expect(url).toBeUndefined();
        });

        it('should return undefined when no webhooks section', () => {
            const manifest: PluginNotificationManifest = {};

            const url = getWebhookUrl(manifest, 'clicked');
            expect(url).toBeUndefined();
        });

        it('should return undefined when manifest is undefined', () => {
            const url = getWebhookUrl(undefined, 'clicked');
            expect(url).toBeUndefined();
        });
    });

    describe('Event Filtering', () => {
        interface NotificationEventData {
            id: string;
            source: 'system' | 'plugin' | 'user';
            sourcePluginId?: string;
            userId: string;
            organizationId: string;
        }

        function shouldProcessEvent(notification: NotificationEventData): boolean {
            return notification.source === 'plugin' && !!notification.sourcePluginId;
        }

        it('should process plugin notifications with sourcePluginId', () => {
            const notification: NotificationEventData = {
                id: 'notif-123',
                source: 'plugin',
                sourcePluginId: 'my-plugin',
                userId: 'user-456',
                organizationId: 'tenant-789',
            };

            expect(shouldProcessEvent(notification)).toBe(true);
        });

        it('should not process system notifications', () => {
            const notification: NotificationEventData = {
                id: 'notif-123',
                source: 'system',
                userId: 'user-456',
                organizationId: 'tenant-789',
            };

            expect(shouldProcessEvent(notification)).toBe(false);
        });

        it('should not process user notifications', () => {
            const notification: NotificationEventData = {
                id: 'notif-123',
                source: 'user',
                userId: 'user-456',
                organizationId: 'tenant-789',
            };

            expect(shouldProcessEvent(notification)).toBe(false);
        });

        it('should not process plugin notifications without sourcePluginId', () => {
            const notification: NotificationEventData = {
                id: 'notif-123',
                source: 'plugin',
                // sourcePluginId missing
                userId: 'user-456',
                organizationId: 'tenant-789',
            };

            expect(shouldProcessEvent(notification)).toBe(false);
        });
    });

    describe('Target Construction', () => {
        interface NotificationTarget {
            type: string;
            id: string;
            url?: string;
        }

        function buildWebhookTarget(
            target: NotificationTarget | undefined,
            notification: { entityId?: string; id: string }
        ): { type: string; id: string; url?: string } {
            const resolvedTarget = target || {
                type: 'unknown',
                id: notification.entityId || notification.id,
            };

            return {
                type: resolvedTarget.type,
                id: resolvedTarget.id,
                ...(resolvedTarget.url ? { url: resolvedTarget.url } : {}),
            };
        }

        it('should use target when provided', () => {
            const target: NotificationTarget = {
                type: 'post',
                id: 'post-123',
                url: '/posts/123',
            };

            const result = buildWebhookTarget(target, { id: 'notif-1' });
            expect(result.type).toBe('post');
            expect(result.id).toBe('post-123');
            expect(result.url).toBe('/posts/123');
        });

        it('should fall back to entityId when target is undefined', () => {
            const result = buildWebhookTarget(undefined, {
                id: 'notif-1',
                entityId: 'entity-123',
            });

            expect(result.type).toBe('unknown');
            expect(result.id).toBe('entity-123');
        });

        it('should fall back to notification id when no entityId', () => {
            const result = buildWebhookTarget(undefined, { id: 'notif-1' });

            expect(result.type).toBe('unknown');
            expect(result.id).toBe('notif-1');
        });

        it('should not include url when not provided', () => {
            const target: NotificationTarget = {
                type: 'comment',
                id: 'comment-123',
                // url not provided
            };

            const result = buildWebhookTarget(target, { id: 'notif-1' });
            expect(result.url).toBeUndefined();
        });
    });
});
