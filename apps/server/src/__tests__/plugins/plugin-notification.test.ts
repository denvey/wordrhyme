/**
 * Plugin Notification Unit Tests
 *
 * Tests for the plugin notification system including:
 * - Manifest validation
 * - Aggregation strategy groupKey generation
 * - Rate limiting enforcement
 * - Permission checks
 */
import { describe, it, expect } from 'vitest';
import { PluginNotificationValidationError, RateLimitExceededError, pluginNotificationJobPayloadSchema } from '../../plugins/dto/plugin-notification.dto.js';

describe('Plugin Notification System', () => {
    describe('Job Payload Validation', () => {
        it('should validate a valid job payload', () => {
            const payload = {
                pluginId: 'my-plugin',
                organizationId: 'tenant-123',
                type: 'new_comment',
                userId: 'user-456',
                target: {
                    type: 'post',
                    id: 'post-789',
                    url: '/posts/789',
                },
            };

            const result = pluginNotificationJobPayloadSchema.safeParse(payload);
            expect(result.success).toBe(true);
        });

        it('should validate payload with actor', () => {
            const payload = {
                pluginId: 'my-plugin',
                organizationId: 'tenant-123',
                type: 'liked_post',
                userId: 'user-456',
                actor: {
                    id: 'user-789',
                    type: 'user',
                    name: 'John Doe',
                    avatarUrl: 'https://example.com/avatar.jpg',
                },
                target: {
                    type: 'post',
                    id: 'post-123',
                    url: '/posts/123',
                },
            };

            const result = pluginNotificationJobPayloadSchema.safeParse(payload);
            expect(result.success).toBe(true);
        });

        it('should reject payload without pluginId', () => {
            const payload = {
                organizationId: 'tenant-123',
                type: 'new_comment',
                userId: 'user-456',
                target: {
                    type: 'post',
                    id: 'post-789',
                    url: '/posts/789',
                },
            };

            const result = pluginNotificationJobPayloadSchema.safeParse(payload);
            expect(result.success).toBe(false);
        });

        it('should reject payload without target', () => {
            const payload = {
                pluginId: 'my-plugin',
                organizationId: 'tenant-123',
                type: 'new_comment',
                userId: 'user-456',
            };

            const result = pluginNotificationJobPayloadSchema.safeParse(payload);
            expect(result.success).toBe(false);
        });

        it('should reject payload with invalid type format', () => {
            const payload = {
                pluginId: 'my-plugin',
                organizationId: 'tenant-123',
                type: 'New-Comment', // Invalid: uppercase and hyphen
                userId: 'user-456',
                target: {
                    type: 'post',
                    id: 'post-789',
                    url: '/posts/789',
                },
            };

            const result = pluginNotificationJobPayloadSchema.safeParse(payload);
            expect(result.success).toBe(false);
        });

        it('should accept payload with optional fields', () => {
            const payload = {
                pluginId: 'my-plugin',
                organizationId: 'tenant-123',
                type: 'new_comment',
                userId: 'user-456',
                target: {
                    type: 'post',
                    id: 'post-789',
                    url: '/posts/789',
                    previewImage: 'https://example.com/preview.jpg',
                },
                data: { customField: 'value' },
                locale: 'zh-CN',
                requestId: 'req-123',
                enqueuedAt: '2024-01-01T00:00:00Z',
            };

            const result = pluginNotificationJobPayloadSchema.safeParse(payload);
            expect(result.success).toBe(true);
        });
    });

    describe('Manifest Notification Type Validation', () => {
        interface NotificationType {
            id: string;
            category: 'system' | 'collaboration' | 'social';
            aggregation?: 'none' | 'by_target' | 'by_actor' | 'by_type';
            i18n: Record<string, { title: string; description?: string }>;
        }

        interface NotificationManifest {
            permissions: string[];
            types: NotificationType[];
        }

        function validateNotificationType(
            manifest: NotificationManifest | undefined,
            typeId: string
        ): NotificationType | null {
            if (!manifest) return null;
            if (!manifest.permissions?.includes('notification:send')) return null;
            return manifest.types?.find(t => t.id === typeId) || null;
        }

        it('should find declared notification type', () => {
            const manifest: NotificationManifest = {
                permissions: ['notification:send'],
                types: [
                    {
                        id: 'new_comment',
                        category: 'collaboration',
                        aggregation: 'by_target',
                        i18n: {
                            'en-US': { title: 'New Comment', description: 'A new comment was posted' },
                            'zh-CN': { title: '新评论', description: '有人发表了新评论' },
                        },
                    },
                ],
            };

            const result = validateNotificationType(manifest, 'new_comment');
            expect(result).not.toBeNull();
            expect(result?.id).toBe('new_comment');
            expect(result?.category).toBe('collaboration');
        });

        it('should return null for undeclared type', () => {
            const manifest: NotificationManifest = {
                permissions: ['notification:send'],
                types: [
                    {
                        id: 'new_comment',
                        category: 'collaboration',
                        i18n: { 'en-US': { title: 'New Comment' } },
                    },
                ],
            };

            const result = validateNotificationType(manifest, 'unknown_type');
            expect(result).toBeNull();
        });

        it('should return null when permission is missing', () => {
            const manifest: NotificationManifest = {
                permissions: ['other:permission'],
                types: [
                    {
                        id: 'new_comment',
                        category: 'collaboration',
                        i18n: { 'en-US': { title: 'New Comment' } },
                    },
                ],
            };

            const result = validateNotificationType(manifest, 'new_comment');
            expect(result).toBeNull();
        });

        it('should return null for undefined manifest', () => {
            const result = validateNotificationType(undefined, 'new_comment');
            expect(result).toBeNull();
        });
    });

    describe('Aggregation Strategy GroupKey Generation', () => {
        type AggregationStrategy = 'none' | 'by_target' | 'by_actor' | 'by_type';

        function buildGroupKey(
            pluginId: string,
            typeId: string,
            aggregation: AggregationStrategy,
            actor?: { id: string },
            target?: { type: string; id: string }
        ): string | undefined {
            if (aggregation === 'none') {
                return undefined;
            }

            const prefix = `plugin:${pluginId}:${typeId}`;

            switch (aggregation) {
                case 'by_target':
                    if (!target) return undefined;
                    return `${prefix}:target:${target.type}:${target.id}`;

                case 'by_actor':
                    if (!actor) return undefined;
                    return `${prefix}:actor:${actor.id}`;

                case 'by_type':
                    return prefix;

                default:
                    return undefined;
            }
        }

        it('should return undefined for aggregation=none', () => {
            const result = buildGroupKey(
                'my-plugin',
                'new_comment',
                'none',
                { id: 'user-123' },
                { type: 'post', id: 'post-456' }
            );
            expect(result).toBeUndefined();
        });

        it('should generate by_target groupKey', () => {
            const result = buildGroupKey(
                'my-plugin',
                'liked_post',
                'by_target',
                { id: 'user-123' },
                { type: 'post', id: 'post-456' }
            );
            expect(result).toBe('plugin:my-plugin:liked_post:target:post:post-456');
        });

        it('should return undefined for by_target without target', () => {
            const result = buildGroupKey(
                'my-plugin',
                'liked_post',
                'by_target',
                { id: 'user-123' }
            );
            expect(result).toBeUndefined();
        });

        it('should generate by_actor groupKey', () => {
            const result = buildGroupKey(
                'my-plugin',
                'user_activity',
                'by_actor',
                { id: 'user-123' },
                { type: 'post', id: 'post-456' }
            );
            expect(result).toBe('plugin:my-plugin:user_activity:actor:user-123');
        });

        it('should return undefined for by_actor without actor', () => {
            const result = buildGroupKey(
                'my-plugin',
                'user_activity',
                'by_actor',
                undefined,
                { type: 'post', id: 'post-456' }
            );
            expect(result).toBeUndefined();
        });

        it('should generate by_type groupKey', () => {
            const result = buildGroupKey(
                'my-plugin',
                'system_update',
                'by_type',
                { id: 'user-123' },
                { type: 'system', id: 'update-1' }
            );
            expect(result).toBe('plugin:my-plugin:system_update');
        });

        it('should generate by_type groupKey without actor/target', () => {
            const result = buildGroupKey(
                'my-plugin',
                'system_update',
                'by_type'
            );
            expect(result).toBe('plugin:my-plugin:system_update');
        });
    });

    describe('PluginNotificationValidationError', () => {
        it('should create error with plugin and type info', () => {
            const error = new PluginNotificationValidationError(
                'Type not declared',
                'my-plugin',
                'unknown_type'
            );

            expect(error.message).toBe('Type not declared');
            expect(error.pluginId).toBe('my-plugin');
            expect(error.type).toBe('unknown_type');
            expect(error.name).toBe('PluginNotificationValidationError');
        });

        it('should create error without type', () => {
            const error = new PluginNotificationValidationError(
                'Plugin not found',
                'my-plugin'
            );

            expect(error.pluginId).toBe('my-plugin');
            expect(error.type).toBeUndefined();
        });
    });

    describe('RateLimitExceededError', () => {
        it('should create error with rate limit details', () => {
            const error = new RateLimitExceededError('my-plugin', {
                remaining: 0,
                resetAt: '2024-01-01T00:01:00Z',
                retryAfter: 30,
                reason: 'RATE_LIMIT_EXCEEDED',
            });

            expect(error.message).toBe('Rate limit exceeded for plugin my-plugin');
            expect(error.pluginId).toBe('my-plugin');
            expect(error.result.remaining).toBe(0);
            expect(error.result.retryAfter).toBe(30);
        });

        it('should convert to response format', () => {
            const error = new RateLimitExceededError('my-plugin', {
                remaining: 5,
                resetAt: '2024-01-01T00:01:00Z',
                retryAfter: 60,
                reason: 'RATE_LIMIT_EXCEEDED',
            });

            const response = error.toResponse();
            expect(response.error).toBe('RATE_LIMIT_EXCEEDED');
            expect(response.retryAfter).toBe(60);
            expect(response.limit.remaining).toBe(5);
            expect(response.limit.resetAt).toBe('2024-01-01T00:01:00Z');
        });

        it('should handle circuit breaker reason', () => {
            const error = new RateLimitExceededError('my-plugin', {
                remaining: 0,
                resetAt: '2024-01-01T00:01:00Z',
                retryAfter: 120,
                reason: 'CIRCUIT_BREAKER_OPEN',
            });

            const response = error.toResponse();
            expect(response.error).toBe('CIRCUIT_BREAKER_OPEN');
        });
    });
});
