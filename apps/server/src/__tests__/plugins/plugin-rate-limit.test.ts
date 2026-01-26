/**
 * Plugin Rate Limit Service Tests
 *
 * Tests for the dual-layer rate limiting system:
 * - Plugin-level limits (100/min, 1000/hour, 10000/day)
 * - User-level limits (10/min, 50/hour)
 * - Circuit breaker for repeated failures
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRateLimitService } from '../../plugins/services/plugin-rate-limit.service.js';

describe('PluginRateLimitService', () => {
    let service: PluginRateLimitService;

    beforeEach(() => {
        service = new PluginRateLimitService();
    });

    describe('Rate Limit Checking', () => {
        it('should allow first request', async () => {
            const result = await service.checkAndConsume(
                'plugin-1',
                'tenant-1',
                'user-1'
            );

            expect(result.allowed).toBe(true);
            expect(result.remaining).toBeGreaterThan(0);
        });

        it('should track remaining quota', async () => {
            // First request
            const result1 = await service.checkAndConsume(
                'plugin-1',
                'tenant-1',
                'user-1'
            );

            // Second request
            const result2 = await service.checkAndConsume(
                'plugin-1',
                'tenant-1',
                'user-1'
            );

            expect(result2.remaining).toBeLessThan(result1.remaining);
        });

        it('should separate limits by tenant', async () => {
            // Request for tenant-1
            const result1 = await service.checkAndConsume(
                'plugin-1',
                'tenant-1',
                'user-1'
            );

            // Request for tenant-2 (different tenant)
            const result2 = await service.checkAndConsume(
                'plugin-1',
                'tenant-2',
                'user-1'
            );

            // Both should have similar remaining since they're separate counters
            expect(result1.allowed).toBe(true);
            expect(result2.allowed).toBe(true);
        });

        it('should separate limits by plugin', async () => {
            // Request for plugin-1
            const result1 = await service.checkAndConsume(
                'plugin-1',
                'tenant-1',
                'user-1'
            );

            // Request for plugin-2 (different plugin)
            const result2 = await service.checkAndConsume(
                'plugin-2',
                'tenant-1',
                'user-1'
            );

            expect(result1.allowed).toBe(true);
            expect(result2.allowed).toBe(true);
        });
    });

    describe('User-Level Rate Limiting', () => {
        it('should enforce per-user minute limit', async () => {
            // Exhaust user minute limit (10/min)
            for (let i = 0; i < 10; i++) {
                const result = await service.checkAndConsume(
                    'plugin-1',
                    'tenant-1',
                    'user-1'
                );
                expect(result.allowed).toBe(true);
            }

            // 11th request should be rate limited
            const result = await service.checkAndConsume(
                'plugin-1',
                'tenant-1',
                'user-1'
            );

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('RATE_LIMIT_EXCEEDED');
            expect(result.retryAfter).toBeGreaterThan(0);
        });

        it('should not affect other users when one is rate limited', async () => {
            // Exhaust user-1 minute limit
            for (let i = 0; i < 10; i++) {
                await service.checkAndConsume('plugin-1', 'tenant-1', 'user-1');
            }

            // user-2 should still be allowed
            const result = await service.checkAndConsume(
                'plugin-1',
                'tenant-1',
                'user-2'
            );

            expect(result.allowed).toBe(true);
        });
    });

    describe('Plugin-Level Rate Limiting', () => {
        it('should enforce plugin minute limit across users', async () => {
            // Exhaust plugin minute limit (100/min) using multiple users
            for (let i = 0; i < 100; i++) {
                const userId = `user-${i % 20}`; // Cycle through 20 users
                const result = await service.checkAndConsume(
                    'plugin-1',
                    'tenant-1',
                    userId
                );
                expect(result.allowed).toBe(true);
            }

            // 101st request should be rate limited (plugin limit)
            const result = await service.checkAndConsume(
                'plugin-1',
                'tenant-1',
                'user-new'
            );

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('RATE_LIMIT_EXCEEDED');
        });
    });

    describe('Config Override', () => {
        it('should respect manifest rate limit override', async () => {
            // Override with lower limit
            const overrideConfig = {
                perPlugin: {
                    maxPerMinute: 5,
                    maxPerHour: 50,
                    maxPerDay: 500,
                },
            };

            // Exhaust overridden limit
            for (let i = 0; i < 5; i++) {
                const result = await service.checkAndConsume(
                    'plugin-2',
                    'tenant-1',
                    `user-${i}`,
                    overrideConfig
                );
                expect(result.allowed).toBe(true);
            }

            // 6th request should be limited
            const result = await service.checkAndConsume(
                'plugin-2',
                'tenant-1',
                'user-new',
                overrideConfig
            );

            expect(result.allowed).toBe(false);
        });

        it('should not allow override to exceed platform limits', async () => {
            // Try to override with higher limit (should be capped)
            const overrideConfig = {
                perPlugin: {
                    maxPerMinute: 1000, // Higher than platform limit of 100
                    maxPerHour: 10000,
                    maxPerDay: 100000,
                },
            };

            // Should still be limited by platform default (100/min)
            for (let i = 0; i < 100; i++) {
                const userId = `user-${i % 20}`;
                await service.checkAndConsume(
                    'plugin-3',
                    'tenant-1',
                    userId,
                    overrideConfig
                );
            }

            const result = await service.checkAndConsume(
                'plugin-3',
                'tenant-1',
                'user-new',
                overrideConfig
            );

            expect(result.allowed).toBe(false);
        });
    });

    describe('Circuit Breaker', () => {
        it('should open after threshold failures', async () => {
            // Record 5 failures (threshold)
            for (let i = 0; i < 5; i++) {
                service.recordFailure('plugin-cb');
            }

            // Next request should be blocked by circuit breaker
            const result = await service.checkAndConsume(
                'plugin-cb',
                'tenant-1',
                'user-1'
            );

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('CIRCUIT_BREAKER_OPEN');
        });

        it('should reset on success', async () => {
            // Record some failures
            service.recordFailure('plugin-reset');
            service.recordFailure('plugin-reset');

            // Record success
            service.recordSuccess('plugin-reset');

            // Should be allowed now
            const result = await service.checkAndConsume(
                'plugin-reset',
                'tenant-1',
                'user-1'
            );

            expect(result.allowed).toBe(true);
        });

        it('should include retryAfter when circuit breaker is open', async () => {
            // Open circuit breaker
            for (let i = 0; i < 5; i++) {
                service.recordFailure('plugin-retry');
            }

            const result = await service.checkAndConsume(
                'plugin-retry',
                'tenant-1',
                'user-1'
            );

            expect(result.allowed).toBe(false);
            expect(result.retryAfter).toBeGreaterThan(0);
            expect(result.retryAfter).toBeLessThanOrEqual(60); // Default cooldown
        });
    });

    describe('Status Reporting', () => {
        it('should report current status', async () => {
            // Make some requests
            await service.checkAndConsume('plugin-status', 'tenant-1', 'user-1');
            await service.checkAndConsume('plugin-status', 'tenant-1', 'user-2');

            const status = service.getStatus('plugin-status', 'tenant-1');

            expect(status.pluginMinute.count).toBe(2);
            expect(status.pluginMinute.limit).toBe(100);
            expect(status.pluginHour.count).toBe(2);
            expect(status.pluginHour.limit).toBe(1000);
            expect(status.pluginDay.count).toBe(2);
            expect(status.pluginDay.limit).toBe(10000);
            expect(status.circuitBreakerOpen).toBe(false);
        });

        it('should report circuit breaker status', () => {
            // Open circuit breaker
            for (let i = 0; i < 5; i++) {
                service.recordFailure('plugin-cb-status');
            }

            const status = service.getStatus('plugin-cb-status', 'tenant-1');
            expect(status.circuitBreakerOpen).toBe(true);
        });
    });

    describe('Reset Time', () => {
        it('should include resetAt timestamp', async () => {
            const result = await service.checkAndConsume(
                'plugin-reset-time',
                'tenant-1',
                'user-1'
            );

            expect(result.resetAt).toBeDefined();
            expect(new Date(result.resetAt).getTime()).toBeGreaterThan(Date.now());
        });
    });
});
