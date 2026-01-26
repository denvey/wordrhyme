import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { runWithContext, createDefaultContext, type RequestContext, type ActorType } from './async-local-storage';
import { env } from '../config/env.js';
import { auth } from '../auth/auth.js';

/**
 * Context Middleware
 *
 * Extracts tenant, user, locale from request and stores in AsyncLocalStorage.
 * Also captures audit-related fields: IP, User-Agent, Trace ID.
 */
@Injectable()
export class ContextMiddleware implements NestMiddleware {
    use(req: FastifyRequest['raw'], _res: FastifyReply['raw'], next: () => void) {
        // Extract context asynchronously
        this.extractContext(req as unknown as FastifyRequest)
            .then(context => {
                runWithContext(context, () => {
                    next();
                });
            })
            .catch(error => {
                console.error('[ContextMiddleware] Failed to extract context:', error);
                // Create minimal context for error handling
                const errorContext = createDefaultContext({});
                runWithContext(errorContext, () => {
                    next();
                });
            });
    }

    private async extractContext(req: FastifyRequest): Promise<RequestContext> {
        // Extract audit-related fields (common to all environments)
        const auditFields = this.extractAuditFields(req);

        // In development, use stub auth mode
        if (env.NODE_ENV === 'development') {
            return createDefaultContext({
                organizationId: req.headers['x-org-id'] as string || 'dev-tenant',
                userId: req.headers['x-user-id'] as string || 'dev-admin',
                userRole: 'admin',
                actorType: 'user',
                ...auditFields,
            });
        }

        // Production: Get session from better-auth
        // Convert Fastify request headers to Web Headers for better-auth
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
            if (value) {
                headers.set(key, Array.isArray(value) ? value[0] ?? '' : value);
            }
        }

        const session = await auth.api.getSession({ headers });

        // Check for API Token authentication (fallback for non-session requests)
        const apiTokenId = req.headers['x-api-token-id'] as string | undefined;
        const headerOrgId = req.headers['x-org-id'] as string | undefined;

        if (session?.session?.activeOrganizationId) {
            // ✅ Session exists with active organization - use it
            return createDefaultContext({
                organizationId: session.session.activeOrganizationId,
                userId: session.user.id,
                userRole: session.user.role as string,
                sessionId: session.session.id,
                actorType: 'user',
                ...auditFields,
            });
        } else if (apiTokenId && headerOrgId) {
            // ✅ API Token mode - explicit header required
            return createDefaultContext({
                organizationId: headerOrgId,
                userId: req.headers['x-user-id'] as string,
                actorType: 'api-token',
                apiTokenId,
                ...auditFields,
            });
        } else {
            // ❌ No valid authentication context
            console.warn('[ContextMiddleware] No valid session or API token found');
            return createDefaultContext({
                ...auditFields,
            });
        }
    }

    /**
     * Extract audit-related fields from request
     */
    private extractAuditFields(req: FastifyRequest): Partial<RequestContext> {
        // Extract client IP (handle proxy headers)
        const ip = this.extractClientIp(req);

        // Extract User-Agent
        const userAgent = req.headers['user-agent'] as string | undefined;

        // Extract or generate Trace ID (W3C Trace Context format)
        const traceId = this.extractTraceId(req);

        // Determine actor type based on auth method
        const actorType = this.determineActorType(req);

        // Extract API token ID if present
        const apiTokenId = req.headers['x-api-token-id'] as string | undefined;

        return {
            ip,
            userAgent,
            traceId,
            actorType,
            apiTokenId,
        };
    }

    /**
     * Extract client IP from request, considering proxy headers
     */
    private extractClientIp(req: FastifyRequest): string | undefined {
        // Check X-Forwarded-For header (set by proxies/load balancers)
        const forwardedFor = req.headers['x-forwarded-for'];
        if (forwardedFor) {
            // X-Forwarded-For can contain multiple IPs, take the first one
            const headerValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
            if (headerValue) {
                const ips = headerValue.split(',');
                return ips[0]?.trim();
            }
        }

        // Check X-Real-IP header
        const realIp = req.headers['x-real-ip'];
        if (realIp) {
            return Array.isArray(realIp) ? realIp[0] : realIp;
        }

        // Fall back to socket remote address
        return req.ip;
    }

    /**
     * Extract or generate W3C Trace ID
     */
    private extractTraceId(req: FastifyRequest): string {
        // Check for W3C traceparent header (format: version-trace_id-parent_id-flags)
        const traceparent = req.headers['traceparent'] as string | undefined;
        if (traceparent) {
            const parts = traceparent.split('-');
            if (parts.length >= 2 && parts[1]?.length === 32) {
                return parts[1];
            }
        }

        // Check for X-Request-ID header
        const requestId = req.headers['x-request-id'] as string | undefined;
        if (requestId) {
            return requestId;
        }

        // Generate new trace ID
        return crypto.randomUUID().replace(/-/g, '');
    }

    /**
     * Determine actor type based on authentication method
     */
    private determineActorType(req: FastifyRequest): ActorType {
        // API token authentication
        if (req.headers['authorization']?.startsWith('Bearer ') && req.headers['x-api-token-id']) {
            return 'api-token';
        }

        // Plugin authentication (plugin-specific header)
        if (req.headers['x-plugin-id']) {
            return 'plugin';
        }

        // Default to user authentication
        return 'user';
    }
}
