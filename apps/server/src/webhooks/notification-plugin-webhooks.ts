/**
 * Notification Plugin Webhooks
 *
 * Handles webhook callbacks for plugin notification events:
 * - onClicked: User clicked on a notification
 * - onArchived: User archived/dismissed a notification
 *
 * Uses the existing Webhook system to dispatch async callbacks.
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus, type NotificationClickedEvent, type NotificationArchivedEvent, type NotificationEventData } from '../events/index.js';
import { PluginManager } from '../plugins/plugin-manager.js';
import { WebhookDispatcher } from './webhook.dispatcher.js';

/**
 * Webhook payload for plugin notification events
 */
export interface NotificationWebhookPayload {
    event: 'clicked' | 'archived';
    notificationId: string;
    userId: string;
    organizationId: string;
    type: string;
    target: { type: string; id: string; url?: string };
    timestamp: string;
}

@Injectable()
export class NotificationPluginWebhooks implements OnModuleInit {
    constructor(
        private readonly eventBus: EventBus,
        private readonly pluginManager: PluginManager,
        private readonly webhookDispatcher: WebhookDispatcher
    ) {}

    onModuleInit() {
        // Subscribe to notification click events
        this.eventBus.on('notification.clicked', async (event: NotificationClickedEvent) => {
            await this.handleNotificationEvent('clicked', event.notification);
        });

        // Subscribe to notification archive events
        this.eventBus.on('notification.archived', async (event: NotificationArchivedEvent) => {
            await this.handleNotificationEvent('archived', event.notification);
        });

        console.log('[NotificationPluginWebhooks] Registered event handlers');
    }

    /**
     * Handle a notification event and trigger plugin webhook if applicable
     */
    private async handleNotificationEvent(
        event: 'clicked' | 'archived',
        notification: NotificationEventData
    ): Promise<void> {
        // Only process plugin notifications
        if (notification.source !== 'plugin' || !notification.sourcePluginId) {
            return;
        }

        const pluginId = notification.sourcePluginId;

        try {
            // Get plugin manifest to find webhook URL
            const plugin = this.pluginManager.getPlugin(pluginId);
            if (!plugin || plugin.status !== 'enabled') {
                return;
            }

            const webhookUrl = event === 'clicked'
                ? plugin.manifest?.notifications?.webhooks?.onClicked
                : plugin.manifest?.notifications?.webhooks?.onArchived;

            if (!webhookUrl) {
                return;
            }

            // Build webhook payload
            const target = notification.target || { type: 'unknown', id: notification.entityId || notification.id };
            const payload: NotificationWebhookPayload = {
                event,
                notificationId: notification.id,
                userId: notification.userId,
                organizationId: notification.organizationId,
                type: this.extractNotificationType(notification.templateKey, pluginId),
                target: {
                    type: target.type,
                    id: target.id,
                    ...(target.url ? { url: target.url } : {}),
                },
                timestamp: new Date().toISOString(),
            };

            // Dispatch webhook using existing infrastructure
            await this.dispatchPluginWebhook(
                pluginId,
                notification.organizationId,
                webhookUrl,
                event,
                payload
            );

            console.log(
                `[NotificationPluginWebhooks] Dispatched ${event} webhook for plugin ${pluginId}`
            );
        } catch (error) {
            // Log but don't throw - webhooks shouldn't break the main flow
            console.error(
                `[NotificationPluginWebhooks] Failed to dispatch ${event} webhook for plugin ${pluginId}:`,
                error
            );
        }
    }

    /**
     * Extract notification type from template key
     * Template keys are formatted as: plugin:{pluginId}:{type}
     */
    private extractNotificationType(templateKey: string | null | undefined, pluginId: string): string {
        if (!templateKey) return 'unknown';

        const prefix = `plugin:${pluginId}:`;
        if (templateKey.startsWith(prefix)) {
            return templateKey.slice(prefix.length);
        }

        return templateKey;
    }

    /**
     * Dispatch webhook to plugin endpoint
     *
     * Creates a temporary webhook endpoint and delivery record,
     * then uses the existing dispatcher infrastructure.
     */
    private async dispatchPluginWebhook(
        pluginId: string,
        organizationId: string,
        webhookUrl: string,
        eventType: string,
        payload: NotificationWebhookPayload
    ): Promise<void> {
        // Generate a unique secret for HMAC signing
        // In production, this should be stored per-plugin
        const secret = `plugin-webhook-${pluginId}-${crypto.randomUUID().slice(0, 8)}`;

        // Create a temporary endpoint object for the dispatcher
        const tempEndpoint = {
            id: `plugin-${pluginId}-${eventType}`,
            organizationId,
            url: webhookUrl,
            secret,
            events: [`notification.${eventType}`],
            enabled: true,
            retryPolicy: {
                attempts: 3,
                backoffMs: 1000,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // Generate delivery ID
        const deliveryId = crypto.randomUUID();

        // Dispatch using the existing dispatcher
        const result = await this.webhookDispatcher.dispatch(
            tempEndpoint,
            `notification.plugin.${eventType}`,
            payload as unknown as Record<string, unknown>,
            deliveryId
        );

        if (!result.success) {
            console.warn(
                `[NotificationPluginWebhooks] Webhook dispatch failed for plugin ${pluginId}: ${result.error}`
            );
        }
    }
}
