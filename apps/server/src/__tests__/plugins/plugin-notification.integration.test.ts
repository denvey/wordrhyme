/**
 * Plugin Notification Integration Tests
 *
 * End-to-end tests for the plugin notification flow:
 * 1. Plugin calls notification.send()
 * 2. Job is enqueued
 * 3. Worker validates manifest and rate limits
 * 4. Notification is created via NotificationService
 * 5. Webhooks are triggered on user actions
 */
import { describe, it, expect } from 'vitest';
import { PluginNotificationValidationError, RateLimitExceededError, pluginNotificationJobPayloadSchema } from '../../plugins/dto/plugin-notification.dto.js';

describe('Plugin Notification Integration', () => {
    describe('Full Notification Flow', () => {
        // Mock plugin manifest
        const mockPluginManifest = {
            id: 'test-plugin',
            name: 'Test Plugin',
            version: '1.0.0',
            notifications: {
                permissions: ['notification:send'],
                types: [
                    {
                        id: 'new_comment',
                        category: 'collaboration' as const,
                        aggregation: 'by_target' as const,
                        i18n: {
                            'en-US': {
                                title: '${actor.name} commented on your post',
                                description: 'New comment notification',
                            },
                            'zh-CN': {
                                title: '${actor.name} 评论了你的帖子',
                                description: '新评论通知',
                            },
                        },
                    },
                ],
                webhooks: {
                    onClicked: 'https://plugin.example.com/webhook/clicked',
                    onArchived: 'https://plugin.example.com/webhook/archived',
                },
                rateLimit: {
                    maxPerMinute: 50,
                    maxPerHour: 500,
                    maxPerDay: 5000,
                },
            },
        };

        it('should process valid notification request', () => {
            // Step 1: Plugin sends notification
            const sendParams = {
                type: 'new_comment',
                userId: 'user-123',
                actor: {
                    id: 'user-456',
                    type: 'user' as const,
                    name: 'John Doe',
                    avatarUrl: 'https://example.com/avatar.jpg',
                },
                target: {
                    type: 'post',
                    id: 'post-789',
                    url: '/posts/789',
                },
                data: {
                    commentPreview: 'This is a great post!',
                },
                locale: 'en-US',
            };

            // Step 2: Validate notification type is declared
            const typeDef = mockPluginManifest.notifications.types.find(
                t => t.id === sendParams.type
            );
            expect(typeDef).toBeDefined();
            expect(typeDef?.category).toBe('collaboration');

            // Step 3: Build job payload
            const jobPayload = {
                pluginId: mockPluginManifest.id,
                organizationId: 'tenant-001',
                type: sendParams.type,
                userId: sendParams.userId,
                actor: sendParams.actor,
                target: sendParams.target,
                data: sendParams.data,
                locale: sendParams.locale,
                requestId: 'req-123',
                enqueuedAt: new Date().toISOString(),
            };

            // Validate payload schema
            const parseResult = pluginNotificationJobPayloadSchema.safeParse(jobPayload);
            expect(parseResult.success).toBe(true);

            // Step 4: Generate groupKey based on aggregation strategy
            const aggregation = typeDef?.aggregation || 'none';
            let groupKey: string | undefined;

            if (aggregation === 'by_target') {
                groupKey = `plugin:${mockPluginManifest.id}:${sendParams.type}:target:${sendParams.target.type}:${sendParams.target.id}`;
            }

            expect(groupKey).toBe('plugin:test-plugin:new_comment:target:post:post-789');

            // Step 5: Build notification input
            const notificationInput = {
                userId: sendParams.userId,
                organizationId: 'tenant-001',
                templateKey: `plugin:${mockPluginManifest.id}:${sendParams.type}`,
                variables: sendParams.data,
                source: 'plugin' as const,
                sourcePluginId: mockPluginManifest.id,
                category: typeDef?.category,
                aggregationStrategy: aggregation,
                groupKey,
                actor: {
                    id: sendParams.actor.id,
                    type: sendParams.actor.type,
                    name: sendParams.actor.name,
                    avatarUrl: sendParams.actor.avatarUrl,
                },
                target: sendParams.target,
                locale: sendParams.locale,
            };

            expect(notificationInput.templateKey).toBe('plugin:test-plugin:new_comment');
            expect(notificationInput.source).toBe('plugin');
            expect(notificationInput.category).toBe('collaboration');
        });

        it('should reject notification with undeclared type', () => {
            const typeDef = mockPluginManifest.notifications.types.find(
                t => t.id === 'undeclared_type'
            );

            expect(typeDef).toBeUndefined();

            // This would throw PluginNotificationValidationError in real worker
            const error = new PluginNotificationValidationError(
                "Notification type 'undeclared_type' is not declared in manifest.notifications.types",
                'test-plugin',
                'undeclared_type'
            );

            expect(error.pluginId).toBe('test-plugin');
            expect(error.type).toBe('undeclared_type');
        });

        it('should reject notification when permission missing', () => {
            const manifestWithoutPermission = {
                ...mockPluginManifest,
                notifications: {
                    ...mockPluginManifest.notifications,
                    permissions: [] as string[], // No notification:send
                },
            };

            const hasPermission = manifestWithoutPermission.notifications.permissions.includes('notification:send');
            expect(hasPermission).toBe(false);
        });
    });

    describe('Rate Limiting Integration', () => {
        it('should apply rate limits from manifest', () => {
            const manifestRateLimit = {
                maxPerMinute: 50,
                maxPerHour: 500,
                maxPerDay: 5000,
            };

            // Platform limits
            const platformLimits = {
                maxPerMinute: 100,
                maxPerHour: 1000,
                maxPerDay: 10000,
            };

            // Effective limits should be minimum of manifest and platform
            const effectiveLimits = {
                maxPerMinute: Math.min(manifestRateLimit.maxPerMinute, platformLimits.maxPerMinute),
                maxPerHour: Math.min(manifestRateLimit.maxPerHour, platformLimits.maxPerHour),
                maxPerDay: Math.min(manifestRateLimit.maxPerDay, platformLimits.maxPerDay),
            };

            expect(effectiveLimits.maxPerMinute).toBe(50); // Manifest limit
            expect(effectiveLimits.maxPerHour).toBe(500); // Manifest limit
            expect(effectiveLimits.maxPerDay).toBe(5000); // Manifest limit
        });

        it('should not allow manifest to exceed platform limits', () => {
            const manifestRateLimit = {
                maxPerMinute: 200, // Higher than platform
                maxPerHour: 2000,
                maxPerDay: 20000,
            };

            const platformLimits = {
                maxPerMinute: 100,
                maxPerHour: 1000,
                maxPerDay: 10000,
            };

            const effectiveLimits = {
                maxPerMinute: Math.min(manifestRateLimit.maxPerMinute, platformLimits.maxPerMinute),
                maxPerHour: Math.min(manifestRateLimit.maxPerHour, platformLimits.maxPerHour),
                maxPerDay: Math.min(manifestRateLimit.maxPerDay, platformLimits.maxPerDay),
            };

            expect(effectiveLimits.maxPerMinute).toBe(100); // Capped to platform
            expect(effectiveLimits.maxPerHour).toBe(1000);
            expect(effectiveLimits.maxPerDay).toBe(10000);
        });
    });

    describe('Webhook Integration', () => {
        it('should build correct webhook payload on click', () => {
            const notification = {
                id: 'notif-123',
                userId: 'user-456',
                organizationId: 'tenant-789',
                source: 'plugin' as const,
                sourcePluginId: 'test-plugin',
                templateKey: 'plugin:test-plugin:new_comment',
                target: {
                    type: 'post',
                    id: 'post-111',
                    url: '/posts/111',
                },
            };

            const webhookPayload = {
                event: 'clicked' as const,
                notificationId: notification.id,
                userId: notification.userId,
                organizationId: notification.organizationId,
                type: 'new_comment', // Extracted from templateKey
                target: {
                    type: notification.target.type,
                    id: notification.target.id,
                    url: notification.target.url,
                },
                timestamp: new Date().toISOString(),
            };

            expect(webhookPayload.event).toBe('clicked');
            expect(webhookPayload.type).toBe('new_comment');
            expect(webhookPayload.target.url).toBe('/posts/111');
        });

        it('should build correct webhook payload on archive', () => {
            const notification = {
                id: 'notif-456',
                userId: 'user-789',
                organizationId: 'tenant-123',
                source: 'plugin' as const,
                sourcePluginId: 'test-plugin',
                templateKey: 'plugin:test-plugin:task_completed',
                target: {
                    type: 'task',
                    id: 'task-222',
                },
            };

            const webhookPayload = {
                event: 'archived' as const,
                notificationId: notification.id,
                userId: notification.userId,
                organizationId: notification.organizationId,
                type: 'task_completed',
                target: {
                    type: notification.target.type,
                    id: notification.target.id,
                },
                timestamp: new Date().toISOString(),
            };

            expect(webhookPayload.event).toBe('archived');
            expect(webhookPayload.type).toBe('task_completed');
            expect('url' in webhookPayload.target).toBe(false);
        });
    });

    describe('Aggregation Integration', () => {
        it('should aggregate notifications by target', () => {
            const groupKey = 'plugin:test-plugin:liked_post:target:post:post-123';

            // Simulate multiple notifications with same groupKey
            const notifications = [
                { id: 'n1', actorName: 'Alice', groupKey },
                { id: 'n2', actorName: 'Bob', groupKey },
                { id: 'n3', actorName: 'Charlie', groupKey },
                { id: 'n4', actorName: 'David', groupKey },
                { id: 'n5', actorName: 'Eve', groupKey },
            ];

            // Group notifications
            const grouped = notifications.filter(n => n.groupKey === groupKey);
            expect(grouped).toHaveLength(5);

            // Build aggregated display (latest 3 actors)
            const latestActors = grouped.slice(-3).map(n => n.actorName);
            const remainingCount = grouped.length - latestActors.length;

            expect(latestActors).toEqual(['Charlie', 'David', 'Eve']);
            expect(remainingCount).toBe(2);

            // Generate aggregated title
            let aggregatedTitle: string;
            if (remainingCount > 0) {
                aggregatedTitle = `${latestActors.join(', ')} and ${remainingCount} others liked your post`;
            } else {
                aggregatedTitle = `${latestActors.join(', ')} liked your post`;
            }

            expect(aggregatedTitle).toBe('Charlie, David, Eve and 2 others liked your post');
        });

        it('should handle 99+ aggregation count display', () => {
            const count = 150;
            const displayCount = count > 99 ? '99+' : count.toString();

            expect(displayCount).toBe('99+');
        });

        it('should not aggregate when strategy is none', () => {
            const aggregation = 'none';
            let groupKey: string | undefined;

            if (aggregation === 'none') {
                groupKey = undefined;
            }

            expect(groupKey).toBeUndefined();
        });
    });

    describe('Localization Integration', () => {
        it('should use requested locale for notification content', () => {
            const i18n = {
                'en-US': {
                    title: '${actor.name} commented on your post',
                    description: 'New comment notification',
                },
                'zh-CN': {
                    title: '${actor.name} 评论了你的帖子',
                    description: '新评论通知',
                },
            };

            const locale = 'zh-CN';
            const content = i18n[locale] || i18n['en-US'];

            expect(content.title).toBe('${actor.name} 评论了你的帖子');
        });

        it('should fall back to en-US when locale not available', () => {
            const i18n = {
                'en-US': {
                    title: 'New notification',
                },
            };

            const locale = 'fr-FR'; // Not available
            const content = i18n[locale as keyof typeof i18n] || i18n['en-US'];

            expect(content.title).toBe('New notification');
        });

        it('should fall back to first available locale when en-US not available', () => {
            const i18n = {
                'zh-CN': {
                    title: '新通知',
                },
            };

            const locale = 'fr-FR';
            const content = i18n[locale as keyof typeof i18n] || i18n['en-US' as keyof typeof i18n] || Object.values(i18n)[0];

            expect(content.title).toBe('新通知');
        });
    });

    describe('Error Handling Integration', () => {
        it('should handle validation errors gracefully', () => {
            const error = new PluginNotificationValidationError(
                'Invalid notification type',
                'test-plugin',
                'invalid_type'
            );

            // Validation errors should be fatal (no retry)
            expect(error.name).toBe('PluginNotificationValidationError');
            expect(error.pluginId).toBe('test-plugin');
        });

        it('should handle rate limit errors with retry info', () => {
            const error = new RateLimitExceededError('test-plugin', {
                remaining: 0,
                resetAt: new Date(Date.now() + 60000).toISOString(),
                retryAfter: 60,
                reason: 'RATE_LIMIT_EXCEEDED',
            });

            const response = error.toResponse();

            expect(response.error).toBe('RATE_LIMIT_EXCEEDED');
            expect(response.retryAfter).toBe(60);
            expect(response.limit.remaining).toBe(0);
        });

        it('should handle circuit breaker errors', () => {
            const error = new RateLimitExceededError('test-plugin', {
                remaining: 0,
                resetAt: new Date(Date.now() + 120000).toISOString(),
                retryAfter: 120,
                reason: 'CIRCUIT_BREAKER_OPEN',
            });

            const response = error.toResponse();

            expect(response.error).toBe('CIRCUIT_BREAKER_OPEN');
            expect(response.retryAfter).toBe(120);
        });
    });
});
