import { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { runWithContext, type RequestContext } from '../context/async-local-storage.js';
import { createCapabilitiesForPlugin } from '../plugins/capabilities';
import { auth } from '../auth/auth.js';
import { db } from '../db/client.js';
import { member } from '../db/schema/auth-schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { TraceService } from '../observability/trace.service.js';

// Singleton trace service
const traceService = new TraceService();

/**
 * Mock permissions for MVP - allows all permissions
 */
const mockPermissions = {
    can: async (_capability: string) => true,
    require: async (_capability: string) => { },
    hasDeclared: (_capability: string) => true,
};

/**
 * Create logger for plugin context
 */
function createPluginLogger(pluginId: string) {
    return {
        info: (msg: string, meta?: Record<string, unknown>) => console.log(`[${pluginId}]`, msg, meta ?? ''),
        warn: (msg: string, meta?: Record<string, unknown>) => console.warn(`[${pluginId}]`, msg, meta ?? ''),
        error: (msg: string, meta?: Record<string, unknown>) => console.error(`[${pluginId}]`, msg, meta ?? ''),
        debug: (msg: string, meta?: Record<string, unknown>) => console.debug(`[${pluginId}]`, msg, meta ?? ''),
    };
}

/**
 * Extract pluginId from tRPC request path
 * 
 * Path format: /trpc/pluginApis.{pluginId}.{procedure}
 * Example: /trpc/pluginApis.hello-world.sayHello -> hello-world -> com.wordrhyme.hello-world
 */
function extractPluginIdFromPath(url: string): string | undefined {
    const match = url.match(/\/trpc\/pluginApis\.([^.]+)\./);
    if (match && match[1]) {
        const shortId = match[1];
        // Convert short ID back to full plugin ID
        // hello-world -> com.wordrhyme.hello-world
        return `com.wordrhyme.${shortId}`;
    }
    return undefined;
}

/**
 * Create tRPC context from Fastify request
 *
 * Context is available in all tRPC procedures.
 * Integrates with better-auth to get session and user's organization role.
 * Supports team-level context switching via X-Current-Team-Id header.
 */
export async function createContext({ req, res }: CreateFastifyContextOptions) {
    // Extract pluginId from request URL for plugin API calls
    const pluginId = extractPluginIdFromPath(req.url);

    // Get better-auth session from request
    let userId: string | undefined;
    let tenantId: string | undefined;
    let userRole: string | undefined;
    let currentTeamId: string | undefined;
    let userRoles: string[] = [];

    console.log('[tRPC Context] Creating context for:', req.url);

    try {
        // Convert Fastify request to Web Request for better-auth
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
            if (value) {
                headers.set(key, Array.isArray(value) ? value[0] ?? '' : value);
            }
        }

        const session = await auth.api.getSession({
            headers,
        });

        console.log('[tRPC Context] Session result:', {
            hasSession: !!session,
            userId: session?.user?.id,
            activeOrgId: (session?.session as { activeOrganizationId?: string })?.activeOrganizationId,
        });

        if (session?.user) {
            userId = session.user.id;
            // Get active organization from session
            const activeOrgId = (session.session as { activeOrganizationId?: string })?.activeOrganizationId;
            tenantId = activeOrgId;

            // Get currentTeamId from header (for team-level context switching)
            const teamIdHeader = req.headers['x-current-team-id'];
            currentTeamId = Array.isArray(teamIdHeader) ? teamIdHeader[0] : teamIdHeader;

            // Look up user's role in the active organization
            if (activeOrgId) {
                const [membership] = await db
                    .select({ role: member.role })
                    .from(member)
                    .where(and(
                        eq(member.userId, userId),
                        eq(member.organizationId, activeOrgId)
                    ))
                    .limit(1);

                userRole = membership?.role;
                // Aggregate roles: org role is always included
                if (userRole) {
                    userRoles.push(userRole);
                }
                console.log('[tRPC Context] User role lookup:', { userId, activeOrgId, currentTeamId, role: userRole, roles: userRoles });
            }
        }
    } catch (error) {
        // Session retrieval failed - continue without auth context
        console.debug('[tRPC Context] Failed to get session:', error);
    }

    // Extract or generate trace context from W3C traceparent header
    const traceContext = traceService.extractOrCreate(req.headers);

    // Create request context
    const requestContext: RequestContext = {
        requestId: randomUUID(),
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        parentSpanId: traceContext.parentSpanId,
        locale: req.headers['accept-language']?.split(',')[0] || 'en-US',
        currency: 'USD',
        timezone: 'UTC',
        ...(userId && { userId }),
        ...(tenantId && { tenantId }),
        ...(userRole && { userRole }),
        ...(currentTeamId && { currentTeamId }),
        ...(userRoles.length > 0 && { userRoles }),
    };

    // Run within context for permission kernel
    return runWithContext(requestContext, () => {
        // If this is a plugin API call, create full plugin context with db capability
        if (pluginId) {
            // Create a minimal manifest for capability creation
            const minimalManifest = {
                pluginId,
                version: '1.0.0',
                name: pluginId,
                vendor: 'WordRhyme',
                type: 'full' as const,
                runtime: 'node' as const,
                engines: { wordrhyme: '^0.1.0' },
                permissions: { definitions: [] },
                capabilities: { data: { read: true, write: true } },
            };

            // Build request context, only including defined values
            const capContext: { tenantId?: string; userId?: string } = {};
            if (tenantId) capContext.tenantId = tenantId;
            if (userId) capContext.userId = userId;

            const pluginCapabilities = createCapabilitiesForPlugin(
                pluginId,
                minimalManifest,
                capContext
            );

            return {
                req,
                res,
                ...requestContext,
                pluginId,
                permissions: pluginCapabilities.permissions,
                logger: pluginCapabilities.logger,
                db: pluginCapabilities.db,
                metrics: pluginCapabilities.metrics,
                trace: pluginCapabilities.trace,
            };
        }

        return {
            req,
            res,
            ...requestContext,
            // Add permissions for plugin procedures (MVP: allow all)
            permissions: mockPermissions,
            // Add logger factory
            logger: createPluginLogger('core'),
            // No pluginId for core routes
            pluginId: undefined,
        };
    });
}

export type Context = Awaited<ReturnType<typeof createContext>>;

