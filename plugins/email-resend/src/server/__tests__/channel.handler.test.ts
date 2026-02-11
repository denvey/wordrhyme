/**
 * Integration Tests for Channel Handler
 *
 * Test cases:
 * - onEnable() registers channel with correct key
 * - Event handler only sends email when channel in list
 * - Event handler skips users without email
 * - Event handler logs error but doesn't throw on failure
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { PluginContext, PluginNotificationEvent } from '@wordrhyme/plugin';

// Mock the email service module
vi.mock('../resend.service.js', () => ({
    emailService: {
        initialize: vi.fn(),
        isConfigured: vi.fn().mockReturnValue(true),
        send: vi.fn().mockResolvedValue({ emailId: 'test_email_id' }),
    },
}));

// Import after mock setup
import { onEnable, onDisable } from '../index.js';
import { emailService } from '../resend.service.js';

describe('Channel Handler Integration', () => {
    let mockContext: PluginContext;
    let mockLogger: {
        info: Mock;
        warn: Mock;
        error: Mock;
    };
    let mockSettings: {
        get: Mock;
        set: Mock;
        delete: Mock;
        list: Mock;
        isFeatureEnabled: Mock;
    };
    let mockNotifications: {
        registerChannel: Mock;
        onNotificationCreated: Mock;
        send: Mock;
        registerTemplate: Mock;
    };
    let notificationHandler: ((event: PluginNotificationEvent) => Promise<void>) | null = null;

    beforeEach(() => {
        vi.clearAllMocks();

        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };

        mockSettings = {
            get: vi.fn().mockImplementation((key: string) => {
                const settings: Record<string, string | null> = {
                    api_key: 're_test_api_key_123',
                    from_address: 'noreply@example.com',
                    from_name: 'WordRhyme',
                    reply_to: null,
                };
                return Promise.resolve(settings[key] ?? null);
            }),
            set: vi.fn(),
            delete: vi.fn(),
            list: vi.fn(),
            isFeatureEnabled: vi.fn(),
        };

        mockNotifications = {
            registerChannel: vi.fn().mockResolvedValue(undefined),
            onNotificationCreated: vi.fn().mockImplementation((handler) => {
                notificationHandler = handler;
                return () => {
                    notificationHandler = null;
                };
            }),
            send: vi.fn(),
            registerTemplate: vi.fn(),
        };

        mockContext = {
            pluginId: 'com.wordrhyme.email-resend',
            tenantId: 'tenant_123',
            userId: 'user_123',
            logger: mockLogger,
            settings: mockSettings,
            permissions: {
                can: vi.fn().mockResolvedValue(true),
                require: vi.fn().mockResolvedValue(undefined),
                hasDeclared: vi.fn().mockReturnValue(true),
            },
            notifications: mockNotifications,
        } as unknown as PluginContext;
    });

    describe('onEnable()', () => {
        it('should register email notification channel with correct key', async () => {
            await onEnable(mockContext);

            expect(mockNotifications.registerChannel).toHaveBeenCalledWith({
                key: 'plugin:com.wordrhyme.email-resend:email',
                name: { 'en-US': 'Email', 'zh-CN': '邮件' },
                description: {
                    'en-US': 'Receive notifications via email',
                    'zh-CN': '通过邮件接收通知',
                },
                icon: 'mail',
            });
        });

        it('should initialize email service with settings', async () => {
            await onEnable(mockContext);

            expect(emailService.initialize).toHaveBeenCalledWith({
                apiKey: 're_test_api_key_123',
                fromAddress: 'noreply@example.com',
                fromName: 'WordRhyme',
                replyTo: undefined,
            });
        });

        it('should subscribe to notification events', async () => {
            await onEnable(mockContext);

            expect(mockNotifications.onNotificationCreated).toHaveBeenCalled();
            expect(notificationHandler).not.toBeNull();
        });

        it('should log warning when not configured', async () => {
            mockSettings.get.mockImplementation((key: string) => {
                if (key === 'api_key') return Promise.resolve(null);
                return Promise.resolve(null);
            });

            await onEnable(mockContext);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Resend Email plugin not configured. Please set API key and from address.'
            );
        });
    });

    describe('Notification Event Handler', () => {
        const CHANNEL_KEY = 'plugin:com.wordrhyme.email-resend:email';

        beforeEach(async () => {
            await onEnable(mockContext);
        });

        it('should send email when channel is in event channels', async () => {
            const event: PluginNotificationEvent = {
                notification: {
                    id: 'notif_123',
                    userId: 'user_456',
                    tenantId: 'tenant_123',
                    type: 'info',
                    title: 'Test Notification',
                    message: 'This is a test message',
                    priority: 'normal',
                },
                user: {
                    id: 'user_456',
                    email: 'user@example.com',
                    preferences: {
                        enabledChannels: [CHANNEL_KEY],
                        emailFrequency: 'instant',
                    },
                },
                channels: [CHANNEL_KEY],
            };

            await notificationHandler!(event);

            expect(emailService.send).toHaveBeenCalledWith({
                to: 'user@example.com',
                subject: 'Test Notification',
                text: 'This is a test message',
            });
        });

        it('should NOT send email when channel is NOT in event channels', async () => {
            const event: PluginNotificationEvent = {
                notification: {
                    id: 'notif_123',
                    userId: 'user_456',
                    tenantId: 'tenant_123',
                    type: 'info',
                    title: 'Test Notification',
                    message: 'This is a test message',
                    priority: 'normal',
                },
                user: {
                    id: 'user_456',
                    email: 'user@example.com',
                    preferences: {
                        enabledChannels: [],
                        emailFrequency: 'instant',
                    },
                },
                channels: ['some_other_channel'],
            };

            await notificationHandler!(event);

            expect(emailService.send).not.toHaveBeenCalled();
        });

        it('should skip users without email address', async () => {
            const event: PluginNotificationEvent = {
                notification: {
                    id: 'notif_123',
                    userId: 'user_456',
                    tenantId: 'tenant_123',
                    type: 'info',
                    title: 'Test Notification',
                    message: 'This is a test message',
                    priority: 'normal',
                },
                user: {
                    id: 'user_456',
                    email: undefined,
                    preferences: {
                        enabledChannels: [CHANNEL_KEY],
                        emailFrequency: 'instant',
                    },
                },
                channels: [CHANNEL_KEY],
            };

            await notificationHandler!(event);

            expect(emailService.send).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Cannot send email: user has no email address',
                expect.objectContaining({
                    userId: 'user_456',
                    notificationId: 'notif_123',
                })
            );
        });

        it('should log error but NOT throw on send failure', async () => {
            (emailService.send as Mock).mockRejectedValueOnce(new Error('API Error'));

            const event: PluginNotificationEvent = {
                notification: {
                    id: 'notif_123',
                    userId: 'user_456',
                    tenantId: 'tenant_123',
                    type: 'info',
                    title: 'Test Notification',
                    message: 'This is a test message',
                    priority: 'normal',
                },
                user: {
                    id: 'user_456',
                    email: 'user@example.com',
                    preferences: {
                        enabledChannels: [CHANNEL_KEY],
                        emailFrequency: 'instant',
                    },
                },
                channels: [CHANNEL_KEY],
            };

            // Should NOT throw
            await expect(notificationHandler!(event)).resolves.toBeUndefined();

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to send email',
                expect.objectContaining({
                    error: 'API Error',
                    notificationId: 'notif_123',
                    userId: 'user_456',
                })
            );
        });
    });

    describe('onDisable()', () => {
        it('should unsubscribe from notification events', async () => {
            await onEnable(mockContext);
            expect(notificationHandler).not.toBeNull();

            await onDisable(mockContext);

            // After disable, handler should be cleaned up
            expect(mockLogger.info).toHaveBeenCalledWith('Unsubscribed from notification events');
        });
    });
});
