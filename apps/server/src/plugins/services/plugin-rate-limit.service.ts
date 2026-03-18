/**
 * Plugin Rate Limit Service
 *
 * Implements dual-layer rate limiting for plugin notifications:
 * - Plugin-level: 100/min, 1000/hour, 10000/day
 * - User-level: 10/min, 50/hour (prevents harassment)
 *
 * Also includes circuit breaker for repeated failures.
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { env } from '../../config/env';

/**
 * Rate limit configuration
 */
export interface PluginRateLimitConfig {
    perPlugin: {
        maxPerMinute: number;
        maxPerHour: number;
        maxPerDay: number;
    };
    perUser: {
        maxPerMinute: number;
        maxPerHour: number;
    };
    circuitBreaker: {
        failureThreshold: number;
        cooldownSeconds: number;
    };
}

/**
 * Rate limit check result
 */
export interface RateLimitCheckResult {
    allowed: boolean;
    remaining: number;
    resetAt: string;
    retryAfter?: number;
    reason?: 'RATE_LIMIT_EXCEEDED' | 'CIRCUIT_BREAKER_OPEN';
}

/**
 * Counter entry for sliding window
 */
interface CounterEntry {
    count: number;
    resetAt: number;
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
    failures: number;
    openUntil: number;
}

/**
 * Default rate limit configuration
 */
const DEFAULT_CONFIG: PluginRateLimitConfig = {
    perPlugin: {
        maxPerMinute: 100,
        maxPerHour: 1000,
        maxPerDay: 10000,
    },
    perUser: {
        maxPerMinute: 10,
        maxPerHour: 50,
    },
    circuitBreaker: {
        failureThreshold: 5,
        cooldownSeconds: 60,
    },
};

/**
 * Time windows in milliseconds
 */
const WINDOWS = {
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
};

@Injectable()
export class PluginRateLimitService implements OnModuleDestroy {
    // In-memory fallback counters (used when Redis is unavailable)
    private readonly counters: Map<string, CounterEntry> = new Map();
    private readonly circuitBreakers: Map<string, CircuitBreakerState> = new Map();
    private readonly redis = this.createRedisClient();
    private redisUnavailable = false;

    /**
     * Check and consume rate limit quota
     *
     * @param pluginId - Plugin ID
     * @param organizationId - Tenant ID
     * @param userId - Target user ID
     * @param overrideConfig - Optional config override from manifest
     */
    async checkAndConsume(
        pluginId: string,
        organizationId: string,
        userId: string,
        overrideConfig?: Partial<PluginRateLimitConfig>
    ): Promise<RateLimitCheckResult> {
        const config = this.mergeConfig(overrideConfig);
        const now = Date.now();

        // 1. Check circuit breaker
        const cbResult = this.checkCircuitBreaker(pluginId, now, config);
        if (!cbResult.allowed) {
            return cbResult;
        }

        // 2. Check plugin-level limits
        const pluginResult = await this.checkPluginLimits(pluginId, organizationId, now, config);
        if (!pluginResult.allowed) {
            return pluginResult;
        }

        // 3. Check user-level limits
        const userResult = await this.checkUserLimits(pluginId, organizationId, userId, now, config);
        if (!userResult.allowed) {
            return userResult;
        }

        // 4. Consume quota
        await this.consumeQuota(pluginId, organizationId, userId, now);

        // Return success with remaining quota (use minimum of all limits)
        return {
            allowed: true,
            remaining: Math.min(pluginResult.remaining - 1, userResult.remaining - 1),
            resetAt: pluginResult.resetAt,
        };
    }

    /**
     * Record a failure for circuit breaker
     */
    recordFailure(pluginId: string): void {
        const state = this.circuitBreakers.get(pluginId) || { failures: 0, openUntil: 0 };
        state.failures++;

        if (state.failures >= DEFAULT_CONFIG.circuitBreaker.failureThreshold) {
            state.openUntil = Date.now() + DEFAULT_CONFIG.circuitBreaker.cooldownSeconds * 1000;
            console.warn(`[RateLimit] Circuit breaker opened for plugin ${pluginId}`);
        }

        this.circuitBreakers.set(pluginId, state);
    }

    /**
     * Record a success to reset circuit breaker
     */
    recordSuccess(pluginId: string): void {
        this.circuitBreakers.delete(pluginId);
    }

    /**
     * Get current rate limit status for a plugin
     */
    async getStatus(pluginId: string, organizationId: string): Promise<{
        pluginMinute: { count: number; limit: number };
        pluginHour: { count: number; limit: number };
        pluginDay: { count: number; limit: number };
        circuitBreakerOpen: boolean;
    }> {
        const now = Date.now();
        const config = DEFAULT_CONFIG;

        return {
            pluginMinute: {
                count: await this.getCounter(`plugin:${pluginId}:${organizationId}:minute`, WINDOWS.MINUTE, now),
                limit: config.perPlugin.maxPerMinute,
            },
            pluginHour: {
                count: await this.getCounter(`plugin:${pluginId}:${organizationId}:hour`, WINDOWS.HOUR, now),
                limit: config.perPlugin.maxPerHour,
            },
            pluginDay: {
                count: await this.getCounter(`plugin:${pluginId}:${organizationId}:day`, WINDOWS.DAY, now),
                limit: config.perPlugin.maxPerDay,
            },
            circuitBreakerOpen: this.isCircuitBreakerOpen(pluginId, now),
        };
    }

    async onModuleDestroy(): Promise<void> {
        if (this.redis) {
            await this.redis.quit().catch(() => undefined);
        }
    }

    // ========== Private Methods ==========

    private mergeConfig(override?: Partial<PluginRateLimitConfig>): PluginRateLimitConfig {
        if (!override) return DEFAULT_CONFIG;

        return {
            perPlugin: {
                // Use minimum of override and default (platform can't be bypassed)
                maxPerMinute: Math.min(
                    override.perPlugin?.maxPerMinute ?? DEFAULT_CONFIG.perPlugin.maxPerMinute,
                    DEFAULT_CONFIG.perPlugin.maxPerMinute
                ),
                maxPerHour: Math.min(
                    override.perPlugin?.maxPerHour ?? DEFAULT_CONFIG.perPlugin.maxPerHour,
                    DEFAULT_CONFIG.perPlugin.maxPerHour
                ),
                maxPerDay: Math.min(
                    override.perPlugin?.maxPerDay ?? DEFAULT_CONFIG.perPlugin.maxPerDay,
                    DEFAULT_CONFIG.perPlugin.maxPerDay
                ),
            },
            perUser: DEFAULT_CONFIG.perUser, // User limits not overridable
            circuitBreaker: DEFAULT_CONFIG.circuitBreaker,
        };
    }

    private checkCircuitBreaker(
        pluginId: string,
        now: number,
        _config: PluginRateLimitConfig
    ): RateLimitCheckResult {
        const state = this.circuitBreakers.get(pluginId);

        if (state && now < state.openUntil) {
            return {
                allowed: false,
                remaining: 0,
                resetAt: new Date(state.openUntil).toISOString(),
                retryAfter: Math.ceil((state.openUntil - now) / 1000),
                reason: 'CIRCUIT_BREAKER_OPEN',
            };
        }

        return { allowed: true, remaining: 0, resetAt: '' };
    }

    private isCircuitBreakerOpen(pluginId: string, now: number): boolean {
        const state = this.circuitBreakers.get(pluginId);
        return state ? now < state.openUntil : false;
    }

    private async checkPluginLimits(
        pluginId: string,
        organizationId: string,
        now: number,
        config: PluginRateLimitConfig
    ): Promise<RateLimitCheckResult> {
        const prefix = `plugin:${pluginId}:${organizationId}`;

        // Check minute limit
        const minuteCount = await this.getCounter(`${prefix}:minute`, WINDOWS.MINUTE, now);
        if (minuteCount >= config.perPlugin.maxPerMinute) {
            const resetAt = await this.getResetTime(`${prefix}:minute`, WINDOWS.MINUTE, now);
            return {
                allowed: false,
                remaining: 0,
                resetAt: new Date(resetAt).toISOString(),
                retryAfter: Math.ceil((resetAt - now) / 1000),
                reason: 'RATE_LIMIT_EXCEEDED',
            };
        }

        // Check hour limit
        const hourCount = await this.getCounter(`${prefix}:hour`, WINDOWS.HOUR, now);
        if (hourCount >= config.perPlugin.maxPerHour) {
            const resetAt = await this.getResetTime(`${prefix}:hour`, WINDOWS.HOUR, now);
            return {
                allowed: false,
                remaining: 0,
                resetAt: new Date(resetAt).toISOString(),
                retryAfter: Math.ceil((resetAt - now) / 1000),
                reason: 'RATE_LIMIT_EXCEEDED',
            };
        }

        // Check day limit
        const dayCount = await this.getCounter(`${prefix}:day`, WINDOWS.DAY, now);
        if (dayCount >= config.perPlugin.maxPerDay) {
            const resetAt = await this.getResetTime(`${prefix}:day`, WINDOWS.DAY, now);
            return {
                allowed: false,
                remaining: 0,
                resetAt: new Date(resetAt).toISOString(),
                retryAfter: Math.ceil((resetAt - now) / 1000),
                reason: 'RATE_LIMIT_EXCEEDED',
            };
        }

        // Return remaining (use minute window as primary)
        const minuteResetAt = await this.getResetTime(`${prefix}:minute`, WINDOWS.MINUTE, now);
        return {
            allowed: true,
            remaining: config.perPlugin.maxPerMinute - minuteCount,
            resetAt: new Date(minuteResetAt).toISOString(),
        };
    }

    private async checkUserLimits(
        pluginId: string,
        organizationId: string,
        userId: string,
        now: number,
        config: PluginRateLimitConfig
    ): Promise<RateLimitCheckResult> {
        const prefix = `plugin:${pluginId}:${organizationId}:user:${userId}`;

        // Check minute limit
        const minuteCount = await this.getCounter(`${prefix}:minute`, WINDOWS.MINUTE, now);
        if (minuteCount >= config.perUser.maxPerMinute) {
            const resetAt = await this.getResetTime(`${prefix}:minute`, WINDOWS.MINUTE, now);
            return {
                allowed: false,
                remaining: 0,
                resetAt: new Date(resetAt).toISOString(),
                retryAfter: Math.ceil((resetAt - now) / 1000),
                reason: 'RATE_LIMIT_EXCEEDED',
            };
        }

        // Check hour limit
        const hourCount = await this.getCounter(`${prefix}:hour`, WINDOWS.HOUR, now);
        if (hourCount >= config.perUser.maxPerHour) {
            const resetAt = await this.getResetTime(`${prefix}:hour`, WINDOWS.HOUR, now);
            return {
                allowed: false,
                remaining: 0,
                resetAt: new Date(resetAt).toISOString(),
                retryAfter: Math.ceil((resetAt - now) / 1000),
                reason: 'RATE_LIMIT_EXCEEDED',
            };
        }

        return {
            allowed: true,
            remaining: config.perUser.maxPerMinute - minuteCount,
            resetAt: new Date(await this.getResetTime(`${prefix}:minute`, WINDOWS.MINUTE, now)).toISOString(),
        };
    }

    private async consumeQuota(pluginId: string, organizationId: string, userId: string, now: number): Promise<void> {
        const pluginPrefix = `plugin:${pluginId}:${organizationId}`;
        const userPrefix = `plugin:${pluginId}:${organizationId}:user:${userId}`;

        // Increment plugin counters
        await this.incrementCounter(`${pluginPrefix}:minute`, WINDOWS.MINUTE, now);
        await this.incrementCounter(`${pluginPrefix}:hour`, WINDOWS.HOUR, now);
        await this.incrementCounter(`${pluginPrefix}:day`, WINDOWS.DAY, now);

        // Increment user counters
        await this.incrementCounter(`${userPrefix}:minute`, WINDOWS.MINUTE, now);
        await this.incrementCounter(`${userPrefix}:hour`, WINDOWS.HOUR, now);
    }

    private async getCounter(key: string, windowMs: number, now: number): Promise<number> {
        const redis = await this.getRedis();
        if (redis) {
            const value = await redis.get(this.buildRedisKey(key));
            return value ? Number.parseInt(value, 10) : 0;
        }

        const entry = this.counters.get(key);
        if (!entry || now >= entry.resetAt) {
            return 0;
        }
        return entry.count;
    }

    private async getResetTime(key: string, windowMs: number, now: number): Promise<number> {
        const redis = await this.getRedis();
        if (redis) {
            const ttlMs = await redis.pttl(this.buildRedisKey(key));
            if (ttlMs > 0) {
                return now + ttlMs;
            }
            return now + windowMs;
        }

        const entry = this.counters.get(key);
        if (!entry || now >= entry.resetAt) {
            return now + windowMs;
        }
        return entry.resetAt;
    }

    private async incrementCounter(key: string, windowMs: number, now: number): Promise<void> {
        const redis = await this.getRedis();
        if (redis) {
            const redisKey = this.buildRedisKey(key);
            const nextCount = await redis.incr(redisKey);
            if (nextCount === 1) {
                await redis.pexpire(redisKey, windowMs);
            }
            return;
        }

        const entry = this.counters.get(key);

        if (!entry || now >= entry.resetAt) {
            // Start new window
            this.counters.set(key, {
                count: 1,
                resetAt: now + windowMs,
            });
        } else {
            // Increment existing window
            entry.count++;
        }
    }

    private buildRedisKey(key: string): string {
        return `plugin-rate-limit:${key}`;
    }

    private createRedisClient(): Redis | null {
        if (!env.REDIS_URL) {
            return null;
        }

        const client = new Redis(env.REDIS_URL, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
        });

        // Degradation is handled in getRedis(); suppress raw emitter noise here.
        client.on('error', () => undefined);
        return client;
    }

    private async getRedis(): Promise<Redis | null> {
        if (!this.redis || this.redisUnavailable) {
            return null;
        }

        if (this.redis.status === 'wait') {
            try {
                await this.redis.connect();
            } catch (error) {
                this.redisUnavailable = true;
                console.warn(`[RateLimit] Redis unavailable, falling back to memory counters: ${error}`);
                return null;
            }
        }

        return this.redis;
    }
}
