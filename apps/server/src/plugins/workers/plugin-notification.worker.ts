/**
 * Plugin Notification Worker
 *
 * Queue worker that processes plugin notification jobs:
 * 1. Validates plugin status and permissions
 * 2. Validates notification type against manifest
 * 3. Checks rate limits (plugin + user level)
 * 4. Creates notification via PluginNotificationService
 * 5. Records success/failure for circuit breaker
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QueueService } from '../../queue/queue.service.js';
import { PluginNotificationService } from '../services/plugin-notification.service.js';
import { PluginRateLimitService } from '../services/plugin-rate-limit.service.js';
import { PluginManager } from '../plugin-manager.js';
import {
    pluginNotificationJobPayloadSchema,
    type PluginNotificationJobPayload,
    PluginNotificationValidationError,
    RateLimitExceededError,
} from '../dto/plugin-notification.dto.js';
import { FatalJobError } from '../../queue/queue.types.js';

/**
 * Job name for plugin notifications
 */
export const PLUGIN_NOTIFICATION_JOB_NAME = 'core_plugin_notification';

@Injectable()
export class PluginNotificationWorker implements OnModuleInit {
    constructor(
        private readonly queueService: QueueService,
        private readonly pluginNotificationService: PluginNotificationService,
        private readonly rateLimitService: PluginRateLimitService,
        private readonly pluginManager: PluginManager
    ) {}

    onModuleInit() {
        // Register the job handler
        this.queueService.registerHandler(
            PLUGIN_NOTIFICATION_JOB_NAME,
            this.handleJob.bind(this)
        );

        console.log('[PluginNotificationWorker] Registered handler for', PLUGIN_NOTIFICATION_JOB_NAME);
    }

    /**
     * Handle a plugin notification job
     */
    async handleJob(data: unknown, _job: Job): Promise<void> {
        // 1. Validate payload schema
        const parseResult = pluginNotificationJobPayloadSchema.safeParse(data);
        if (!parseResult.success) {
            throw new FatalJobError(`Invalid job payload: ${parseResult.error.message}`);
        }

        const payload = parseResult.data;
        const { pluginId, organizationId, userId, type } = payload;

        try {
            // 2. Validate plugin is enabled
            const plugin = this.pluginManager.getPlugin(pluginId);
            if (!plugin) {
                throw new FatalJobError(`Plugin ${pluginId} not found`);
            }
            if (plugin.status !== 'enabled') {
                throw new FatalJobError(`Plugin ${pluginId} is not enabled (status: ${plugin.status})`);
            }

            // 3. Validate notification type against manifest
            const typeDef = this.pluginNotificationService.validateType(pluginId, type);

            // 4. Check rate limits
            const manifest = plugin.manifest;
            const rateLimitConfig = manifest?.notifications?.rateLimit
                ? { perPlugin: manifest.notifications.rateLimit }
                : undefined;

            const rateLimitResult = await this.rateLimitService.checkAndConsume(
                pluginId,
                organizationId,
                userId,
                rateLimitConfig as Parameters<typeof this.rateLimitService.checkAndConsume>[3]
            );

            if (!rateLimitResult.allowed) {
                throw new RateLimitExceededError(pluginId, {
                    remaining: rateLimitResult.remaining,
                    resetAt: rateLimitResult.resetAt,
                    ...(rateLimitResult.retryAfter !== undefined ? { retryAfter: rateLimitResult.retryAfter } : {}),
                    ...(rateLimitResult.reason ? { reason: rateLimitResult.reason } : {}),
                });
            }

            // 5. Create the notification
            const result = await this.pluginNotificationService.createNotification(
                payload,
                typeDef
            );

            // 6. Record success for circuit breaker
            this.rateLimitService.recordSuccess(pluginId);

            console.log(
                `[PluginNotificationWorker] Created notification ${result.notificationId} for plugin ${pluginId}`
            );
        } catch (error) {
            // Record failure for circuit breaker (except for validation errors)
            if (
                !(error instanceof PluginNotificationValidationError) &&
                !(error instanceof FatalJobError)
            ) {
                this.rateLimitService.recordFailure(pluginId);
            }

            // Re-throw for BullMQ retry logic
            throw error;
        }
    }
}
