import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { getPluginManager } from '../../plugins/plugin.module';
import { db } from '../../db';
import { plugins, pluginInstances } from '@wordrhyme/db';
import { and, eq } from 'drizzle-orm';
import type {
    PluginInstallationStatus as TenantInstallationStatus,
    PluginActivationStatus as TenantActivationStatus,
    PluginStatus as TenantPluginStatus,
    PluginInstanceStatus as PersistedInstanceStatus,
} from '@wordrhyme/db';

/**
 * Custom Zod schemas for non-DB inputs
 */

/** Plugin ID format: vendor.plugin-name (e.g., com.example.analytics) */
export const pluginIdSchema = z.string()
    .min(3, 'Plugin ID must be at least 3 characters')
    .max(128, 'Plugin ID must be at most 128 characters')
    .regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/, 'Plugin ID must be in reverse domain notation (e.g., com.example.plugin)');

/** Input schema for single plugin operations */
export const pluginOperationInput = z.object({
    pluginId: pluginIdSchema,
});

type GlobalPluginStatus = 'enabled' | 'disabled' | 'invalid' | 'crashed';
type InstancePluginStatus = 'not_installed' | 'installed' | 'loaded' | 'failed';
type TenantPluginAccessStatus = 'uninstalled' | 'disabled' | 'enabled';
type EffectivePluginStatus = 'enabled' | 'disabled' | 'unavailable';

function requireOrganization(organizationId: string | undefined): string {
    if (!organizationId) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Organization context is required',
        });
    }

    return organizationId;
}

function resolveEffectiveStatus(
    instanceStatus: InstancePluginStatus,
    installationStatus?: TenantInstallationStatus,
    activationStatus?: TenantActivationStatus,
): EffectivePluginStatus {
    if (instanceStatus !== 'loaded') {
        return 'unavailable';
    }

    if (installationStatus !== 'installed') {
        return 'disabled';
    }

    if (activationStatus === 'enabled') {
        return 'enabled';
    }

    return 'disabled';
}

function resolveRuntimeStatus(pluginStatus: string): GlobalPluginStatus {
    if (
        pluginStatus === 'enabled' ||
        pluginStatus === 'disabled' ||
        pluginStatus === 'invalid' ||
        pluginStatus === 'crashed'
    ) {
        return pluginStatus;
    }

    return 'invalid';
}

function resolveInstanceStatus(
    globalStatus: GlobalPluginStatus,
    persistedStatus?: PersistedInstanceStatus,
): InstancePluginStatus {
    switch (globalStatus) {
        case 'enabled':
            return 'loaded';
        case 'disabled':
            return 'installed';
        case 'invalid':
        case 'crashed':
            return 'failed';
    }

    if (persistedStatus) {
        return persistedStatus;
    }

    return 'not_installed';
}

function ensurePluginManager() {
    const pluginManager = getPluginManager();
    if (!pluginManager) {
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Plugin manager is not available',
        });
    }

    return pluginManager;
}

function getManagedPlugin(pluginId: string) {
    const pluginManager = ensurePluginManager();
    const plugin = pluginManager.getPlugin(pluginId);
    if (!plugin) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Plugin ${pluginId} not found`,
        });
    }

    return { pluginManager, plugin };
}

function assertPluginAvailableForTenant(runtimeStatus: GlobalPluginStatus, pluginId: string): void {
    if (runtimeStatus === 'disabled') {
        throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `Plugin ${pluginId} is not enabled in this instance`,
        });
    }

    if (runtimeStatus === 'invalid' || runtimeStatus === 'crashed') {
        throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `Plugin ${pluginId} is unavailable (${runtimeStatus})`,
        });
    }
}

function assertPluginLoadableInInstance(runtimeStatus: GlobalPluginStatus, pluginId: string): void {
    if (runtimeStatus === 'invalid' || runtimeStatus === 'crashed') {
        throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `Plugin ${pluginId} is unavailable (${runtimeStatus})`,
        });
    }
}

function resolveTenantStatus(
    installationStatus?: TenantInstallationStatus,
    activationStatus?: TenantActivationStatus,
): TenantPluginAccessStatus {
    if (installationStatus !== 'installed') {
        return 'uninstalled';
    }

    if (activationStatus === 'enabled') {
        return 'enabled';
    }

    return 'disabled';
}

function resolveLegacyTenantStatus(
    installationStatus: TenantInstallationStatus,
    activationStatus: TenantActivationStatus,
): TenantPluginStatus {
    if (installationStatus !== 'installed') {
        return 'uninstalled';
    }

    return activationStatus === 'enabled' ? 'enabled' : 'disabled';
}

async function upsertTenantPluginStatus(params: {
    organizationId: string;
    pluginId: string;
    version: string;
    manifest: unknown;
    installationStatus: TenantInstallationStatus;
    activationStatus: TenantActivationStatus;
}): Promise<void> {
    const legacyStatus = resolveLegacyTenantStatus(params.installationStatus, params.activationStatus);
    await db
        .insert(plugins)
        .values({
            organizationId: params.organizationId,
            pluginId: params.pluginId,
            version: params.version,
            installationStatus: params.installationStatus,
            activationStatus: params.activationStatus,
            manifest: params.manifest as any,
            status: legacyStatus,
        })
        .onConflictDoUpdate({
            target: [plugins.organizationId, plugins.pluginId],
            set: {
                version: params.version,
                installationStatus: params.installationStatus,
                activationStatus: params.activationStatus,
                manifest: params.manifest as any,
                status: legacyStatus,
                updatedAt: new Date(),
            },
        });
}

async function getInstanceStatusMap(): Promise<Map<string, PersistedInstanceStatus>> {
    const records = await db
        .select({
            pluginId: pluginInstances.pluginId,
            status: pluginInstances.status,
        })
        .from(pluginInstances);

    return new Map(records.map((record) => [record.pluginId, record.status]));
}

async function getTenantPluginRecord(organizationId: string, pluginId: string) {
    return db
        .select({
            version: plugins.version,
            manifest: plugins.manifest,
        })
        .from(plugins)
        .where(and(
            eq(plugins.organizationId, organizationId),
            eq(plugins.pluginId, pluginId),
        ))
        .limit(1);
}

/**
 * Plugin Management Router
 *
 * Returns loaded plugins from PluginManager (in-memory).
 */
export const pluginRouter = router({
    /**
     * List all loaded plugins (from memory, not DB)
     */
    list: protectedProcedure
        .use(requirePermission('plugin:read:organization'))
        .query(async ({ ctx }) => {
        const pluginManager = getPluginManager();
        if (!pluginManager) {
            return [];
        }

        const instanceStatusMap = await getInstanceStatusMap();
        const organizationId = ctx.organizationId;
        const tenantRecords = organizationId
            ? await db
                .select({
                    pluginId: plugins.pluginId,
                    installationStatus: plugins.installationStatus,
                    activationStatus: plugins.activationStatus,
                })
                .from(plugins)
                .where(eq(plugins.organizationId, organizationId))
            : [];
        const tenantStatusMap = new Map<string, {
            installationStatus: TenantInstallationStatus;
            activationStatus: TenantActivationStatus;
        }>(
            tenantRecords.map((record) => [record.pluginId, {
                installationStatus: record.installationStatus,
                activationStatus: record.activationStatus,
            }]),
        );

        // Return plugins with their manifests for client to use
        return pluginManager.getLoadedPlugins().map((plugin) => {
            const runtimeStatus = resolveRuntimeStatus(plugin.status);
            const persistedInstanceStatus = instanceStatusMap.get(plugin.manifest.pluginId);
            const tenantRecord = tenantStatusMap.get(plugin.manifest.pluginId);
            const instanceStatus = resolveInstanceStatus(runtimeStatus, persistedInstanceStatus);
            const effectiveStatus = resolveEffectiveStatus(
                instanceStatus,
                tenantRecord?.installationStatus,
                tenantRecord?.activationStatus,
            );

            return {
                pluginId: plugin.manifest.pluginId,
                manifest: plugin.manifest,
                error: plugin.error,
                runtimeStatus,
                instanceStatus,
                installationStatus: tenantRecord?.installationStatus ?? 'uninstalled',
                activationStatus: tenantRecord?.activationStatus ?? 'disabled',
                tenantStatus: resolveTenantStatus(
                    tenantRecord?.installationStatus,
                    tenantRecord?.activationStatus,
                ),
                effectiveStatus,
                // Backward compatibility for older clients
                status: effectiveStatus,
            };
        });
        }),

    /**
     * Get plugin info by ID
     */
    getInfo: protectedProcedure
        .use(requirePermission('plugin:read:organization'))
        .input(pluginOperationInput)
        .query(async ({ ctx, input }) => {
            const pluginManager = getPluginManager();
            if (!pluginManager) {
                return null;
            }

            const plugin = pluginManager.getPlugin(input.pluginId);
            if (!plugin) {
                return null;
            }

            const instanceRecord = await db
                .select({ status: pluginInstances.status })
                .from(pluginInstances)
                .where(eq(pluginInstances.pluginId, input.pluginId))
                .limit(1);
            const tenantRecord = ctx.organizationId
                ? await db
                    .select({
                        installationStatus: plugins.installationStatus,
                        activationStatus: plugins.activationStatus,
                    })
                    .from(plugins)
                    .where(and(
                        eq(plugins.organizationId, ctx.organizationId),
                        eq(plugins.pluginId, input.pluginId),
                    ))
                    .limit(1)
                : [];

            const runtimeStatus = resolveRuntimeStatus(plugin.status);
            const instanceStatus = resolveInstanceStatus(runtimeStatus, instanceRecord[0]?.status);
            const installationStatus = tenantRecord[0]?.installationStatus;
            const activationStatus = tenantRecord[0]?.activationStatus;
            const effectiveStatus = resolveEffectiveStatus(
                instanceStatus,
                installationStatus,
                activationStatus,
            );

            return {
                pluginId: plugin.manifest.pluginId,
                manifest: plugin.manifest,
                error: plugin.error,
                runtimeStatus,
                instanceStatus,
                installationStatus: installationStatus ?? 'uninstalled',
                activationStatus: activationStatus ?? 'disabled',
                tenantStatus: resolveTenantStatus(installationStatus, activationStatus),
                effectiveStatus,
                status: effectiveStatus,
            };
        }),

    /**
     * Enable a plugin in the current deployment instance.
     *
     * Current scope: only manages already discovered local plugins.
     * Remote marketplace download/install is a separate concern.
     */
    enableInInstance: protectedProcedure
        .use(requirePermission('plugin:install:organization'))
        .input(pluginOperationInput)
        .mutation(async ({ input }) => {
            const { pluginManager, plugin } = getManagedPlugin(input.pluginId);

            assertPluginLoadableInInstance(resolveRuntimeStatus(plugin.status), input.pluginId);

            await pluginManager.enablePlugin(input.pluginId);

            return {
                success: true,
                instanceStatus: 'loaded' as const,
            };
        }),

    /**
     * Disable a plugin in the current deployment instance.
     */
    disableInInstance: protectedProcedure
        .use(requirePermission('plugin:uninstall:organization'))
        .input(pluginOperationInput)
        .mutation(async ({ input }) => {
            const { pluginManager } = getManagedPlugin(input.pluginId);
            await pluginManager.disablePlugin(input.pluginId);

            return {
                success: true,
                instanceStatus: 'installed' as const,
            };
        }),

    /**
     * Install a plugin for the current tenant.
     */
    installForTenant: protectedProcedure
        .use(requirePermission('plugin:install:organization'))
        .input(pluginOperationInput)
        .mutation(async ({ ctx, input }) => {
            const organizationId = requireOrganization(ctx.organizationId);
            const { pluginManager, plugin } = getManagedPlugin(input.pluginId);

            assertPluginAvailableForTenant(resolveRuntimeStatus(plugin.status), input.pluginId);

            await upsertTenantPluginStatus({
                organizationId,
                pluginId: input.pluginId,
                version: plugin.manifest.version,
                manifest: plugin.manifest,
                installationStatus: 'installed',
                activationStatus: 'enabled',
            });

            // Register plugin menus for this tenant
            await pluginManager.installForTenant(input.pluginId, organizationId);

            return {
                success: true,
                installationStatus: 'installed' as const,
                activationStatus: 'enabled' as const,
                effectiveStatus: 'enabled' as const,
            };
        }),

    /**
     * Uninstall a plugin for the current tenant.
     */
    uninstallForTenant: protectedProcedure
        .use(requirePermission('plugin:uninstall:organization'))
        .input(pluginOperationInput)
        .mutation(async ({ ctx, input }) => {
            const organizationId = requireOrganization(ctx.organizationId);
            const pluginManager = ensurePluginManager();
            const plugin = pluginManager.getPlugin(input.pluginId);

            // Unregister plugin menus for this tenant
            await pluginManager.uninstallForTenant(input.pluginId, organizationId);

            if (plugin) {
                await upsertTenantPluginStatus({
                    organizationId,
                    pluginId: input.pluginId,
                    version: plugin.manifest.version,
                    manifest: plugin.manifest,
                    installationStatus: 'uninstalled',
                    activationStatus: 'disabled',
                });
            } else {
                const existing = await getTenantPluginRecord(organizationId, input.pluginId);
                const record = existing[0];
                if (record) {
                    await upsertTenantPluginStatus({
                        organizationId,
                        pluginId: input.pluginId,
                        version: record.version,
                        manifest: record.manifest,
                        installationStatus: 'uninstalled',
                        activationStatus: 'disabled',
                    });
                }
            }

            return {
                success: true,
                installationStatus: 'uninstalled' as const,
                activationStatus: 'disabled' as const,
                effectiveStatus: 'disabled' as const,
            };
        }),

    /**
     * Enable a plugin for the current tenant
     */
    enableForTenant: protectedProcedure
        .use(requirePermission('plugin:enable:organization'))
        .input(pluginOperationInput)
        .mutation(async ({ ctx, input }) => {
            const organizationId = requireOrganization(ctx.organizationId);
            const { pluginManager, plugin } = getManagedPlugin(input.pluginId);

            assertPluginAvailableForTenant(resolveRuntimeStatus(plugin.status), input.pluginId);

            await upsertTenantPluginStatus({
                organizationId,
                pluginId: input.pluginId,
                version: plugin.manifest.version,
                manifest: plugin.manifest,
                installationStatus: 'installed',
                activationStatus: 'enabled',
            });

            // Reconcile and show plugin menus for this tenant
            await pluginManager.enableForTenant(input.pluginId, organizationId);

            return {
                success: true,
                installationStatus: 'installed' as const,
                activationStatus: 'enabled' as const,
                tenantStatus: 'enabled' as const,
                effectiveStatus: 'enabled' as const,
            };
        }),

    /**
     * Disable a plugin for the current tenant
     */
    disableForTenant: protectedProcedure
        .use(requirePermission('plugin:disable:organization'))
        .input(pluginOperationInput)
        .mutation(async ({ ctx, input }) => {
            const organizationId = requireOrganization(ctx.organizationId);
            const { pluginManager, plugin } = getManagedPlugin(input.pluginId);

            // Hide plugin menus for this tenant (preserve records)
            await pluginManager.disableForTenant(input.pluginId, organizationId);

            await upsertTenantPluginStatus({
                organizationId,
                pluginId: input.pluginId,
                version: plugin.manifest.version,
                manifest: plugin.manifest,
                installationStatus: 'installed',
                activationStatus: 'disabled',
            });

            return {
                success: true,
                installationStatus: 'installed' as const,
                activationStatus: 'disabled' as const,
                tenantStatus: 'disabled' as const,
                effectiveStatus: 'disabled' as const,
            };
        }),

    // Backward compatibility aliases
    enable: protectedProcedure
        .use(requirePermission('plugin:enable:organization'))
        .input(pluginOperationInput)
        .mutation(async ({ ctx, input }) => {
            const organizationId = requireOrganization(ctx.organizationId);
            const { pluginManager, plugin } = getManagedPlugin(input.pluginId);

            assertPluginAvailableForTenant(resolveRuntimeStatus(plugin.status), input.pluginId);

            await upsertTenantPluginStatus({
                organizationId,
                pluginId: input.pluginId,
                version: plugin.manifest.version,
                manifest: plugin.manifest,
                installationStatus: 'installed',
                activationStatus: 'enabled',
            });

            // Reconcile and show plugin menus for this tenant
            await pluginManager.enableForTenant(input.pluginId, organizationId);

            return {
                success: true,
                tenantStatus: 'enabled' as const,
                effectiveStatus: 'enabled' as const,
            };
        }),

    disable: protectedProcedure
        .use(requirePermission('plugin:disable:organization'))
        .input(pluginOperationInput)
        .mutation(async ({ ctx, input }) => {
            const organizationId = requireOrganization(ctx.organizationId);
            const { pluginManager, plugin } = getManagedPlugin(input.pluginId);

            // Hide plugin menus for this tenant (preserve records)
            await pluginManager.disableForTenant(input.pluginId, organizationId);

            await upsertTenantPluginStatus({
                organizationId,
                pluginId: input.pluginId,
                version: plugin.manifest.version,
                manifest: plugin.manifest,
                installationStatus: 'installed',
                activationStatus: 'disabled',
            });

            return {
                success: true,
                tenantStatus: 'disabled' as const,
                effectiveStatus: 'disabled' as const,
            };
        }),
});
