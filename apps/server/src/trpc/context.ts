import { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { requestContextStorage, type RequestContext } from '../context/async-local-storage';
import { createCapabilitiesForPlugin } from '../plugins/capabilities';
import { auth } from '../auth/auth.js';
import { db, rawDb, createScopedDb } from '../db/index.js';
import { member, user } from '@wordrhyme/db';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { TraceService } from '../observability/trace.service.js';
import { getBillingContext } from '../billing/billing-context.js';
import { resolvePluginId } from './router';
import type { PluginManifest } from '@wordrhyme/plugin';
import type { SettingsService } from '../settings/settings.service';
import type { FeatureFlagService } from '../settings/feature-flag.service';
import type { HookRegistry } from '../hooks/hook-registry';
import type { HookExecutor } from '../hooks/hook-executor';
import { PermissionKernel } from '../permission/permission-kernel';

// Singleton trace service
const traceService = new TraceService();

// Singleton billing context (lazy initialized)
const billingContext = getBillingContext();

// Singleton permission kernel for plugin capability delegation
const permissionKernel = new PermissionKernel();

// ============================================================================
// Plugin Service Provider - encapsulates all injected services
// ============================================================================

interface PluginServiceProvider {
    settingsService: SettingsService;
    featureFlagService: FeatureFlagService;
    hookRegistry?: HookRegistry;
    hookExecutor?: HookExecutor;
    getPluginManifest: (pluginId: string) => PluginManifest | undefined;
}

let _serviceProvider: PluginServiceProvider | undefined;

/**
 * Inject all services needed for plugin context capabilities.
 * Called once by TrpcModule.onModuleInit().
 */
export function setPluginContextServices(provider: PluginServiceProvider): void {
    _serviceProvider = provider;
}

function getPluginContextServices(): PluginServiceProvider {
    if (!_serviceProvider) {
        throw new Error('Plugin services not available. Server may still be initializing.');
    }
    return _serviceProvider;
}

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
 * Extract normalizedId from tRPC request path, then resolve to real pluginId
 * via the bidirectional mapping maintained in router.ts
 *
 * Path format: /trpc/pluginApis.{normalizedId}.{procedure}
 * Example: /trpc/pluginApis.storage-s3.listInstances
 *   → normalizedId = "storage-s3"
 *   → resolvePluginId("storage-s3") = "com.wordrhyme.storage-s3"
 *
 * Also handles batch requests where plugin calls may not be at the start:
 * Example: /trpc/settings.list,pluginApis.storage-s3.listInstances?batch=1
 */
function extractPluginIdFromPath(url: string): string | undefined {
    // Match pluginApis anywhere in the URL (handles batch requests)
    const match = url.match(/pluginApis\.([^.,]+)/);
    if (match && match[1]) {
        const normalizedId = match[1];
        // Use bidirectional mapping (lossless) instead of hardcoded prefix
        const realPluginId = resolvePluginId(normalizedId);
        if (!realPluginId) {
            console.warn(`[tRPC Context] Unknown plugin normalizedId: ${normalizedId}`);
        }
        return realPluginId;
    }
    return undefined;
}

/**
 * Fallback manifest for plugins whose real manifest cannot be found.
 * Only grants settings capability (required for basic operation).
 * Does NOT grant storage/files/assets — plugins must declare these in their manifest.
 */
function createFallbackManifest(pluginId: string): PluginManifest {
    return {
        pluginId,
        version: '0.0.0',
        name: pluginId,
        vendor: 'WordRhyme',
        runtime: 'node' as const,
        engines: { wordrhyme: '^0.1.0' },
        permissions: { definitions: [] },
        // Minimal capabilities — no storage/files/assets
        capabilities: { data: { read: true, write: true } },
    };
}

export function buildPluginCallerContext(params: {
    pluginId: string;
    requestContext: RequestContext;
    req?: CreateFastifyContextOptions['req'];
    res?: CreateFastifyContextOptions['res'];
}) {
    const { pluginId, requestContext, req, res } = params;
    const services = getPluginContextServices();

    const realManifest = services.getPluginManifest(pluginId);
    if (!realManifest) {
        console.warn(`[tRPC Context] Plugin manifest not found for ${pluginId}, using fallback (minimal capabilities)`);
    }
    const manifest = realManifest ?? createFallbackManifest(pluginId);

    const capContext: {
        organizationId?: string;
        userId?: string;
        requestId?: string;
        userRole?: string;
        userRoles?: string[];
        currentTeamId?: string;
    } = {};
    if (requestContext.organizationId) capContext.organizationId = requestContext.organizationId;
    if (requestContext.userId) capContext.userId = requestContext.userId;
    if (requestContext.requestId) capContext.requestId = requestContext.requestId;
    if (requestContext.userRole) capContext.userRole = requestContext.userRole;
    if (requestContext.userRoles && requestContext.userRoles.length > 0) capContext.userRoles = requestContext.userRoles;
    if (requestContext.currentTeamId) capContext.currentTeamId = requestContext.currentTeamId;

    const pluginCapabilities = createCapabilitiesForPlugin(
        pluginId,
        manifest,
        capContext,
        {
            settingsService: services.settingsService,
            featureFlagService: services.featureFlagService,
            permissionKernel,
            hookRegistry: services.hookRegistry,
            hookExecutor: services.hookExecutor,
        }
    );

    const normalizedPluginIdForDb = pluginId.replace(/[.\-]/g, '_');

    return {
        req,
        res,
        ...requestContext,
        __pluginProcedureMiddlewares: [globalHookMiddlewareShim],
        pluginId,
        permissions: pluginCapabilities.permissions,
        logger: pluginCapabilities.logger,
        settings: pluginCapabilities.settings,
        db: createScopedDb({ tablePrefix: `plugin_${normalizedPluginIdForDb}_` }),
        hooks: pluginCapabilities.hooks,
        metrics: pluginCapabilities.metrics,
        trace: pluginCapabilities.trace,
        ...billingContext,
    };
}

async function globalHookMiddlewareShim(opts: any) {
    const { path, type, ctx, next } = opts;

    if (type !== 'mutation' || !path.startsWith('pluginApis.')) {
        return next({ ctx });
    }

    const hookPath = path.replace(/^pluginApis\./, '');
    const hooks = (ctx as { hooks?: { emit: (id: string, data: unknown, opts?: { pipe?: boolean }) => Promise<unknown> } }).hooks;

    if (!hooks) {
        return next({ ctx });
    }

    const rawInput = await opts.getRawInput();
    const modified = await hooks.emit(`${hookPath}.before`, rawInput, { pipe: true });
    const inputToUse = modified !== undefined ? modified : rawInput;

    const result = inputToUse !== rawInput
        ? await next({ getRawInput: () => Promise.resolve(inputToUse) })
        : await next({ ctx });

    if (result.ok) {
        hooks.emit(`${hookPath}.after`, result.data).catch((err: unknown) => {
            console.warn(`[HookMiddleware] after hook error for ${hookPath}:`, err);
        });
    }

    return result;
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
    const userRoles: string[] = [];

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
            const sessionUserId = session.user.id;
            userId = sessionUserId;
            // Get active organization from session
            const activeOrgId = (session.session as { activeOrganizationId?: string })?.activeOrganizationId;

            // Get currentTeamId from header (for team-level context switching)
            const teamIdHeader = req.headers['x-current-team-id'];
            currentTeamId = Array.isArray(teamIdHeader) ? teamIdHeader[0] : teamIdHeader;

            // Get user's global role from user table (Better Auth admin plugin)
            // rawDb: full ALS context not yet established (organizationId unknown at this point)
            const userRecord = await rawDb
                .select({ role: user.role })
                .from(user)
                .where(eq(user.id, sessionUserId))
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
            // rawDb: full ALS context not yet established (building it now)
            const orgsToCheck = organizationId ? [organizationId] : [];

            const memberships = await rawDb
                .select({ role: member.role, organizationId: member.organizationId })
                .from(member)
                .where(and(
                    eq(member.userId, sessionUserId),
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
        console.debug('[tRPC Context] Failed to get session:', error instanceof Error ? error.message : String(error));
    }

    // Extract or generate trace context from W3C traceparent header
    const traceContext = traceService.extractOrCreate(req.headers);

    // Get existing context from main.ts onRequest hook (if any)
    const existingContext = requestContextStorage.getStore();

    if (existingContext) {
        // ✅ CRITICAL FIX: Mutate the existing context object IN-PLACE.
        // tRPC's internal Promise chain captures the ALS store reference BEFORE
        // createContext() is called. Using enterWith(newObject) would create a new
        // store that those pre-scheduled async continuations don't see.
        // By mutating the existing object, all async continuations (including tRPC's)
        // will see the updated fields (userId, organizationId, etc.).
        existingContext.traceId = traceContext.traceId;
        existingContext.spanId = traceContext.spanId;
        existingContext.parentSpanId = traceContext.parentSpanId;
        existingContext.locale = req.headers['accept-language']?.split(',')[0] || 'en-US';
        existingContext.currency = 'USD';
        existingContext.timezone = 'UTC';
        if (userId) existingContext.userId = userId;
        if (organizationId) existingContext.organizationId = organizationId;
        if (userRole) existingContext.userRole = userRole;
        if (currentTeamId) existingContext.currentTeamId = currentTeamId;
        if (userRoles.length > 0) existingContext.userRoles = userRoles;
    } else {
        // No existing context (shouldn't happen in normal flow) — create new
        const requestContext: RequestContext = {
            requestId: randomUUID(),
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
        requestContextStorage.enterWith(requestContext);
    }

    const requestContext = existingContext ?? requestContextStorage.getStore()!;

    console.log('[tRPC Context] Updated AsyncLocalStorage context:', {
        userId: requestContext.userId,
        organizationId: requestContext.organizationId,
        userRole: requestContext.userRole,
        userRoles: requestContext.userRoles,
    });

    // If this is a plugin API call, create full plugin context with capabilities
    if (pluginId) {
        try {
            return buildPluginCallerContext({
                pluginId,
                requestContext,
                req,
                res,
            });
        } catch (error) {
            console.error('[tRPC Context] Plugin services not initialized — setPluginContextServices() not called yet');
            throw error;
        }
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
