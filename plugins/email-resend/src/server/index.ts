/**
 * Email Resend Plugin - Server Entry
 *
 * Provides email sending capabilities via Resend API as a notification channel.
 * Integrates with Core notification system to send emails when notifications are created.
 *
 * Key features:
 * - Notification channel registration
 * - Settings-based configuration (API key encrypted)
 * - Test email endpoint
 *
 * IMPORTANT: This plugin does NOT expose direct email API.
 * Other plugins must use ctx.notifications.send() to trigger emails.
 */
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import type { PluginContext } from '@wordrhyme/plugin';
import { z } from 'zod';
import { emailService, type ResendConfig } from './resend.service.js';

// Channel key for notification system integration
const CHANNEL_KEY = 'plugin:com.wordrhyme.email-resend:email';

// Store unsubscribe function for cleanup
let unsubscribe: (() => void) | null = null;

/**
 * Initialize email service from settings
 */
async function initializeEmailService(ctx: PluginContext): Promise<boolean> {
    const apiKey = await ctx.settings.get<string>('api_key');
    const fromAddress = await ctx.settings.get<string>('from_address');
    const fromName = await ctx.settings.get<string>('from_name') || 'WordRhyme';
    const replyTo = await ctx.settings.get<string>('reply_to');

    if (!apiKey || !fromAddress) {
        ctx.logger.warn('Resend Email plugin not configured. Please set API key and from address.');
        return false;
    }

    const config: ResendConfig = {
        apiKey,
        fromAddress,
        fromName,
        replyTo: replyTo || undefined,
    };

    await emailService.initialize(config);
    ctx.logger.info('Resend Email service initialized');
    return true;
}

/**
 * Plugin tRPC Router
 *
 * Provides admin endpoints for:
 * - Getting current configuration status
 * - Saving configuration
 * - Sending test emails
 */
export const router = pluginRouter({
    /**
     * Get configuration status
     */
    getStatus: pluginProcedure.query(async ({ ctx }) => {
        // Check settings.read permission
        const hasReadPerm = await ctx.permissions.can('plugin:com.wordrhyme.email-resend:settings.read');
        if (!hasReadPerm) {
            return {
                configured: false,
                hasPermission: false,
            };
        }

        const fromAddress = await ctx.settings.get<string>('from_address');
        const fromName = await ctx.settings.get<string>('from_name');
        const replyTo = await ctx.settings.get<string>('reply_to');
        const hasApiKey = !!(await ctx.settings.get<string>('api_key'));

        return {
            configured: hasApiKey && !!fromAddress,
            hasPermission: true,
            fromAddress: fromAddress || '',
            fromName: fromName || 'WordRhyme',
            replyTo: replyTo || '',
            hasApiKey,
        };
    }),

    /**
     * Save configuration
     */
    saveSettings: pluginProcedure
        .input(z.object({
            apiKey: z.string().min(1).startsWith('re_').optional(),
            fromAddress: z.string().email(),
            fromName: z.string().min(1).max(100).default('WordRhyme'),
            replyTo: z.string().email().optional().or(z.literal('')),
        }))
        .mutation(async ({ input, ctx }) => {
            // Require settings.write permission
            await ctx.permissions.require('plugin:com.wordrhyme.email-resend:settings.write');

            ctx.logger.info('Saving email settings', { fromAddress: input.fromAddress });

            // Save settings (API key is encrypted)
            if (input.apiKey) {
                await ctx.settings.set('api_key', input.apiKey, { encrypted: true });
            }
            await ctx.settings.set('from_address', input.fromAddress);
            await ctx.settings.set('from_name', input.fromName);
            if (input.replyTo) {
                await ctx.settings.set('reply_to', input.replyTo);
            } else {
                await ctx.settings.delete('reply_to');
            }

            // Re-initialize email service with new settings
            const initialized = await initializeEmailService(ctx);

            ctx.logger.info('Email settings saved', { initialized });

            return {
                success: true,
                configured: initialized,
            };
        }),

    /**
     * Send test email
     */
    sendTest: pluginProcedure
        .input(z.object({
            to: z.string().email(),
        }))
        .mutation(async ({ input, ctx }) => {
            // Require test.send permission
            await ctx.permissions.require('plugin:com.wordrhyme.email-resend:test.send');

            ctx.logger.info('Sending test email', { to: input.to });

            if (!emailService.isConfigured()) {
                throw new Error('Email service not configured. Please save settings first.');
            }

            try {
                const result = await emailService.sendTest(input.to);
                ctx.logger.info('Test email sent successfully', { emailId: result.emailId });
                return {
                    success: true,
                    emailId: result.emailId,
                };
            } catch (error) {
                ctx.logger.error('Failed to send test email', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    // NEVER log API key or recipient email in production
                });
                throw error;
            }
        }),
});

/**
 * Router type export for client type inference
 */
export type EmailResendRouter = typeof router;

/**
 * Lifecycle: onEnable
 *
 * Called when the plugin is enabled. Responsibilities:
 * 1. Initialize email service from settings
 * 2. Register notification channel
 * 3. Subscribe to notification.created events
 */
export async function onEnable(ctx: PluginContext): Promise<void> {
    ctx.logger.info('Enabling Resend Email plugin');

    // Initialize email service
    await initializeEmailService(ctx);

    // Register notification channel
    if (ctx.notifications) {
        await ctx.notifications.registerChannel({
            key: CHANNEL_KEY,
            name: { 'en-US': 'Email', 'zh-CN': '邮件' },
            description: {
                'en-US': 'Receive notifications via email',
                'zh-CN': '通过邮件接收通知',
            },
            icon: 'mail',
        });
        ctx.logger.info('Email notification channel registered');

        // Subscribe to notification events
        unsubscribe = ctx.notifications.onNotificationCreated(async (event) => {
            // Check if user has enabled email channel
            if (!event.channels.includes(CHANNEL_KEY)) {
                return; // User did not enable email channel
            }

            const userEmail = event.user.email;
            if (!userEmail) {
                ctx.logger.warn('Cannot send email: user has no email address', {
                    userId: event.notification.userId,
                    notificationId: event.notification.id,
                });
                return;
            }

            if (!emailService.isConfigured()) {
                ctx.logger.error('Cannot send email: service not configured');
                return;
            }

            try {
                const result = await emailService.send({
                    to: userEmail,
                    subject: event.notification.title,
                    text: event.notification.message,
                });
                ctx.logger.info('Email sent successfully', {
                    emailId: result.emailId,
                    notificationId: event.notification.id,
                    userId: event.notification.userId,
                });
            } catch (error) {
                ctx.logger.error('Failed to send email', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    notificationId: event.notification.id,
                    userId: event.notification.userId,
                    // NEVER log API key or user email in production
                });
                // Error is logged but not rethrown - notification creation succeeds
            }
        });

        ctx.logger.info('Subscribed to notification events');
    } else {
        ctx.logger.warn('Notification capability not available');
    }

    ctx.logger.info('Resend Email plugin enabled', {
        features: {
            settingsUI: 'Available at /p/com.wordrhyme.email-resend',
            notificationChannel: CHANNEL_KEY,
        },
    });
}

/**
 * Lifecycle: onDisable
 *
 * Called when the plugin is disabled. Responsibilities:
 * 1. Unsubscribe from events
 * 2. Clean up resources
 */
export async function onDisable(ctx: PluginContext): Promise<void> {
    ctx.logger.info('Disabling Resend Email plugin');

    // Unsubscribe from events
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
        ctx.logger.info('Unsubscribed from notification events');
    }

    // Note: Channel unregistration is handled by Core when plugin is disabled
    ctx.logger.info('Resend Email plugin disabled');
}
