/**
 * Plugin Health Monitor
 *
 * Implements health monitoring for plugins with state machine:
 * HEALTHY → DEGRADED → SUSPENDED
 *
 * Features:
 * - Error rate calculation (sliding window)
 * - Automatic state transitions based on thresholds
 * - Rate limiting for degraded plugins
 * - Circuit breaker for suspended plugins
 */
import { Injectable } from '@nestjs/common';
import { MetricsServiceImpl } from './metrics.service.js';

/**
 * Plugin health state
 */
export type PluginHealthState = 'healthy' | 'degraded' | 'suspended';

/**
 * Health event for sliding window calculation
 */
interface HealthEvent {
    timestamp: number;
    success: boolean;
    duration: number | undefined;
}

/**
 * Plugin health status
 */
export interface PluginHealthStatus {
    pluginId: string;
    tenantId: string;
    state: PluginHealthState;
    errorRate: number;
    errorCount: number;
    totalRequests: number;
    avgResponseTime: number;
    lastStateChange: Date;
    lastError: {
        message: string;
        timestamp: Date;
    } | undefined;
}

/**
 * Health monitoring configuration
 */
export interface HealthConfig {
    // Degradation thresholds
    degradedErrorRateThreshold: number;     // default: 0.1 (10%)
    degradedWindowSeconds: number;          // default: 300 (5 min)

    // Suspension thresholds
    suspendedErrorCount: number;            // default: 5
    suspendedWindowSeconds: number;         // default: 60 (1 min)

    // Recovery thresholds
    recoveryErrorRateThreshold: number;     // default: 0.05 (5%)
    recoveryWindowSeconds: number;          // default: 300 (5 min)

    // Rate limiting for degraded plugins
    degradedRateLimit: number;              // default: 0.5 (50% of normal rate)
}

/**
 * Default health configuration
 */
export const DEFAULT_HEALTH_CONFIG: HealthConfig = {
    degradedErrorRateThreshold: 0.1,
    degradedWindowSeconds: 300,
    suspendedErrorCount: 5,
    suspendedWindowSeconds: 60,
    recoveryErrorRateThreshold: 0.05,
    recoveryWindowSeconds: 300,
    degradedRateLimit: 0.5,
};

/**
 * Plugin health data
 */
interface PluginHealthData {
    state: PluginHealthState;
    events: HealthEvent[];
    lastStateChange: Date;
    lastError?: {
        message: string;
        timestamp: Date;
    };
}

/**
 * Get health data key
 */
function getHealthKey(pluginId: string, tenantId: string): string {
    return `${tenantId}:${pluginId}`;
}

/**
 * Plugin Health Monitor Service
 *
 * Tracks plugin health and manages state transitions.
 */
@Injectable()
export class PluginHealthMonitor {
    private healthData = new Map<string, PluginHealthData>();
    private config: HealthConfig = DEFAULT_HEALTH_CONFIG;
    private metricsService: MetricsServiceImpl | null = null;

    constructor() {
        // Start cleanup interval for old events
        setInterval(() => this.cleanupOldEvents(), 60000);
    }

    /**
     * Set health configuration
     */
    setConfig(config: Partial<HealthConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Set metrics service for recording health metrics
     */
    setMetricsService(metricsService: MetricsServiceImpl): void {
        this.metricsService = metricsService;
    }

    /**
     * Record a plugin invocation result
     */
    recordInvocation(
        pluginId: string,
        tenantId: string,
        success: boolean,
        duration?: number,
        errorMessage?: string
    ): void {
        const key = getHealthKey(pluginId, tenantId);
        let data = this.healthData.get(key);

        if (!data) {
            data = {
                state: 'healthy',
                events: [],
                lastStateChange: new Date(),
            };
            this.healthData.set(key, data);
        }

        // Add event
        data.events.push({
            timestamp: Date.now(),
            success,
            duration,
        });

        // Update last error if applicable
        if (!success && errorMessage) {
            data.lastError = {
                message: errorMessage,
                timestamp: new Date(),
            };
        }

        // Check for state transitions
        this.checkStateTransition(pluginId, tenantId, data);

        // Record metrics
        if (this.metricsService) {
            this.metricsService.incrementCounter(
                'plugin_health_invocation_total',
                {
                    plugin_id: pluginId,
                    tenant_id: tenantId,
                    status: success ? 'success' : 'failure',
                }
            );
        }
    }

    /**
     * Get plugin health status
     */
    getStatus(pluginId: string, tenantId: string): PluginHealthStatus {
        const key = getHealthKey(pluginId, tenantId);
        const data = this.healthData.get(key);

        if (!data) {
            return {
                pluginId,
                tenantId,
                state: 'healthy',
                errorRate: 0,
                errorCount: 0,
                totalRequests: 0,
                avgResponseTime: 0,
                lastStateChange: new Date(),
                lastError: undefined,
            };
        }

        const now = Date.now();
        const windowMs = this.config.degradedWindowSeconds * 1000;
        const recentEvents = data.events.filter(e => now - e.timestamp < windowMs);

        const totalRequests = recentEvents.length;
        const errorCount = recentEvents.filter(e => !e.success).length;
        const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;

        const durationsSum = recentEvents
            .filter(e => e.duration !== undefined)
            .reduce((sum, e) => sum + (e.duration || 0), 0);
        const durationCount = recentEvents.filter(e => e.duration !== undefined).length;
        const avgResponseTime = durationCount > 0 ? durationsSum / durationCount : 0;

        return {
            pluginId,
            tenantId,
            state: data.state,
            errorRate,
            errorCount,
            totalRequests,
            avgResponseTime,
            lastStateChange: data.lastStateChange,
            lastError: data.lastError,
        };
    }

    /**
     * Check if a plugin invocation should be allowed
     *
     * Returns true if allowed, false if blocked (circuit breaker)
     */
    shouldAllow(pluginId: string, tenantId: string): boolean {
        const key = getHealthKey(pluginId, tenantId);
        const data = this.healthData.get(key);

        if (!data) {
            return true;
        }

        switch (data.state) {
            case 'healthy':
                return true;

            case 'degraded':
                // Rate limiting: allow only a percentage of requests
                return Math.random() < this.config.degradedRateLimit;

            case 'suspended':
                // Circuit breaker: block all requests
                return false;
        }
    }

    /**
     * Manually reset plugin health state
     */
    resetHealth(pluginId: string, tenantId: string): void {
        const key = getHealthKey(pluginId, tenantId);
        this.healthData.set(key, {
            state: 'healthy',
            events: [],
            lastStateChange: new Date(),
        });
    }

    /**
     * Get all monitored plugins for a tenant
     */
    getMonitoredPlugins(tenantId: string): PluginHealthStatus[] {
        const results: PluginHealthStatus[] = [];

        for (const [key] of this.healthData) {
            if (key.startsWith(`${tenantId}:`)) {
                const pluginId = key.replace(`${tenantId}:`, '');
                results.push(this.getStatus(pluginId, tenantId));
            }
        }

        return results;
    }

    /**
     * Check and perform state transitions
     */
    private checkStateTransition(
        pluginId: string,
        tenantId: string,
        data: PluginHealthData
    ): void {
        const now = Date.now();
        const { state } = data;

        // Calculate error rate for degradation window
        const degradedWindowMs = this.config.degradedWindowSeconds * 1000;
        const degradedEvents = data.events.filter(
            e => now - e.timestamp < degradedWindowMs
        );
        const degradedTotal = degradedEvents.length;
        const degradedErrors = degradedEvents.filter(e => !e.success).length;
        const errorRate = degradedTotal > 0 ? degradedErrors / degradedTotal : 0;

        // Calculate recent error count for suspension window
        const suspendedWindowMs = this.config.suspendedWindowSeconds * 1000;
        const suspendedEvents = data.events.filter(
            e => now - e.timestamp < suspendedWindowMs
        );
        const recentErrors = suspendedEvents.filter(e => !e.success).length;

        // State machine transitions
        let newState: PluginHealthState = state;

        switch (state) {
            case 'healthy':
                // Transition to degraded if error rate exceeds threshold
                if (
                    degradedTotal >= 10 && // Minimum sample size
                    errorRate > this.config.degradedErrorRateThreshold
                ) {
                    newState = 'degraded';
                }
                break;

            case 'degraded':
                // Transition to suspended if recent errors exceed threshold
                if (recentErrors >= this.config.suspendedErrorCount) {
                    newState = 'suspended';
                }
                // Transition back to healthy if error rate recovers
                else if (errorRate < this.config.recoveryErrorRateThreshold) {
                    newState = 'healthy';
                }
                break;

            case 'suspended':
                // Can only be reset manually
                break;
        }

        // Apply state change
        if (newState !== state) {
            data.state = newState;
            data.lastStateChange = new Date();

            // Record state change metric
            if (this.metricsService) {
                this.metricsService.incrementCounter(
                    'plugin_health_state_change_total',
                    {
                        plugin_id: pluginId,
                        tenant_id: tenantId,
                        from_state: state,
                        to_state: newState,
                    }
                );
            }

            console.log(JSON.stringify({
                type: 'plugin_health_state_change',
                pluginId,
                tenantId,
                fromState: state,
                toState: newState,
                errorRate,
                recentErrors,
                timestamp: new Date().toISOString(),
            }));
        }
    }

    /**
     * Clean up old events to prevent memory growth
     */
    private cleanupOldEvents(): void {
        const now = Date.now();
        const maxAge = Math.max(
            this.config.degradedWindowSeconds,
            this.config.recoveryWindowSeconds
        ) * 1000 * 2; // Keep 2x the longest window

        for (const data of this.healthData.values()) {
            data.events = data.events.filter(e => now - e.timestamp < maxAge);
        }
    }
}

// Singleton instance
let healthMonitorInstance: PluginHealthMonitor | null = null;

/**
 * Get the singleton health monitor instance
 */
export function getHealthMonitor(): PluginHealthMonitor {
    if (!healthMonitorInstance) {
        healthMonitorInstance = new PluginHealthMonitor();
    }
    return healthMonitorInstance;
}
