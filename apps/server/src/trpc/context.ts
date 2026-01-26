import { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { requestContextStorage, type RequestContext } from '../context/async-local-storage';
import { createCapabilitiesForPlugin } from '../plugins/capabilities';
import { auth } from '../auth/auth.js';
import { db } from '../db/index.js';
import { member, user } from '../db/schema/auth-schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { TraceService } from '../observability/trace.service.js';
import { getBillingContext } from '../billing/billing-context.js';

// Singleton trace service
const traceService = new TraceService();

// Singleton billing context (lazy initialized)
const billingContext = getBillingContext();

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
    let organizationId: string | undefined;
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

            // Get currentTeamId from header (for team-level context switching)
            const teamIdHeader = req.headers['x-current-team-id'];
            currentTeamId = Array.isArray(teamIdHeader) ? teamIdHeader[0] : teamIdHeader;

            // Get user's global role from user table (Better Auth admin plugin)
            const userRecord = await db
                .select({ role: user.role })
                .from(user)
                .where(eq(user.id, userId))
                .limit(1);

            const globalRole = userRecord[0]?.role;

            // ✅ STRICT MODE: activeOrganizationId is required
            if (!activeOrgId) {
                console.error('[tRPC Context] No activeOrganizationId in session:', {
                    userId,
                    sessionId: session.session.id,
                    hasSession: !!session,
                });
                // Don't throw here - let it continue and set organizationId to undefined
                // The error will be caught by procedures that require organization context
                organizationId = undefined;
            } else {
                organizationId = activeOrgId;
            }

            // Query user's roles from current organization only (context isolation)
            const orgsToCheck = organizationId ? [organizationId] : [];

            const memberships = await db
                .select({ role: member.role, organizationId: member.organizationId })
                .from(member)
                .where(and(
                    eq(member.userId, userId),
                    inArray(member.organizationId, orgsToCheck)
                ));

            // Set userRole from active organization (for backward compatibility)
            const currentOrgMembership = memberships.find(m => m.organizationId === organizationId);
            userRole = currentOrgMembership?.role;

            // Aggregate all unique roles: global role + organization roles
            if (globalRole && !userRoles.includes(globalRole)) {
                userRoles.push(globalRole);
            }
            for (const m of memberships) {
                if (m.role && !userRoles.includes(m.role)) {
                    userRoles.push(m.role);
                }
            }

            console.log('[tRPC Context] User role lookup:', { userId, organizationId, currentTeamId, globalRole, orgRole: userRole, allRoles: userRoles });
        }
    } catch (error) {
        // Session retrieval failed - continue without auth context
        console.debug('[tRPC Context] Failed to get session:', error);
    }

    // Extract or generate trace context from W3C traceparent header
    const traceContext = traceService.extractOrCreate(req.headers);

    // Get existing context from main.ts onRequest hook (if any)
    const existingContext = requestContextStorage.getStore();

    // Create request context, merging with existing context
    const requestContext: RequestContext = {
        ...(existingContext || {}),
        requestId: existingContext?.requestId || randomUUID(),
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        parentSpanId: traceContext.parentSpanId,
        locale: req.headers['accept-language']?.split(',')[0] || 'en-US',
        currency: 'USD',
        timezone: 'UTC',
        ...(userId && { userId }),
        ...(organizationId && { organizationId }),
        ...(userRole && { userRole }),
        ...(currentTeamId && { currentTeamId }),
        ...(userRoles.length > 0 && { userRoles }),
    };

    // Update AsyncLocalStorage context using enterWith so it persists for the entire request
    // This ensures getContext() returns the updated context in tRPC procedures
    requestContextStorage.enterWith(requestContext);

    console.log('[tRPC Context] Updated AsyncLocalStorage context:', {
        userId: requestContext.userId,
        organizationId: requestContext.organizationId,
        userRole: requestContext.userRole,
        userRoles: requestContext.userRoles,
    });

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
        const capContext: { organizationId?: string; userId?: string } = {};
        if (organizationId) capContext.organizationId = organizationId;
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
            // Billing services (also available for plugin routes)
            ...billingContext,
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
        // LBAC-enabled database (auto tenant isolation)
        db,
        // Billing services
        ...billingContext,
    };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

