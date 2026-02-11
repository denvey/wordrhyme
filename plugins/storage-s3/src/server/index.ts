/**
 * S3 Storage Plugin - Server Entry Point
 *
 * Multi-instance S3-compatible storage provider supporting:
 * - AWS S3
 * - Cloudflare R2
 * - MinIO
 * - Any S3-compatible object storage
 *
 * Each configured instance is registered as a separate storage provider
 * with its providerId as the type.
 */
import type { PluginContext } from '@wordrhyme/plugin';
import { S3StorageProvider, type S3ProviderConfig } from './s3-storage.provider.js';

// Store registered provider IDs for cleanup
let registeredProviderIds: string[] = [];

// Plugin context reference for refresh
let pluginCtx: PluginContext | null = null;

/**
 * Get all stored instances from settings
 */
async function getStoredInstances(ctx: PluginContext): Promise<Array<{
    providerId: string;
    displayName: string;
    preset: string;
    endpoint?: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicUrlBase?: string;
    forcePathStyle: boolean;
    status: string;
}>> {
    const data = await ctx.settings.get<any[]>('instances');
    return data || [];
}

/**
 * Register all configured S3 instances as storage providers
 */
async function registerProviders(ctx: PluginContext): Promise<void> {
    const { logger, storage } = ctx;

    if (!storage) {
        logger.error('Storage capability not available');
        return;
    }

    const instances = await getStoredInstances(ctx);

    if (instances.length === 0) {
        logger.info('No S3 instances configured');
        return;
    }

    for (const instance of instances) {
        if (!instance.secretAccessKey) {
            logger.warn(`S3 instance ${instance.providerId} missing secret key, skipping`);
            continue;
        }

        try {
            await storage.registerProvider({
                type: instance.providerId,
                name: instance.displayName,
                description: `S3-compatible storage: ${instance.displayName}`,
                configSchema: {
                    type: 'object',
                    properties: {},
                },
                factory: () => {
                    const config: S3ProviderConfig = {
                        region: instance.region,
                        bucket: instance.bucket,
                        accessKeyId: instance.accessKeyId,
                        secretAccessKey: instance.secretAccessKey,
                        forcePathStyle: instance.forcePathStyle,
                    };
                    if (instance.endpoint) {
                        config.endpoint = instance.endpoint;
                    }
                    if (instance.publicUrlBase) {
                        config.publicUrlBase = instance.publicUrlBase;
                    }
                    return new S3StorageProvider(config);
                },
            });

            registeredProviderIds.push(instance.providerId);

            logger.info('S3 provider registered', {
                providerId: instance.providerId,
                bucket: instance.bucket,
                region: instance.region,
            });
        } catch (error) {
            logger.error('Failed to register S3 provider', {
                providerId: instance.providerId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
}

/**
 * Unregister all S3 storage providers
 */
async function unregisterProviders(ctx: PluginContext): Promise<void> {
    const { logger, storage } = ctx;

    if (!storage) {
        return;
    }

    for (const providerId of registeredProviderIds) {
        try {
            await storage.unregisterProvider(providerId);
            logger.info('S3 provider unregistered', { providerId });
        } catch (error) {
            logger.error('Failed to unregister S3 provider', {
                providerId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    registeredProviderIds = [];
}

/**
 * Refresh storage providers (called after config change)
 * Auto-refresh on save - no restart required
 */
export async function refreshStorageProviders(ctx: PluginContext): Promise<void> {
    ctx.logger.info('Refreshing S3 storage providers');
    await unregisterProviders(ctx);
    await registerProviders(ctx);
}

/**
 * Lifecycle: onEnable
 *
 * Called when the plugin is enabled.
 * Registers all configured S3 instances as storage providers.
 */
export async function onEnable(ctx: PluginContext): Promise<void> {
    ctx.logger.info('Enabling S3 Storage plugin');
    pluginCtx = ctx;

    await registerProviders(ctx);

    ctx.logger.info('S3 Storage plugin enabled', {
        instanceCount: registeredProviderIds.length,
    });
}

/**
 * Lifecycle: onDisable
 *
 * Called when the plugin is disabled.
 * Unregisters all S3 storage providers.
 */
export async function onDisable(ctx: PluginContext): Promise<void> {
    ctx.logger.info('Disabling S3 Storage plugin');

    await unregisterProviders(ctx);
    pluginCtx = null;

    ctx.logger.info('S3 Storage plugin disabled');
}

// Export router for tRPC integration
export { router } from './router.js';
export type { StorageS3Router } from './router.js';

// Export provider for direct use if needed
export { S3StorageProvider } from './s3-storage.provider.js';
export type { S3ProviderConfig } from './s3-storage.provider.js';
