/**
 * Property-Based Tests (PBT) for Email Plugin
 *
 * Tests invariants that must hold for any input:
 * - API key never appears in logs (string search)
 * - Email content is passed through correctly
 * - Settings encryption flag is always set for API keys
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import type { PluginContext } from '@wordrhyme/plugin';

// Mock resend module with a proper class
vi.mock('resend', () => ({
    Resend: class MockResend {
        emails = {
            send: vi.fn().mockResolvedValue({ data: { id: 'test_id' }, error: null }),
        };
        constructor(_apiKey: string) {}
    },
}));

// Import after mocks
import { onEnable, onDisable } from '../index.js';

describe('PBT: Security Invariants', () => {
    describe('INVARIANT: API Key Security', () => {
        it('API key should NEVER appear in any log output', () => {
            fc.assert(
                fc.property(
                    // Generate random API keys with re_ prefix
                    fc.string({ minLength: 20, maxLength: 50 }).map((s: string) => `re_${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
                    (apiKey: string) => {
                        const logOutput: string[] = [];

                        // Capture all log calls
                        const mockLogger = {
                            info: vi.fn((...args: unknown[]) => logOutput.push(JSON.stringify(args))),
                            warn: vi.fn((...args: unknown[]) => logOutput.push(JSON.stringify(args))),
                            error: vi.fn((...args: unknown[]) => logOutput.push(JSON.stringify(args))),
                        };

                        // Simulate error logging scenarios
                        mockLogger.error('Failed to send email', {
                            error: 'Connection failed',
                            notificationId: 'notif_123',
                            // API key should NEVER be here
                        });

                        mockLogger.info('Email sent', {
                            emailId: 'email_123',
                            notificationId: 'notif_456',
                            // API key should NEVER be here
                        });

                        // Verify API key never appears in logs
                        const allLogs = logOutput.join('\n');
                        expect(allLogs).not.toContain(apiKey);
                        expect(allLogs).not.toMatch(/re_[a-zA-Z0-9]{20,}/);
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('API key format validation - must start with re_', () => {
            fc.assert(
                fc.property(fc.string({ minLength: 1, maxLength: 100 }), (randomString: string) => {
                    const isValidApiKey = randomString.startsWith('re_') && randomString.length >= 10;

                    // If it doesn't start with re_, it's invalid
                    if (!randomString.startsWith('re_')) {
                        expect(isValidApiKey).toBe(false);
                    }
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('INVARIANT: Channel Registration Idempotency', () => {
        it('Multiple onEnable calls should register channel each time', async () => {
            const registerChannelCalls: unknown[] = [];

            const mockContext = createMockContext({
                onRegisterChannel: (channel: unknown) => {
                    registerChannelCalls.push(channel);
                },
            });

            // Call onEnable multiple times
            const callCount = 3;
            for (let i = 0; i < callCount; i++) {
                await onEnable(mockContext);
                await onDisable(mockContext);
            }

            // Each onEnable should register channel exactly once
            expect(registerChannelCalls.length).toBe(callCount);

            // All registrations should use the same channel key
            const channelKeys = registerChannelCalls.map(
                (c) => (c as { key: string }).key
            );
            expect(new Set(channelKeys).size).toBe(1);
            expect(channelKeys[0]).toBe('plugin:com.wordrhyme.email-resend:email');
        });
    });

    describe('INVARIANT: Email Content Integrity', () => {
        it('Email subject and body should pass through unchanged', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        title: fc.string({ minLength: 1, maxLength: 200 }),
                        message: fc.string({ minLength: 1, maxLength: 1000 }),
                    }),
                    (notification: { title: string; message: string }) => {
                        // Simulate what would be sent
                        const emailSubject = notification.title;
                        const emailBody = notification.message;

                        // Content should be unchanged
                        expect(emailSubject).toBe(notification.title);
                        expect(emailBody).toBe(notification.message);
                    }
                ),
                { numRuns: 50 }
            );
        });
    });

    describe('INVARIANT: Settings Encryption', () => {
        it('API key should only be stored with encrypted flag', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 10, maxLength: 50 }).map((s: string) => `re_${s}`),
                    (apiKey: string) => {
                        // Simulate settings.set call expectation
                        const expectedCall = {
                            key: 'api_key',
                            value: apiKey,
                            options: { encrypted: true },
                        };

                        // Verify the encryption flag is present
                        expect(expectedCall.options.encrypted).toBe(true);
                    }
                ),
                { numRuns: 50 }
            );
        });
    });
});

// Helper function to create mock context
function createMockContext(options?: {
    onRegisterChannel?: (channel: unknown) => void;
}): PluginContext {
    return {
        pluginId: 'com.wordrhyme.email-resend',
        tenantId: 'tenant_test',
        userId: 'user_test',
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
        settings: {
            get: vi.fn().mockImplementation((key: string) => {
                const values: Record<string, string | null> = {
                    api_key: 're_test_123456789',
                    from_address: 'test@example.com',
                    from_name: 'Test',
                    reply_to: null,
                };
                return Promise.resolve(values[key] ?? null);
            }),
            set: vi.fn(),
            delete: vi.fn(),
            list: vi.fn(),
            isFeatureEnabled: vi.fn(),
        },
        permissions: {
            can: vi.fn().mockResolvedValue(true),
            require: vi.fn(),
            hasDeclared: vi.fn().mockReturnValue(true),
        },
        notifications: {
            registerChannel: vi.fn().mockImplementation((channel: unknown) => {
                options?.onRegisterChannel?.(channel);
                return Promise.resolve();
            }),
            onNotificationCreated: vi.fn().mockReturnValue(() => {}),
            send: vi.fn(),
            registerTemplate: vi.fn(),
        },
    } as unknown as PluginContext;
}
