/**
 * Metrics Service
 *
 * Prometheus-compatible metrics collection using prom-client.
 * Provides both Core and Plugin metrics APIs.
 */
import { Injectable } from '@nestjs/common';
import {
    Registry,
    Counter,
    Histogram,
    Gauge,
    collectDefaultMetrics,
} from 'prom-client';
import type {
    MetricsService as IMetricsService,
    PluginMetrics,
    AllowedLabels,
} from './types.js';

// Label whitelist for plugin metrics (per OBSERVABILITY_GOVERNANCE §4.1)
const ALLOWED_PLUGIN_LABELS = new Set(['model', 'type', 'status']);

// Validate and sanitize labels
function sanitizeLabels(labels?: Record<string, string>): Record<string, string> {
    if (!labels) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(labels)) {
        // Sanitize label values (replace special chars)
        result[key] = String(value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    }
    return result;
}

// Validate plugin labels against whitelist
function validatePluginLabels(labels?: AllowedLabels): Record<string, string> {
    if (!labels) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(labels)) {
        if (ALLOWED_PLUGIN_LABELS.has(key) && value !== undefined) {
            result[key] = String(value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
        }
    }
    return result;
}

@Injectable()
export class MetricsServiceImpl implements IMetricsService {
    private readonly registry: Registry;
    private readonly counters = new Map<string, Counter>();
    private readonly histograms = new Map<string, Histogram>();
    private readonly gauges = new Map<string, Gauge>();

    constructor() {
        this.registry = new Registry();

        // Collect default Node.js metrics (memory, CPU, etc.)
        if (process.env['METRICS_COLLECT_DEFAULT'] !== 'false') {
            collectDefaultMetrics({ register: this.registry });
        }

        // Pre-register common Core metrics
        this.registerCoreMetrics();
    }

    /**
     * Register common Core metrics
     */
    private registerCoreMetrics(): void {
        // HTTP request duration histogram
        this.histograms.set(
            'http_request_duration_seconds',
            new Histogram({
                name: 'http_request_duration_seconds',
                help: 'Duration of HTTP requests in seconds',
                labelNames: ['method', 'route', 'status', 'tenantId'],
                buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
                registers: [this.registry],
            })
        );

        // HTTP request total counter
        this.counters.set(
            'http_requests_total',
            new Counter({
                name: 'http_requests_total',
                help: 'Total number of HTTP requests',
                labelNames: ['method', 'route', 'status', 'tenantId'],
                registers: [this.registry],
            })
        );

        // Plugin capability invocation counter
        this.counters.set(
            'plugin_capability_invocations_total',
            new Counter({
                name: 'plugin_capability_invocations_total',
                help: 'Total number of plugin capability invocations',
                labelNames: ['pluginId', 'capability', 'tenantId', 'success'],
                registers: [this.registry],
            })
        );

        // Plugin errors counter
        this.counters.set(
            'plugin_errors_total',
            new Counter({
                name: 'plugin_errors_total',
                help: 'Total number of plugin errors',
                labelNames: ['pluginId', 'tenantId', 'errorType'],
                registers: [this.registry],
            })
        );

        // Active connections gauge
        this.gauges.set(
            'active_connections',
            new Gauge({
                name: 'active_connections',
                help: 'Number of active connections',
                labelNames: ['tenantId'],
                registers: [this.registry],
            })
        );
    }

    // ========================================================================
    // Counter Methods
    // ========================================================================

    incrementCounter(name: string, labels?: Record<string, string>, value = 1): void {
        let counter = this.counters.get(name);
        if (!counter) {
            counter = new Counter({
                name,
                help: `Counter: ${name}`,
                labelNames: Object.keys(labels ?? {}),
                registers: [this.registry],
            });
            this.counters.set(name, counter);
        }
        counter.inc(sanitizeLabels(labels), value);
    }

    // ========================================================================
    // Histogram Methods
    // ========================================================================

    observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
        let histogram = this.histograms.get(name);
        if (!histogram) {
            histogram = new Histogram({
                name,
                help: `Histogram: ${name}`,
                labelNames: Object.keys(labels ?? {}),
                registers: [this.registry],
            });
            this.histograms.set(name, histogram);
        }
        histogram.observe(sanitizeLabels(labels), value);
    }

    // ========================================================================
    // Gauge Methods
    // ========================================================================

    setGauge(name: string, value: number, labels?: Record<string, string>): void {
        let gauge = this.gauges.get(name);
        if (!gauge) {
            gauge = new Gauge({
                name,
                help: `Gauge: ${name}`,
                labelNames: Object.keys(labels ?? {}),
                registers: [this.registry],
            });
            this.gauges.set(name, gauge);
        }
        gauge.set(sanitizeLabels(labels), value);
    }

    incrementGauge(name: string, labels?: Record<string, string>, value = 1): void {
        const gauge = this.gauges.get(name);
        if (gauge) {
            gauge.inc(sanitizeLabels(labels), value);
        }
    }

    decrementGauge(name: string, labels?: Record<string, string>, value = 1): void {
        const gauge = this.gauges.get(name);
        if (gauge) {
            gauge.dec(sanitizeLabels(labels), value);
        }
    }

    // ========================================================================
    // Plugin Metrics (Restricted API)
    // ========================================================================

    /**
     * Create a plugin-scoped metrics interface
     *
     * Per OBSERVABILITY_GOVERNANCE §4.1:
     * - Only increment() for discrete event counters
     * - Automatic pluginId/tenantId label injection
     * - Label whitelist enforcement
     */
    createPluginMetrics(pluginId: string, tenantId: string): PluginMetrics {
        return {
            increment: (name: string, labels?: AllowedLabels, value = 1) => {
                const metricName = `plugin_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
                const validatedLabels = validatePluginLabels(labels);
                const fullLabels = {
                    pluginId,
                    tenantId,
                    ...validatedLabels,
                };
                this.incrementCounter(metricName, fullLabels, value);
            },
        };
    }

    // ========================================================================
    // Prometheus Exposition
    // ========================================================================

    /**
     * Get all metrics in Prometheus text exposition format
     */
    async getMetrics(): Promise<string> {
        return this.registry.metrics();
    }

    /**
     * Get the registry for custom integrations
     */
    getRegistry(): Registry {
        return this.registry;
    }
}
