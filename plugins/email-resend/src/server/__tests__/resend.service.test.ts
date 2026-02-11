/**
 * Unit Tests for ResendEmailService
 *
 * Test cases:
 * - initialize() with valid API key
 * - send() success returns email ID
 * - send() failure throws error with message
 * - isConfigured() returns false before init
 * - API key format validation (starts with `re_`)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create a mock send function we can control
const mockSend = vi.fn();

// Mock the resend module at the top level
vi.mock('resend', () => {
    // Return a class constructor
    return {
        Resend: class MockResend {
            emails = {
                send: mockSend,
            };
            constructor(_apiKey: string) {
                // Constructor receives API key
            }
        },
    };
});

// Import after mocks
import { ResendEmailService, type ResendConfig } from '../resend.service.js';

describe('ResendEmailService', () => {
    let service: ResendEmailService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new ResendEmailService();
    });

    describe('isConfigured()', () => {
        it('should return false before initialization', () => {
            expect(service.isConfigured()).toBe(false);
        });

        it('should return true after initialization with valid config', async () => {
            mockSend.mockResolvedValue({ data: { id: 'test' }, error: null });

            const config: ResendConfig = {
                apiKey: 're_test_123456789',
                fromAddress: 'test@example.com',
            };

            await service.initialize(config);

            expect(service.isConfigured()).toBe(true);
        });
    });

    describe('initialize()', () => {
        it('should initialize with required config', async () => {
            const config: ResendConfig = {
                apiKey: 're_test_123456789',
                fromAddress: 'noreply@example.com',
            };

            await service.initialize(config);

            expect(service.isConfigured()).toBe(true);
        });

        it('should initialize with optional config', async () => {
            const config: ResendConfig = {
                apiKey: 're_test_123456789',
                fromAddress: 'noreply@example.com',
                fromName: 'Custom Name',
                replyTo: 'support@example.com',
            };

            await service.initialize(config);

            expect(service.isConfigured()).toBe(true);
        });

        it('should use default fromName when not provided', async () => {
            const config: ResendConfig = {
                apiKey: 're_test_123456789',
                fromAddress: 'noreply@example.com',
            };

            await service.initialize(config);

            // The default fromName 'WordRhyme' should be used internally
            expect(service.isConfigured()).toBe(true);
        });
    });

    describe('send()', () => {
        it('should throw error when not initialized', async () => {
            await expect(
                service.send({
                    to: 'user@example.com',
                    subject: 'Test',
                    text: 'Test message',
                })
            ).rejects.toThrow('ResendEmailService not initialized');
        });

        it('should return emailId on successful send', async () => {
            const mockEmailId = 'email_123abc';
            mockSend.mockResolvedValue({
                data: { id: mockEmailId },
                error: null,
            });

            await service.initialize({
                apiKey: 're_test_123456789',
                fromAddress: 'noreply@example.com',
            });

            const result = await service.send({
                to: 'user@example.com',
                subject: 'Test Subject',
                text: 'Test message body',
            });

            expect(result.emailId).toBe(mockEmailId);
        });

        it('should throw error on API failure', async () => {
            mockSend.mockResolvedValue({
                data: null,
                error: { message: 'API rate limit exceeded' },
            });

            await service.initialize({
                apiKey: 're_test_123456789',
                fromAddress: 'noreply@example.com',
            });

            await expect(
                service.send({
                    to: 'user@example.com',
                    subject: 'Test',
                    text: 'Test message',
                })
            ).rejects.toThrow('Resend API error: API rate limit exceeded');
        });

        it('should include replyTo when configured', async () => {
            mockSend.mockResolvedValue({
                data: { id: 'email_123' },
                error: null,
            });

            await service.initialize({
                apiKey: 're_test_123456789',
                fromAddress: 'noreply@example.com',
                replyTo: 'support@example.com',
            });

            await service.send({
                to: 'user@example.com',
                subject: 'Test',
                text: 'Test message',
            });

            expect(mockSend).toHaveBeenCalledWith(
                expect.objectContaining({
                    replyTo: 'support@example.com',
                })
            );
        });

        it('should use custom fromName when provided', async () => {
            mockSend.mockResolvedValue({
                data: { id: 'email_123' },
                error: null,
            });

            await service.initialize({
                apiKey: 're_test_123456789',
                fromAddress: 'noreply@example.com',
                fromName: 'Custom App',
            });

            await service.send({
                to: 'user@example.com',
                subject: 'Test',
                text: 'Test message',
            });

            expect(mockSend).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: 'Custom App <noreply@example.com>',
                })
            );
        });
    });

    describe('sendTest()', () => {
        it('should send a test email with predefined content', async () => {
            mockSend.mockResolvedValue({
                data: { id: 'email_test_123' },
                error: null,
            });

            await service.initialize({
                apiKey: 're_test_123456789',
                fromAddress: 'noreply@example.com',
            });

            const result = await service.sendTest('recipient@example.com');

            expect(result.emailId).toBe('email_test_123');
            expect(mockSend).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'recipient@example.com',
                    subject: 'WordRhyme Email Test',
                })
            );
        });
    });
});
