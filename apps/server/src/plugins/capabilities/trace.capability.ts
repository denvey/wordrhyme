/**
 * Trace Capability Implementation
 *
 * Provides read-only trace context access for plugins.
 * Per OBSERVABILITY_GOVERNANCE §5:
 * - Plugins can only read trace context
 * - Plugins cannot create spans or modify trace context
 */
import type { PluginTraceCapability } from '@wordrhyme/plugin';
import { getContext } from '../../context/async-local-storage.js';

/**
 * Create a read-only trace capability for a plugin
 *
 * @param _pluginId - Plugin identifier (for future use, e.g., tracing plugin calls)
 */
export function createPluginTrace(_pluginId: string): PluginTraceCapability {
    return {
        getTraceId(): string | undefined {
            try {
                const ctx = getContext();
                return ctx.traceId;
            } catch {
                // Outside request scope
                return undefined;
            }
        },

        getSpanId(): string | undefined {
            try {
                const ctx = getContext();
                return ctx.spanId;
            } catch {
                // Outside request scope
                return undefined;
            }
        },
    };
}
