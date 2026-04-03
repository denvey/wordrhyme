/**
 * Trace Service
 *
 * Handles TraceId/SpanId generation and propagation.
 * Supports W3C traceparent header format.
 */
import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import type { TraceContext } from './types.js';

/**
 * W3C Trace Context format:
 * traceparent = version-traceId-spanId-flags
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 */
const TRACEPARENT_REGEX = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

@Injectable()
export class TraceService {
    /**
     * Extract trace context from HTTP headers or generate new
     *
     * @param headers - HTTP headers (supports Headers, Map, or plain object)
     * @returns TraceContext with traceId and spanId
     */
    extractOrCreate(headers: Headers | Map<string, string> | Record<string, string | string[] | undefined>): TraceContext {
        const traceparent = this.getHeader(headers, 'traceparent');

        if (traceparent) {
            const parsed = this.parseTraceparent(traceparent);
            if (parsed) {
                return parsed;
            }
        }

        // Generate new trace
        return this.generateTrace();
    }

    /**
     * Parse W3C traceparent header
     *
     * Format: version-traceId-spanId-flags
     * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
     */
    parseTraceparent(traceparent: string): TraceContext | null {
        const match = traceparent.match(TRACEPARENT_REGEX);
        if (!match) {
            return null;
        }

        const [, , traceId, spanId, flags] = match;
        if (!traceId || !spanId || !flags) {
            return null;
        }

        return {
            traceId,
            spanId,
            sampled: (Number.parseInt(flags, 16) & 0x01) === 0x01,
        };
    }

    /**
     * Generate a new trace context
     */
    generateTrace(): TraceContext {
        return {
            traceId: randomUUID().replace(/-/g, ''),
            spanId: randomBytes(8).toString('hex'),
            sampled: true,
        };
    }

    /**
     * Generate a new span ID
     */
    generateSpanId(): string {
        return randomBytes(8).toString('hex');
    }

    /**
     * Generate a child span under the current trace
     */
    createChildSpan(parentContext: TraceContext): TraceContext {
        return {
            traceId: parentContext.traceId,
            spanId: randomBytes(8).toString('hex'),
            parentSpanId: parentContext.spanId,
            sampled: parentContext.sampled,
        };
    }

    /**
     * Format trace context as W3C traceparent header
     */
    formatTraceparent(context: TraceContext): string {
        const flags = context.sampled ? '01' : '00';
        return `00-${context.traceId}-${context.spanId}-${flags}`;
    }

    /**
     * Get header value from various header formats
     */
    private getHeader(
        headers: Headers | Map<string, string> | Record<string, string | string[] | undefined>,
        name: string
    ): string | undefined {
        if (headers instanceof Headers) {
            return headers.get(name) ?? undefined;
        }

        if (headers instanceof Map) {
            return headers.get(name);
        }

        const value = headers[name] ?? headers[name.toLowerCase()];
        if (Array.isArray(value)) {
            return value[0];
        }
        return value;
    }
}
