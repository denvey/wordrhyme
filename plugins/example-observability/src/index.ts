/**
 * Example Plugin - Observability API Best Practices
 *
 * This plugin demonstrates how to properly use logging, metrics, and tracing
 * in a WordRhyme plugin while adhering to governance rules.
 */
import type { PluginContext } from '@wordrhyme/plugin';

/**
 * 1. Logging Best Practices
 *
 * ✅ DO:
 * - Use appropriate log levels (info for normal operations, warn for concerns, error for failures)
 * - Include relevant context in log messages
 * - Use structured logging with context objects
 *
 * ❌ DON'T:
 * - Log sensitive information (passwords, tokens, PII)
 * - Use debug logs in production (they're disabled by default)
 * - Log excessively (causes performance issues)
 */
function demonstrateLogging(ctx: PluginContext) {
    // ✅ Good: Informational logging
    ctx.logger.info('Processing user request', {
        action: 'user.create',
        userId: 'user-123',
    });

    // ✅ Good: Warning for non-critical issues
    ctx.logger.warn('Rate limit approaching', {
        currentRate: 95,
        limit: 100,
    });

    // ✅ Good: Error logging with context
    try {
        // Some operation that might fail
        throw new Error('Database connection timeout');
    } catch (error) {
        ctx.logger.error('Failed to connect to database', {
            error: error instanceof Error ? error.message : String(error),
            retries: 3,
        });
    }

    // ⚠️ Debug logs require admin to enable (per governance)
    // ctx.logger.debug('Detailed debugging info', { ... });
}

/**
 * 2. Metrics Best Practices
 *
 * ✅ DO:
 * - Use increment() for counting events
 * - Use meaningful metric names (action-oriented)
 * - Use whitelisted labels only: model, type, status
 *
 * ❌ DON'T:
 * - Try to use histogram or gauge (plugins can only use counters)
 * - Use non-whitelisted labels (will throw error)
 * - Create too many unique label combinations (causes cardinality explosion)
 */
function demonstrateMetrics(ctx: PluginContext) {
    // ✅ Good: Count successful operations
    ctx.metrics?.increment('user_operations', {
        type: 'create',
        status: 'success',
    });

    // ✅ Good: Count errors by type
    ctx.metrics?.increment('api_errors', {
        type: 'validation',
        status: 'failure',
    });

    // ✅ Good: Track feature usage
    ctx.metrics?.increment('feature_usage', {
        type: 'export',
        status: 'success',
    });

    // ❌ BAD: These will throw errors (governance violations)
    // ctx.metrics.observe('request_duration', 0.5);  // ❌ histogram not allowed
    // ctx.metrics.gauge('active_users', 42);         // ❌ gauge not allowed
    // ctx.metrics.increment('events', {
    //     customLabel: 'value'  // ❌ non-whitelisted label
    // });
}

/**
 * 3. Tracing Best Practices
 *
 * ✅ DO:
 * - Read trace context for correlation
 * - Include traceId in external API calls
 * - Log traceId for debugging
 *
 * ❌ DON'T:
 * - Try to create spans (plugins can only read trace context)
 * - Modify trace context (read-only access)
 */
function demonstrateTracing(ctx: PluginContext) {
    // ✅ Good: Read trace information
    const traceId = ctx.trace?.getTraceId();
    const spanId = ctx.trace?.getSpanId();

    ctx.logger.info('Processing with trace context', {
        traceId,
        spanId,
    });

    // ✅ Good: Include trace in external API calls
    if (traceId && spanId) {
        const headers = {
            'traceparent': `00-${traceId}-${spanId}-01`,
        };

        // Example: Make external API call with trace propagation
        // fetch('https://api.example.com/data', { headers });
    }

    // ❌ BAD: Plugins cannot create spans (governance restriction)
    // const newSpan = ctx.trace.createSpan('operation');  // ❌ Not available
}

/**
 * 4. Comprehensive Example: User Registration Flow
 *
 * Shows how to use all observability APIs together in a real scenario
 */
async function userRegistrationExample(ctx: PluginContext, userData: { email: string; name: string }) {
    const traceId = ctx.trace?.getTraceId();

    try {
        // 1. Log start of operation
        ctx.logger.info('Starting user registration', {
            traceId,
            email: userData.email, // OK: email is not sensitive in this context
            // ❌ Never log: password, tokens, credit card numbers
        });

        // 2. Count registration attempts
        ctx.metrics?.increment('user_registrations', {
            type: 'email',
            status: 'success', // Changed from 'started' to valid value
        });

        // 3. Simulate validation
        if (!userData.email.includes('@')) {
            ctx.logger.warn('Invalid email format', {
                traceId,
                email: userData.email,
            });

            ctx.metrics?.increment('user_registrations', {
                type: 'email',
                status: 'failure', // Changed from 'validation_failed' to valid value
            });

            throw new Error('Invalid email format');
        }

        // 4. Simulate successful registration
        ctx.logger.info('User registered successfully', {
            traceId,
            userId: 'user-new-123',
        });

        ctx.metrics?.increment('user_registrations', {
            type: 'email',
            status: 'success',
        });

        return { success: true, userId: 'user-new-123' };

    } catch (error) {
        // 5. Log errors with full context
        ctx.logger.error('User registration failed', {
            traceId,
            error: error instanceof Error ? error.message : String(error),
            email: userData.email,
        });

        ctx.metrics?.increment('user_registrations', {
            type: 'email',
            status: 'failure', // Changed from 'error' to valid value
        });

        throw error;
    }
}

/**
 * Plugin Lifecycle Hooks
 */
export async function onEnable(ctx: PluginContext) {
    ctx.logger.info('Observability example plugin enabled');

    // Demonstrate all APIs
    demonstrateLogging(ctx);
    demonstrateMetrics(ctx);
    demonstrateTracing(ctx);

    ctx.logger.info('All observability API demonstrations completed');
}

export async function onDisable(ctx: PluginContext) {
    ctx.logger.info('Observability example plugin disabled');
}

/**
 * tRPC Router (if needed)
 */
export const router = {
    // Example endpoint that uses observability APIs
    async testUserRegistration(ctx: PluginContext) {
        return await userRegistrationExample(ctx, {
            email: 'test@example.com',
            name: 'Test User',
        });
    },
};
