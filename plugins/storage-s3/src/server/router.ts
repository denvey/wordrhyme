/**
 * S3 Storage Plugin - Server tRPC Router
 *
 * Provides admin endpoints for:
 * - Listing configured S3 instances
 * - Saving/deleting instances
 * - Testing connections
 */
import { pluginRouter, pluginProcedure, type PluginContext } from '@wordrhyme/plugin';
import { z } from 'zod';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

const SETTINGS_KEY = 'instances';
const PROVIDER_ID_REGEX = /^[a-z0-9-]{3,64}$/;

/**
 * S3 Instance schema for validation
 */
const s3InstanceSchema = z.object({
    providerId: z.string().regex(PROVIDER_ID_REGEX, 'Must be 3-64 chars, lowercase letters, numbers, and hyphens'),
    displayName: z.string().min(1).max(100),
    preset: z.enum(['aws', 'r2', 'minio', 'custom']),
    endpoint: z.string().url().optional().or(z.literal('')),
    region: z.string().min(1),
    bucket: z.string().min(1),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().optional(),
    publicUrlBase: z.string().url().optional().or(z.literal('')),
    forcePathStyle: z.boolean().default(false),
});

/**
 * Stored instance format (with status tracking)
 */
export interface StoredS3Instance {
    providerId: string;
    displayName: string;
    preset: 'aws' | 'r2' | 'minio' | 'custom';
    endpoint: string | undefined;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicUrlBase: string | undefined;
    forcePathStyle: boolean;
    status: 'unconfigured' | 'healthy' | 'error';
    lastTestedAt: string | undefined;
    lastError: string | undefined;
}

/**
 * Get all stored instances
 */
async function getStoredInstances(ctx: PluginContext): Promise<StoredS3Instance[]> {
    const data = await ctx.settings.get<StoredS3Instance[]>(SETTINGS_KEY);
    return data || [];
}

/**
 * Save all instances
 */
async function saveStoredInstances(ctx: PluginContext, instances: StoredS3Instance[]): Promise<void> {
    await ctx.settings.set(SETTINGS_KEY, instances, { global: true });
}

/**
 * Test S3 connection
 */
async function testS3Connection(config: {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
}): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const clientConfig: any = {
        region: config.region,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
        forcePathStyle: config.forcePathStyle,
    };

    if (config.endpoint) {
        clientConfig.endpoint = config.endpoint;
    }

    const client = new S3Client(clientConfig);
    const start = Date.now();

    try {
        await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
        return { ok: true, latencyMs: Date.now() - start };
    } catch (error: any) {
        return {
            ok: false,
            error: error.message || 'Connection failed',
        };
    } finally {
        client.destroy();
    }
}

/**
 * Plugin tRPC Router
 */
export const router = pluginRouter({
    /**
     * List all configured instances
     */
    listInstances: pluginProcedure.query(async ({ ctx }) => {
        await ctx.permissions.require('plugin:com.wordrhyme.storage-s3:settings.read');

        const instances = await getStoredInstances(ctx);

        // Return instances without secrets
        return instances.map(instance => ({
            ...instance,
            secretAccessKey: undefined,
            accessKeyId: instance.accessKeyId.substring(0, 8) + '...',
        }));
    }),

    /**
     * Get a single instance by providerId
     */
    getInstance: pluginProcedure
        .input(z.object({ providerId: z.string() }))
        .query(async ({ input, ctx }) => {
            await ctx.permissions.require('plugin:com.wordrhyme.storage-s3:settings.read');

            const instances = await getStoredInstances(ctx);
            const instance = instances.find(i => i.providerId === input.providerId);

            if (!instance) {
                throw new Error(`Instance not found: ${input.providerId}`);
            }

            // Return without secrets
            return {
                ...instance,
                secretAccessKey: undefined,
                accessKeyId: instance.accessKeyId.substring(0, 8) + '...',
            };
        }),

    /**
     * Save an instance (create or update)
     */
    saveInstance: pluginProcedure
        .input(s3InstanceSchema)
        .mutation(async ({ input, ctx }) => {
            await ctx.permissions.require('plugin:com.wordrhyme.storage-s3:settings.write');

            const instances = await getStoredInstances(ctx);
            const existingIndex = instances.findIndex(i => i.providerId === input.providerId);

            let newInstance: StoredS3Instance;

            if (existingIndex >= 0) {
                // Update existing
                const existing = instances[existingIndex]!;
                newInstance = {
                    providerId: existing.providerId,
                    displayName: input.displayName,
                    preset: input.preset,
                    endpoint: input.endpoint || undefined,
                    region: input.region,
                    bucket: input.bucket,
                    accessKeyId: input.accessKeyId,
                    // Keep existing secret if not provided
                    secretAccessKey: input.secretAccessKey || existing.secretAccessKey,
                    publicUrlBase: input.publicUrlBase || undefined,
                    forcePathStyle: input.forcePathStyle,
                    // Reset status on config change
                    status: 'unconfigured',
                    lastTestedAt: undefined,
                    lastError: undefined,
                };
                instances[existingIndex] = newInstance;
            } else {
                // Create new
                if (!input.secretAccessKey) {
                    throw new Error('Secret Access Key is required for new instances');
                }
                newInstance = {
                    providerId: input.providerId,
                    displayName: input.displayName,
                    preset: input.preset,
                    endpoint: input.endpoint || undefined,
                    region: input.region,
                    bucket: input.bucket,
                    accessKeyId: input.accessKeyId,
                    secretAccessKey: input.secretAccessKey,
                    publicUrlBase: input.publicUrlBase || undefined,
                    forcePathStyle: input.forcePathStyle,
                    status: 'unconfigured',
                    lastTestedAt: undefined,
                    lastError: undefined,
                };
                instances.push(newInstance);
            }

            await saveStoredInstances(ctx, instances);

            ctx.logger.info('S3 instance saved', { providerId: input.providerId });

            // Trigger provider refresh
            await refreshProviders(ctx);

            return { success: true };
        }),

    /**
     * Delete an instance
     */
    deleteInstance: pluginProcedure
        .input(z.object({ providerId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            await ctx.permissions.require('plugin:com.wordrhyme.storage-s3:settings.write');

            const instances = await getStoredInstances(ctx);
            const filtered = instances.filter(i => i.providerId !== input.providerId);

            if (filtered.length === instances.length) {
                throw new Error(`Instance not found: ${input.providerId}`);
            }

            await saveStoredInstances(ctx, filtered);

            ctx.logger.info('S3 instance deleted', { providerId: input.providerId });

            // Trigger provider refresh
            await refreshProviders(ctx);

            return { success: true };
        }),

    /**
     * Test connection to an S3 instance
     */
    testConnection: pluginProcedure
        .input(s3InstanceSchema)
        .mutation(async ({ input, ctx }) => {
            await ctx.permissions.require('plugin:com.wordrhyme.storage-s3:settings.write');

            // Get secret from stored instance if not provided
            let secret = input.secretAccessKey;
            if (!secret) {
                const instances = await getStoredInstances(ctx);
                const existing = instances.find(i => i.providerId === input.providerId);
                if (existing) {
                    secret = existing.secretAccessKey;
                }
            }

            if (!secret) {
                throw new Error('Secret Access Key is required for testing');
            }

            const testConfig: {
                endpoint?: string;
                region: string;
                bucket: string;
                accessKeyId: string;
                secretAccessKey: string;
                forcePathStyle: boolean;
            } = {
                region: input.region,
                bucket: input.bucket,
                accessKeyId: input.accessKeyId,
                secretAccessKey: secret,
                forcePathStyle: input.forcePathStyle,
            };
            if (input.endpoint) {
                testConfig.endpoint = input.endpoint;
            }

            const result = await testS3Connection(testConfig);

            // Update status in stored instance if it exists
            const instances = await getStoredInstances(ctx);
            const existingIndex = instances.findIndex(i => i.providerId === input.providerId);
            if (existingIndex >= 0) {
                const inst = instances[existingIndex]!;
                inst.status = result.ok ? 'healthy' : 'error';
                inst.lastTestedAt = new Date().toISOString();
                inst.lastError = result.error;
                await saveStoredInstances(ctx, instances);
            }

            return result;
        }),
});

/**
 * Refresh registered storage providers
 * Called after instance save/delete
 */
async function refreshProviders(ctx: PluginContext): Promise<void> {
    // Import dynamically to avoid circular dependency
    const { refreshStorageProviders } = await import('./index.js');
    await refreshStorageProviders(ctx);
}

export type StorageS3Router = typeof router;
