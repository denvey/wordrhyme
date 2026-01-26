/**
 * Plugin Notification Service
 *
 * Core orchestration service for plugin notifications:
 * - Validates notification types against manifest
 * - Generates groupKey based on aggregation strategy
 * - Creates notifications via NotificationService
 * - Emits webhook events
 */
import { Injectable } from '@nestjs/common';
import type { PluginManifest, PluginNotificationType, AggregationStrategy } from '@wordrhyme/plugin';
import { NotificationService, type CreateNotificationInput } from '../../notifications/notification.service.js';
import { PluginManager } from '../plugin-manager.js';
import { EventBus } from '../../events/index.js';
import type { PluginNotificationJobPayload } from '../dto/plugin-notification.dto.js';
import { PluginNotificationValidationError } from '../dto/plugin-notification.dto.js';

/**
 * Resolved notification type definition from manifest
 */
export interface ResolvedNotificationType {
    id: string;
    category: 'system' | 'collaboration' | 'social';
    aggregation: AggregationStrategy;
    i18n: Record<string, { title: string; description?: string | undefined }>;
}

@Injectable()
export class PluginNotificationService {
    constructor(
        private readonly notificationService: NotificationService,
        private readonly pluginManager: PluginManager,
        private readonly eventBus: EventBus
    ) {}

    /**
     * Validate and get notification type definition from manifest
     */
    validateType(pluginId: string, typeId: string): ResolvedNotificationType {
        const plugin = this.pluginManager.getPlugin(pluginId);
        const manifest = plugin?.manifest;
        if (!manifest) {
            throw new PluginNotificationValidationError(
                `Plugin ${pluginId} not found`,
                pluginId,
                typeId
            );
        }

        const typeDef = manifest.notifications?.types?.find((t: PluginNotificationType) => t.id === typeId);
        if (!typeDef) {
            throw new PluginNotificationValidationError(
                `Notification type '${typeId}' is not declared in manifest.notifications.types`,
                pluginId,
                typeId
            );
        }

        return {
            id: typeDef.id,
            category: typeDef.category,
            aggregation: typeDef.aggregation || 'none',
            i18n: typeDef.i18n,
        };
    }

    /**
     * Generate groupKey based on aggregation strategy
     *
     * @param pluginId - Plugin ID
     * @param typeId - Notification type ID
     * @param aggregation - Aggregation strategy
     * @param actor - Actor info (optional)
     * @param target - Target info
     * @returns groupKey string or undefined if no aggregation
     */
    buildGroupKey(
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
                // Group by target (e.g., "Alice and 4 others liked your post")
                if (!target) return undefined;
                return `${prefix}:target:${target.type}:${target.id}`;

            case 'by_actor':
                // Group by actor (e.g., "Bob performed 5 actions")
                if (!actor) return undefined;
                return `${prefix}:actor:${actor.id}`;

            case 'by_type':
                // Group all notifications of this type
                return prefix;

            default:
                return undefined;
        }
    }

    /**
     * Create notification from plugin job payload
     */
    async createNotification(
        payload: PluginNotificationJobPayload,
        typeDef: ResolvedNotificationType
    ): Promise<{ notificationId: string }> {
        // Generate groupKey based on aggregation strategy
        const groupKey = this.buildGroupKey(
            payload.pluginId,
            payload.type,
            typeDef.aggregation,
            payload.actor,
            payload.target
        );

        // Resolve locale and get i18n content
        const locale = payload.locale || 'en-US';
        const i18nContent = typeDef.i18n[locale] || typeDef.i18n['en-US'] || Object.values(typeDef.i18n)[0];

        if (!i18nContent) {
            throw new PluginNotificationValidationError(
                `No i18n content found for type '${payload.type}'`,
                payload.pluginId,
                payload.type
            );
        }

        // Build actor info
        const actor = payload.actor
            ? {
                id: payload.actor.id,
                type: payload.actor.type as 'user' | 'plugin',
                name: payload.actor.name,
                ...(payload.actor.avatarUrl ? { avatarUrl: payload.actor.avatarUrl } : {}),
            }
            : {
                id: payload.pluginId,
                type: 'plugin' as const,
                name: payload.pluginId,
            };

        // Create notification via NotificationService
        const input: CreateNotificationInput = {
            userId: payload.userId,
            organizationId: payload.organizationId,
            templateKey: `plugin:${payload.pluginId}:${payload.type}`,
            variables: payload.data || {},
            source: 'plugin',
            sourcePluginId: payload.pluginId,
            category: typeDef.category,
            aggregationStrategy: typeDef.aggregation,
            groupKey,
            actor,
            target: {
                type: payload.target.type,
                id: payload.target.id,
                ...(payload.target.url ? { url: payload.target.url } : {}),
                ...(payload.target.previewImage ? { previewImage: payload.target.previewImage } : {}),
            },
            locale,
        };

        const result = await this.notificationService.createNotification(input);

        return { notificationId: result.notification.id };
    }

    /**
     * Emit webhook event for notification action
     */
    emitWebhookEvent(
        event: 'clicked' | 'archived',
        notificationId: string,
        userId: string,
        organizationId: string,
        pluginId: string,
        type: string,
        target: { type: string; id: string; url?: string }
    ): void {
        this.eventBus.emit(`notification.plugin.${event}`, {
            event,
            notificationId,
            userId,
            organizationId,
            pluginId,
            type,
            target,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Get webhook URLs from plugin manifest
     */
    getWebhookUrls(pluginId: string): { onClicked?: string | undefined; onArchived?: string | undefined } | undefined {
        const plugin = this.pluginManager.getPlugin(pluginId);
        const manifest = plugin?.manifest;
        return manifest?.notifications?.webhooks;
    }
}
