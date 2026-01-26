/**
 * Plugin Notification Capability
 *
 * Provides notification sending ability for plugins.
 * Validates manifest declarations, checks permissions, and enqueues jobs.
 */
import type {
    PluginNotificationCapability,
    PluginNotificationSendParams,
    PluginNotificationSendResult,
    PluginNotificationTemplate,
    PluginNotificationChannel,
    PluginNotificationEvent,
    PluginManifest,
} from '@wordrhyme/plugin';
import type { QueueService } from '../../queue/queue.service.js';
import type { EventBus } from '../../events/index.js';
import { PluginNotificationValidationError } from '../dto/plugin-notification.dto.js';
import { PermissionDeniedError } from './permission.capability.js';

/**
 * Create a notification capability for a plugin
 *
 * @param pluginId - Plugin ID
 * @param manifest - Plugin manifest (for validation)
 * @param organizationId - Current tenant ID
 * @param queueService - Queue service for job enqueueing
 * @param eventBus - Event bus for notification events
 */
export function createPluginNotificationCapability(
    pluginId: string,
    manifest: PluginManifest,
    organizationId: string | undefined,
    queueService: QueueService,
    eventBus: EventBus
): PluginNotificationCapability {
    // Event handlers for onNotificationCreated
    const handlers: Array<(event: PluginNotificationEvent) => void | Promise<void>> = [];

    return {
        async send(params: PluginNotificationSendParams): Promise<PluginNotificationSendResult> {
            // 1. Validate tenant context
            if (!organizationId) {
                throw new Error('Cannot send notification without tenant context');
            }

            // 2. Validate notification permission declared in manifest
            const hasNotificationPermission = manifest.notifications?.permissions?.includes('notification:send');
            if (!hasNotificationPermission) {
                throw new PermissionDeniedError('notification:send');
            }

            // 3. Validate notification type declared in manifest
            const typeDef = manifest.notifications?.types?.find(t => t.id === params.type);
            if (!typeDef) {
                throw new PluginNotificationValidationError(
                    `Notification type '${params.type}' is not declared in manifest.notifications.types`,
                    pluginId,
                    params.type
                );
            }

            // 4. Validate target is provided
            if (!params.target || !params.target.type || !params.target.id || !params.target.url) {
                throw new PluginNotificationValidationError(
                    'Notification target must include type, id, and url',
                    pluginId,
                    params.type
                );
            }

            // 5. Enqueue job for async processing
            // The worker will handle rate limiting, groupKey generation, and actual notification creation
            const jobId = await queueService.enqueue('core_plugin_notification', {
                pluginId,
                organizationId,
                type: params.type,
                userId: params.userId,
                actor: params.actor,
                target: params.target,
                data: params.data,
                locale: params.locale,
                requestId: crypto.randomUUID(),
                enqueuedAt: new Date().toISOString(),
            });

            // Return job ID as notification ID placeholder
            // The actual notification ID will be available after job processing
            return { notificationId: jobId };
        },

        async registerTemplate(template: PluginNotificationTemplate): Promise<void> {
            // Namespace the template key
            const namespacedKey = template.key.startsWith(`plugin_${pluginId}_`)
                ? template.key
                : `plugin_${pluginId}_${template.key}`;

            // TODO: Implement template registration via TemplateService
            // For now, emit an event that can be handled by Core
            eventBus.emit('plugin.notification.template.register', {
                pluginId,
                organizationId,
                template: {
                    ...template,
                    key: namespacedKey,
                },
            });
        },

        async registerChannel(channel: PluginNotificationChannel): Promise<void> {
            // Namespace the channel key
            const namespacedKey = channel.key.startsWith(`plugin_${pluginId}_`)
                ? channel.key
                : `plugin_${pluginId}_${channel.key}`;

            // TODO: Implement channel registration via ChannelService
            // For now, emit an event that can be handled by Core
            eventBus.emit('plugin.notification.channel.register', {
                pluginId,
                organizationId,
                channel: {
                    ...channel,
                    key: namespacedKey,
                },
            });
        },

        onNotificationCreated(
            handler: (event: PluginNotificationEvent) => void | Promise<void>
        ): () => void {
            handlers.push(handler);

            // Subscribe to notification.created events filtered by this plugin
            const unsubscribe = eventBus.on('notification.created', async (event) => {
                // Only forward events for notifications from this plugin
                if (event.notification.sourcePluginId === pluginId) {
                    // Convert to PluginNotificationEvent format
                    const pluginEvent: PluginNotificationEvent = {
                        notification: {
                            id: event.notification.id,
                            userId: event.notification.userId,
                            organizationId: event.notification.organizationId,
                            type: event.notification.type,
                            title: event.notification.title,
                            message: event.notification.message,
                            priority: event.notification.priority,
                            sourcePluginId: event.notification.sourcePluginId,
                        },
                        user: {
                            id: event.user.id,
                            ...(event.user.email ? { email: event.user.email } : {}),
                            preferences: {
                                enabledChannels: event.user.preferences.enabledChannels,
                                emailFrequency: event.user.preferences.emailFrequency,
                            },
                        },
                        channels: event.channels,
                    };
                    try {
                        await handler(pluginEvent);
                    } catch (error) {
                        console.error(`[Plugin:${pluginId}] Error in notification handler:`, error);
                    }
                }
            });

            // Return unsubscribe function
            return () => {
                const index = handlers.indexOf(handler);
                if (index > -1) {
                    handlers.splice(index, 1);
                }
                unsubscribe();
            };
        },
    };
}

/**
 * Create a stub notification capability that throws when used
 * Used when notification capability is not available in context
 */
export function createNotificationCapabilityStub(): PluginNotificationCapability {
    const notAvailable = () => {
        throw new Error('Notification capability not available in this context');
    };

    return {
        send: notAvailable,
        registerTemplate: notAvailable,
        registerChannel: notAvailable,
        onNotificationCreated: () => {
            throw new Error('Notification capability not available in this context');
        },
    };
}
