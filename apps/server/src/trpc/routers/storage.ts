/**
 * Storage Router
 *
 * Hybrid storage configuration:
 * - Platform level: Default provider + tenant override toggle
 * - Tenant level: Override provider (only when platform allows)
 *
 * Cascade: explicit type > tenant override (if allowed) > platform default > 'local'
 */
import { z } from 'zod';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { TRPCError } from '@trpc/server';
import type { SettingsService } from '../../settings/settings.service';
import type { StorageProviderRegistry } from '../../file-storage/storage-provider.registry';

// Injected dependencies - will be set by module initialization
let settingsService: SettingsService | null = null;
let providerRegistry: StorageProviderRegistry | null = null;

/**
 * Set settings service instance (for DI)
 */
export function setSettingsService(service: SettingsService): void {
    settingsService = service;
}

/**
 * Set provider registry instance (for DI)
 */
export function setProviderRegistry(registry: StorageProviderRegistry): void {
    providerRegistry = registry;
}

function getSettingsService(): SettingsService {
    if (!settingsService) {
        throw new Error('SettingsService not initialized');
    }
    return settingsService;
}

function getProviderRegistry(): StorageProviderRegistry {
    if (!providerRegistry) {
        throw new Error('StorageProviderRegistry not initialized');
    }
    return providerRegistry;
}

/**
 * Storage settings keys
 */
const STORAGE_KEYS = {
    /** Platform-level default provider (scope: global, no orgId) */
    PLATFORM_DEFAULT: 'storage.platform.defaultProvider',
    /** Whether tenants can override storage provider (scope: global, no orgId) */
    ALLOW_TENANT_OVERRIDE: 'storage.platform.allowTenantOverride',
    /** Tenant-level provider override (scope: tenant, with orgId) */
    TENANT_PROVIDER: 'storage.tenant.provider',
} as const;

/**
 * Storage provider info returned by API
 */
export interface StorageProviderInfo {
    providerId: string;
    displayName: string;
    pluginId: string | null;
    status: 'ready' | 'healthy' | 'error' | 'unconfigured';
    supportsTest: boolean;
}

/**
 * Platform storage config returned by API
 */
export interface PlatformStorageConfig {
    defaultProvider: string;
    allowTenantOverride: boolean;
    providers: StorageProviderInfo[];
}

/**
 * Tenant storage config returned by API
 */
export interface TenantStorageConfig {
    /** The resolved effective provider for this tenant */
    effectiveProvider: string;
    /** Platform default (always shown) */
    platformDefault: string;
    /** Tenant override value (null if using platform default) */
    tenantOverride: string | null;
    /** Whether tenant override is allowed */
    allowOverride: boolean;
    /** Available providers */
    providers: StorageProviderInfo[];
}

/**
 * Helper: get providers list
 */
function listAllProviders(): StorageProviderInfo[] {
    const registry = getProviderRegistry();
    const providers = registry.list();

    return providers.map((meta) => ({
        providerId: meta.type,
        displayName: meta.displayName,
        pluginId: meta.pluginId === 'core' ? null : meta.pluginId,
        status: 'ready' as const,
        supportsTest: meta.pluginId !== 'core',
    }));
}

/**
 * Storage Router
 */
export const storageRouter = router({
    /**
     * List all registered storage providers
     */
    listProviders: protectedProcedure
        .use(requirePermission('storage:read'))
        .query(async (): Promise<StorageProviderInfo[]> => {
            return listAllProviders();
        }),

    // ──────────────────────────────────────────────
    // Platform-level endpoints (require platform admin)
    // ──────────────────────────────────────────────

    /**
     * Get platform storage config (platform admin only)
     */
    getPlatformConfig: protectedProcedure
        .use(requirePermission('platform:storage:read'))
        .query(async (): Promise<PlatformStorageConfig> => {
            const settings = getSettingsService();

            const defaultProvider = await settings.get(
                'global',
                STORAGE_KEYS.PLATFORM_DEFAULT,
                {}
            ) as string | null;

            const allowOverride = await settings.get(
                'global',
                STORAGE_KEYS.ALLOW_TENANT_OVERRIDE,
                {}
            ) as boolean | null;

            return {
                defaultProvider: defaultProvider || 'local',
                allowTenantOverride: allowOverride ?? false,
                providers: listAllProviders(),
            };
        }),

    /**
     * Set platform default provider (platform admin only)
     */
    setPlatformDefault: protectedProcedure
        .input(z.object({
            providerId: z.string().min(1),
        }))
        .use(requirePermission('platform:storage:manage'))
        .mutation(async ({ input }): Promise<{ success: boolean }> => {
            const registry = getProviderRegistry();
            const settings = getSettingsService();

            // Validate provider exists
            if (!registry.has(input.providerId)) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: `Storage provider not found: ${input.providerId}`,
                });
            }

            await settings.set(
                'global',
                STORAGE_KEYS.PLATFORM_DEFAULT,
                input.providerId,
                {}
            );

            return { success: true };
        }),

    /**
     * Set tenant override toggle (platform admin only)
     */
    setAllowTenantOverride: protectedProcedure
        .input(z.object({
            allow: z.boolean(),
        }))
        .use(requirePermission('platform:storage:manage'))
        .mutation(async ({ input }): Promise<{ success: boolean }> => {
            const settings = getSettingsService();

            await settings.set(
                'global',
                STORAGE_KEYS.ALLOW_TENANT_OVERRIDE,
                input.allow,
                {}
            );

            return { success: true };
        }),

    // ──────────────────────────────────────────────
    // Tenant-level endpoints
    // ──────────────────────────────────────────────

    /**
     * Get tenant storage config (for org Settings > Storage tab)
     */
    getTenantConfig: protectedProcedure
        .use(requirePermission('storage:read'))
        .query(async ({ ctx }): Promise<TenantStorageConfig> => {
            const settings = getSettingsService();

            // Read platform config
            const platformDefault = await settings.get(
                'global',
                STORAGE_KEYS.PLATFORM_DEFAULT,
                {}
            ) as string | null;

            const allowOverride = await settings.get(
                'global',
                STORAGE_KEYS.ALLOW_TENANT_OVERRIDE,
                {}
            ) as boolean | null;

            // Read tenant override
            const tenantOverride = await settings.get(
                'tenant',
                STORAGE_KEYS.TENANT_PROVIDER,
                { organizationId: ctx.organizationId }
            ) as string | null;

            const effectiveDefault = platformDefault || 'local';
            const canOverride = allowOverride ?? false;

            // Effective provider: tenant override (if allowed and set) > platform default
            const effectiveProvider = (canOverride && tenantOverride)
                ? tenantOverride
                : effectiveDefault;

            return {
                effectiveProvider,
                platformDefault: effectiveDefault,
                tenantOverride: (canOverride && tenantOverride) ? tenantOverride : null,
                allowOverride: canOverride,
                providers: listAllProviders(),
            };
        }),

    /**
     * Set tenant storage provider override
     */
    setTenantProvider: protectedProcedure
        .input(z.object({
            /** Provider ID, or null to reset to platform default */
            providerId: z.string().min(1).nullable(),
        }))
        .use(requirePermission('storage:manage'))
        .mutation(async ({ input, ctx }): Promise<{ success: boolean }> => {
            const settings = getSettingsService();

            // Check if tenant override is allowed
            const allowOverride = await settings.get(
                'global',
                STORAGE_KEYS.ALLOW_TENANT_OVERRIDE,
                {}
            ) as boolean | null;

            if (!(allowOverride ?? false)) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Tenant storage override is not allowed by platform configuration',
                });
            }

            if (input.providerId === null) {
                // Reset to platform default - delete tenant setting
                await settings.delete('tenant', STORAGE_KEYS.TENANT_PROVIDER, {
                    organizationId: ctx.organizationId,
                });
            } else {
                // Validate provider exists
                const registry = getProviderRegistry();
                if (!registry.has(input.providerId)) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: `Storage provider not found: ${input.providerId}`,
                    });
                }

                await settings.set(
                    'tenant',
                    STORAGE_KEYS.TENANT_PROVIDER,
                    input.providerId,
                    { organizationId: ctx.organizationId }
                );
            }

            return { success: true };
        }),

    // ──────────────────────────────────────────────
    // Legacy endpoints (backward compatibility)
    // ──────────────────────────────────────────────

    /**
     * Get the effective default storage provider for current tenant
     * (Used by upload dialog and other components)
     */
    getDefaultProvider: protectedProcedure
        .use(requirePermission('storage:read'))
        .query(async ({ ctx }): Promise<{ providerId: string }> => {
            const settings = getSettingsService();

            // Check tenant override first (if allowed)
            const allowOverride = await settings.get(
                'global',
                STORAGE_KEYS.ALLOW_TENANT_OVERRIDE,
                {}
            ) as boolean | null;

            if (allowOverride) {
                const tenantProvider = await settings.get(
                    'tenant',
                    STORAGE_KEYS.TENANT_PROVIDER,
                    { organizationId: ctx.organizationId }
                ) as string | null;

                if (tenantProvider) {
                    return { providerId: tenantProvider };
                }
            }

            // Fall back to platform default
            const platformDefault = await settings.get(
                'global',
                STORAGE_KEYS.PLATFORM_DEFAULT,
                {}
            ) as string | null;

            return {
                providerId: platformDefault || 'local',
            };
        }),

    /**
     * Set the default storage provider (legacy - now maps to appropriate scope)
     */
    setDefaultProvider: protectedProcedure
        .input(z.object({
            providerId: z.string().min(1),
        }))
        .use(requirePermission('storage:manage'))
        .mutation(async ({ input, ctx }): Promise<{ success: boolean }> => {
            const registry = getProviderRegistry();
            const settings = getSettingsService();

            // Validate provider exists
            if (!registry.has(input.providerId)) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: `Storage provider not found: ${input.providerId}`,
                });
            }

            // Check if tenant override is allowed
            const allowOverride = await settings.get(
                'global',
                STORAGE_KEYS.ALLOW_TENANT_OVERRIDE,
                {}
            ) as boolean | null;

            if (allowOverride) {
                // Set as tenant override
                await settings.set(
                    'tenant',
                    STORAGE_KEYS.TENANT_PROVIDER,
                    input.providerId,
                    { organizationId: ctx.organizationId }
                );
            } else {
                // If override not allowed, this should only work for platform admin
                // For now, just set platform default
                await settings.set(
                    'global',
                    STORAGE_KEYS.PLATFORM_DEFAULT,
                    input.providerId,
                    {}
                );
            }

            return { success: true };
        }),
});
