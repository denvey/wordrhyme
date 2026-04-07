import { requestContextStorage } from '../../context/async-local-storage';

/**
 * Create and manage capabilities for plugins.
 * Capabilities are injected in fixed order: Logger → Permission → Data → Settings → Media → Metrics → Trace
 */
import type { PluginContext, PluginManifest, PluginUsageCapability } from '@wordrhyme/plugin';
import { createPluginLogger } from './logger.capability';
import { createPluginPermissionCapability } from './permission.capability';
import { createPluginDataCapability } from './data.capability';
import { createPluginSettingsCapability } from './settings.capability';
import { createPluginMediaCapability } from './media.capability';
import { createPluginMetrics } from './metrics.capability';
import { createPluginTrace } from './trace.capability';
import { createPluginStorageCapability } from './storage.capability';
import { createHookCapability } from './hook.capability';
import type { SettingsService } from '../../settings/settings.service';
import type { FeatureFlagService } from '../../settings/feature-flag.service';
import type { PermissionKernel } from '../../permission/permission-kernel';
import type { PermissionContext } from '../../permission/permission.types';
import type { StorageProviderRegistry } from '../../file-storage/storage-provider.registry';
import type { MediaService } from '../../media/media.service';
import type { HookRegistry } from '../../hooks/hook-registry';
import type { HookExecutor } from '../../hooks/hook-executor';
import { getBillingContext } from '../../billing/billing-context';

/**
 * Create a full PluginContext with all capabilities
 */
export function createCapabilitiesForPlugin(
    pluginId: string,
    manifest: PluginManifest,
    requestContext?: {
        organizationId?: string;
        userId?: string;
        requestId?: string;
        userRole?: string;
        userRoles?: string[];
        currentTeamId?: string;
    },
    services?: {
        settingsService?: SettingsService | undefined;
        featureFlagService?: FeatureFlagService | undefined;
        permissionKernel?: PermissionKernel | undefined;
        storageProviderRegistry?: StorageProviderRegistry | undefined;
        mediaService?: MediaService | undefined;
        hookRegistry?: HookRegistry | undefined;
        hookExecutor?: HookExecutor | undefined;
    }
): PluginContext {
    const organizationId = requestContext?.organizationId;

    // 1. Logger Capability (always available)
    const logger = createPluginLogger(pluginId, organizationId);

    // 2. Permission Capability (always available)
    // Build PermissionContext for CASL evaluation
    const permissionContext: PermissionContext = {
        requestId: requestContext?.requestId ?? 'unknown',
        userId: requestContext?.userId,
        organizationId,
        userRole: requestContext?.userRole,
        userRoles: requestContext?.userRoles,
        currentTeamId: requestContext?.currentTeamId,
    };
    const kernel = services?.permissionKernel!;
    const permissions = createPluginPermissionCapability(pluginId, manifest, kernel, permissionContext);

    // 3. Database Capability (available if plugin has db capabilities declared)
    const hasDbCapability = manifest.capabilities?.data !== undefined;
    const db = hasDbCapability
        ? createPluginDataCapability(pluginId, organizationId, requestContext?.userId)
        : undefined;

    // 4. Settings Capability (requires services to be injected)
    // If services not provided, create a stub that throws on use
    const settings = services?.settingsService && services?.featureFlagService
        ? createPluginSettingsCapability(
            pluginId,
            organizationId,
            services.settingsService,
            services.featureFlagService,
            manifest,
        )
        : createSettingsCapabilityStub();

    // 5. Media Capability (available if mediaService is injected)
    const media = services?.mediaService
        ? createPluginMediaCapability(pluginId, organizationId, services.mediaService)
        : undefined;

    // 6. Metrics Capability (available if organizationId is provided)
    const metrics = organizationId ? createPluginMetrics(pluginId, organizationId) : undefined;

    // 7. Trace Capability (always available)
    const trace = createPluginTrace(pluginId);

    // 8. Storage Capability (available if plugin declares storage.provider and registry is injected)
    const hasStorageCapability = manifest.capabilities?.storage?.provider === true;
    const storage = (hasStorageCapability && services?.storageProviderRegistry)
        ? createPluginStorageCapability(pluginId, manifest, services.storageProviderRegistry)
        : undefined;

    // 9. Usage Capability (for explicit billing consumption in dynamic scenarios)
    const usage = createPluginUsageCapability(organizationId, requestContext?.userId);

    // 10. Hook Capability (available if hookRegistry is injected)
    const hooks = services?.hookRegistry
        ? createHookCapability(
            pluginId,
            organizationId,
            services.hookRegistry,
            services.hookExecutor,
            createTrpcCallerFactory()
          )
        : undefined;

    return {
        pluginId,
        organizationId,
        userId: requestContext?.userId,
        logger,
        permissions,
        db,
        settings,
        media,
        storage,
        metrics,
        trace,
        usage,
        hooks,
    };
}

/**
 * Create a stub settings capability that throws when used
 * Used when services are not injected (e.g., during plugin loading)
 */
function createSettingsCapabilityStub(): PluginContext['settings'] {
    const notAvailable = () => {
        throw new Error('Settings capability not available in this context');
    };

    return {
        get: notAvailable,
        set: notAvailable,
        delete: notAvailable,
        list: notAvailable,
        isFeatureEnabled: notAvailable,
    };
}

/**
 * Create usage capability for explicit billing consumption.
 *
 * Plugins can use ctx.usage.consume(subject, amount) for dynamic billing
 * scenarios where the middleware's automatic per-procedure billing is insufficient
 * (e.g., variable-cost operations like image generation with different resolutions).
 *
 * Returns undefined if org/user context is missing (non-request contexts).
 */
function createPluginUsageCapability(
    organizationId: string | undefined,
    userId: string | undefined,
): PluginUsageCapability | undefined {
    if (!organizationId) return undefined;

    return {
        async consume(subject: string, amount = 1): Promise<void> {
            const { entitlementService } = getBillingContext();
            await entitlementService.requireAndConsume(
                organizationId,
                userId ?? 'system',
                subject,
                amount,
            );
        },
    };
}

/**
 * Create a tRPC caller factory for hook-to-tRPC auto-mapping.
 *
 * When `hooks.emit('crm.customers.create', data)` has no registered handlers,
 * this factory parses the hookId and calls the corresponding tRPC procedure.
 *
 * Uses lazy import of getAppRouter to avoid circular dependencies
 * (context.ts → capabilities/index.ts → router.ts → context.ts).
 */
function createTrpcCallerFactory(): (hookId: string, data: unknown) => Promise<unknown> {
    // Lazy reference — resolved on first call
    let _getAppRouter: (() => any) | undefined;
    let _resolvePluginId: ((normalizedId: string) => string | undefined) | undefined;
    let _buildPluginCallerContext:
        | ((params: { pluginId: string; requestContext: any }) => any)
        | undefined;

    return async (hookId: string, data: unknown): Promise<unknown> => {
        // Parse hookId: 'crm.customers.create' → pluginId='crm', pathParts=['customers', 'create']
        const parts = hookId.split('.');
        if (parts.length < 2) return data;

        const [targetPluginId, ...pathParts] = parts;
        if (!targetPluginId) return data;

        // Lazy import to avoid circular dependency
        if (!_getAppRouter) {
            const routerModule = await import('../../trpc/router');
            _getAppRouter = routerModule.getAppRouter;
            _resolvePluginId = routerModule.resolvePluginId;
        }
        if (!_buildPluginCallerContext) {
            const contextModule = await import('../../trpc/context');
            _buildPluginCallerContext = contextModule.buildPluginCallerContext;
        }

        const appRouter = _getAppRouter();
        if (!appRouter || !_resolvePluginId || !_buildPluginCallerContext) return data;

        const originalPluginId = _resolvePluginId(targetPluginId);
        if (!originalPluginId) {
            const error = new Error(`Plugin route target '${targetPluginId}' is not registered`);
            (error as Error & { code?: string }).code = 'HOOK_TRPC_ROUTE_NOT_FOUND';
            throw error;
        }

        const store = requestContextStorage.getStore();
        const ctx = _buildPluginCallerContext({
            pluginId: originalPluginId,
            requestContext: {
                requestId: store?.requestId ?? 'internal',
                locale: store?.locale ?? 'en-US',
                currency: store?.currency ?? 'USD',
                timezone: store?.timezone ?? 'UTC',
                ...(store?.organizationId ? { organizationId: store.organizationId } : {}),
                ...(store?.originalOrganizationId ? { originalOrganizationId: store.originalOrganizationId } : {}),
                ...(store?.userId ? { userId: store.userId } : {}),
                ...(store?.userRole ? { userRole: store.userRole } : {}),
                ...(store?.userRoles ? { userRoles: store.userRoles } : {}),
                ...(store?.currentTeamId ? { currentTeamId: store.currentTeamId } : {}),
                ...(store?.teamIds ? { teamIds: store.teamIds } : {}),
                ...(store?.ip ? { ip: store.ip } : {}),
                ...(store?.userAgent ? { userAgent: store.userAgent } : {}),
                ...(store?.traceId ? { traceId: store.traceId } : {}),
                ...(store?.spanId ? { spanId: store.spanId } : {}),
                ...(store?.parentSpanId ? { parentSpanId: store.parentSpanId } : {}),
                ...(store?.sessionId ? { sessionId: store.sessionId } : {}),
                ...(store?.actorType ? { actorType: store.actorType } : {}),
                ...(store?.apiTokenId ? { apiTokenId: store.apiTokenId } : {}),
                ...(store?.permissionMeta ? { permissionMeta: store.permissionMeta } : {}),
                ...(store?.isSystemContext !== undefined ? { isSystemContext: store.isSystemContext } : {}),
            },
        });

        // Create tRPC caller
        const caller = appRouter.createCaller(ctx);

        // Navigate router tree: caller.pluginApis.{targetPluginId}.{path...}
        let current: any = caller?.pluginApis;
        if (!current) {
            const error = new Error('pluginApis router is not available');
            (error as Error & { code?: string }).code = 'HOOK_TRPC_ROUTE_NOT_FOUND';
            throw error;
        }

        current = current[targetPluginId!];
        if (!current) {
            const error = new Error(`Plugin route target '${targetPluginId}' is not available`);
            (error as Error & { code?: string }).code = 'HOOK_TRPC_ROUTE_NOT_FOUND';
            throw error;
        }

        // Navigate nested path: ['customers', 'create'] → current.customers.create
        for (let i = 0; i < pathParts.length - 1; i++) {
            current = current[pathParts[i]!];
            if (!current) {
                const error = new Error(`Hook route '${hookId}' was not found`);
                (error as Error & { code?: string }).code = 'HOOK_TRPC_ROUTE_NOT_FOUND';
                throw error;
            }
        }

        const method = pathParts[pathParts.length - 1];
        if (method && typeof current[method] === 'function') {
            return current[method](data);
        }

        const error = new Error(`Hook route '${hookId}' was not found`);
        (error as Error & { code?: string }).code = 'HOOK_TRPC_ROUTE_NOT_FOUND';
        throw error;
    };
}

/**
 * Re-export capability creators for direct use
 */
export { createPluginLogger } from './logger.capability';
export { createPluginPermissionCapability, PermissionDeniedError } from './permission.capability';
export { createPluginDataCapability } from './data.capability';
export { createPluginSettingsCapability } from './settings.capability';
export { createPluginMediaCapability } from './media.capability';
export { createPluginMetrics } from './metrics.capability';
export { createPluginTrace } from './trace.capability';
