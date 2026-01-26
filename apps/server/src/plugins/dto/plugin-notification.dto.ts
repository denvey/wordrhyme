/**
 * Plugin Notification DTO
 *
 * Data transfer objects and validation schemas for plugin notification jobs.
 */
import { z } from 'zod';

/**
 * Actor schema for notification sender
 */
export const pluginNotificationActorSchema = z.object({
    id: z.string().min(1),
    type: z.enum(['user', 'plugin']),
    name: z.string().min(1),
    avatarUrl: z.string().url().optional(),
});

/**
 * Target schema for notification subject
 */
export const pluginNotificationTargetSchema = z.object({
    type: z.string().min(1),
    id: z.string().min(1),
    url: z.string().min(1),
    previewImage: z.string().url().optional(),
});

/**
 * Job payload schema for plugin_notification queue job
 */
export const pluginNotificationJobPayloadSchema = z.object({
    // Plugin context
    pluginId: z.string().min(1),
    organizationId: z.string().min(1),

    // Notification params
    type: z.string().min(1).regex(/^[a-z0-9_]+$/, 'type must be lowercase alphanumeric'),
    userId: z.string().min(1),
    actor: pluginNotificationActorSchema.optional(),
    target: pluginNotificationTargetSchema,
    data: z.record(z.unknown()).optional(),
    locale: z.string().optional(),

    // Metadata
    requestId: z.string().optional(),
    enqueuedAt: z.string().optional(),
});

export type PluginNotificationJobPayload = z.infer<typeof pluginNotificationJobPayloadSchema>;

/**
 * Rate limit error response
 */
export interface RateLimitErrorResponse {
    error: 'RATE_LIMIT_EXCEEDED' | 'CIRCUIT_BREAKER_OPEN';
    retryAfter: number;
    limit: {
        remaining: number;
        resetAt: string;
    };
}

/**
 * Validation error response
 */
export interface ValidationErrorResponse {
    error: 'NOTIFICATION_TYPE_NOT_DECLARED' | 'PERMISSION_DENIED' | 'PLUGIN_NOT_ENABLED';
    message: string;
    pluginId: string;
    type?: string;
}

/**
 * Plugin Notification Validation Error
 */
export class PluginNotificationValidationError extends Error {
    constructor(
        message: string,
        public readonly pluginId: string,
        public readonly type?: string
    ) {
        super(message);
        this.name = 'PluginNotificationValidationError';
    }
}

/**
 * Rate Limit Exceeded Error
 */
export class RateLimitExceededError extends Error {
    constructor(
        public readonly pluginId: string,
        public readonly result: {
            remaining: number;
            resetAt: string;
            retryAfter?: number;
            reason?: string;
        }
    ) {
        super(`Rate limit exceeded for plugin ${pluginId}`);
        this.name = 'RateLimitExceededError';
    }

    toResponse(): RateLimitErrorResponse {
        return {
            error: (this.result.reason as 'RATE_LIMIT_EXCEEDED' | 'CIRCUIT_BREAKER_OPEN') || 'RATE_LIMIT_EXCEEDED',
            retryAfter: this.result.retryAfter || 60,
            limit: {
                remaining: this.result.remaining,
                resetAt: this.result.resetAt,
            },
        };
    }
}
