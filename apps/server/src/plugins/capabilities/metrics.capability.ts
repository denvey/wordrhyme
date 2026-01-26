/**
 * Metrics Capability Implementation
 *
 * Provides scoped metrics recording for plugins with:
 * - Automatic pluginId/organizationId label injection
 * - Label whitelist enforcement per OBSERVABILITY_GOVERNANCE §4.1
 * - Only increment() method (no histogram/gauge)
 */
import type { PluginMetricsCapability, PluginMetricsAllowedLabels } from '@wordrhyme/plugin';
import { MetricsServiceImpl } from '../../observability/index.js';

// Singleton metrics service instance
let metricsServiceInstance: MetricsServiceImpl | null = null;

/**
 * Get or create the metrics service instance
 */
function getMetricsService(): MetricsServiceImpl {
    if (!metricsServiceInstance) {
        metricsServiceInstance = new MetricsServiceImpl();
    }
    return metricsServiceInstance;
}

/**
 * Create a scoped metrics capability for a plugin
 *
 * @param pluginId - Plugin identifier
 * @param organizationId - Tenant identifier
 */
export function createPluginMetrics(
    pluginId: string,
    organizationId: string
): PluginMetricsCapability {
    const metricsService = getMetricsService();
    return metricsService.createPluginMetrics(pluginId, organizationId);
}
