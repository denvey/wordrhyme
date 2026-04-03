/**
 * Traced Decorator
 *
 * Decorator for automatic span creation in service methods.
 * Per OBSERVABILITY_GOVERNANCE: This is for Core only.
 *
 * @example
 * ```typescript
 * class UserService {
 *   @Traced('user.findById')
 *   async findById(id: string): Promise<User> {
 *     return this.userRepository.findById(id);
 *   }
 * }
 * ```
 */
import { getContext, runWithContext } from '../context/async-local-storage';
import { TraceService } from './trace.service.js';

// Shared trace service instance
let traceService: TraceService | null = null;

function getTraceService(): TraceService {
    if (!traceService) {
        traceService = new TraceService();
    }
    return traceService;
}

/**
 * Traced decorator options
 */
export interface TracedOptions {
    /**
     * Custom span name (default: className.methodName)
     */
    name?: string;

    /**
     * Additional attributes to add to the span
     */
    attributes?: Record<string, string | number | boolean>;

    /**
     * Whether to record the method arguments (default: false for security)
     */
    recordArgs?: boolean;

    /**
     * Whether to record the return value (default: false for security)
     */
    recordResult?: boolean;
}

/**
 * @Traced() decorator for automatic span creation
 *
 * Creates a child span for the decorated method, automatically:
 * - Generates a new spanId
 * - Sets the current spanId as parentSpanId
 * - Propagates the traceId
 * - Updates AsyncLocalStorage context
 *
 * @param nameOrOptions - Span name string or TracedOptions object
 *
 * @example
 * ```typescript
 * // Simple usage with auto-generated name
 * class OrderService {
 *   @Traced()
 *   async createOrder(data: CreateOrderDto) { ... }
 * }
 *
 * // Custom span name
 * class PaymentService {
 *   @Traced('payment.process')
 *   async processPayment(orderId: string) { ... }
 * }
 *
 * // With options
 * class AnalyticsService {
 *   @Traced({ name: 'analytics.track', recordArgs: true })
 *   async trackEvent(event: string, data: Record<string, unknown>) { ... }
 * }
 * ```
 */
export function Traced(nameOrOptions?: string | TracedOptions): MethodDecorator {
    return (
        target: object,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ) => {
        const originalMethod = descriptor.value;
        const className = target.constructor.name;
        const methodName = String(propertyKey);

        // Parse options
        const options: TracedOptions =
            typeof nameOrOptions === 'string'
                ? { name: nameOrOptions }
                : nameOrOptions || {};

        const spanName = options.name || `${className}.${methodName}`;

        descriptor.value = async function (...args: unknown[]) {
            const service = getTraceService();

            // Get current context
            let currentContext;
            try {
                currentContext = getContext();
            } catch {
                // No context available, execute without tracing
                return originalMethod.apply(this, args);
            }

            // Create child span
            const newSpanId = service.generateSpanId();
            const parentSpanId = currentContext.spanId;

            // Create new context with child span
            const childContext = {
                ...currentContext,
                spanId: newSpanId,
                parentSpanId: parentSpanId,
            };

            // Execute method with child context
            return runWithContext(childContext, async () => {
                const startTime = Date.now();
                let error: Error | undefined;

                try {
                    const result = await originalMethod.apply(this, args);

                    // Log span completion (optional: could integrate with trace collector)
                    if (process.env['LOG_LEVEL'] === 'debug') {
                        console.debug(JSON.stringify({
                            type: 'span',
                            name: spanName,
                            traceId: currentContext.traceId,
                            spanId: newSpanId,
                            parentSpanId,
                            duration: Date.now() - startTime,
                            status: 'ok',
                            ...(options.attributes || {}),
                        }));
                    }

                    return result;
                } catch (err) {
                    error = err as Error;

                    // Log span error
                    if (process.env['LOG_LEVEL'] === 'debug') {
                        console.debug(JSON.stringify({
                            type: 'span',
                            name: spanName,
                            traceId: currentContext.traceId,
                            spanId: newSpanId,
                            parentSpanId,
                            duration: Date.now() - startTime,
                            status: 'error',
                            error: error.message,
                            ...(options.attributes || {}),
                        }));
                    }

                    throw error;
                }
            });
        };

        return descriptor;
    };
}

/**
 * Helper function to create a traced span programmatically
 *
 * Use this when you need more control than the decorator provides.
 *
 * @example
 * ```typescript
 * const result = await withSpan('db.query', async () => {
 *   return db.query(sql);
 * });
 * ```
 */
export async function withSpan<T>(
    spanName: string,
    fn: () => Promise<T>,
    options?: Omit<TracedOptions, 'name'>
): Promise<T> {
    const service = getTraceService();

    // Get current context
    let currentContext;
    try {
        currentContext = getContext();
    } catch {
        // No context available, execute without tracing
        return fn();
    }

    // Create child span
    const newSpanId = service.generateSpanId();
    const parentSpanId = currentContext.spanId;

    // Create new context with child span
    const childContext = {
        ...currentContext,
        spanId: newSpanId,
        parentSpanId: parentSpanId,
    };

    // Execute function with child context
    return runWithContext(childContext, async () => {
        const startTime = Date.now();

        try {
            const result = await fn();

            if (process.env['LOG_LEVEL'] === 'debug') {
                console.debug(JSON.stringify({
                    type: 'span',
                    name: spanName,
                    traceId: currentContext.traceId,
                    spanId: newSpanId,
                    parentSpanId,
                    duration: Date.now() - startTime,
                    status: 'ok',
                    ...(options?.attributes || {}),
                }));
            }

            return result;
        } catch (err) {
            const error = err as Error;

            if (process.env['LOG_LEVEL'] === 'debug') {
                console.debug(JSON.stringify({
                    type: 'span',
                    name: spanName,
                    traceId: currentContext.traceId,
                    spanId: newSpanId,
                    parentSpanId,
                    duration: Date.now() - startTime,
                    status: 'error',
                    error: error.message,
                    ...(options?.attributes || {}),
                }));
            }

            throw error;
        }
    });
}
