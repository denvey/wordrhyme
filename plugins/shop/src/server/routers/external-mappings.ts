/**
 * Shop Plugin - External Mappings Router
 *
 * Manages links between shop entities and external platform entities.
 * Custom procedures for link/unlink/batchLink/syncStatus/checkOrderProcurable.
 */
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import {
    shopExternalMappings,
    shopOrderItems,
} from '../../shared';

// ============================================================
// External Mappings Router (fully custom - no standard CRUD pattern)
// ============================================================

export const externalMappingsRouter = pluginRouter({
    listByEntity: pluginProcedure
        .input(z.object({
            entityType: z.string(),
            entityId: z.string(),
        }))
        .query(async ({ input, ctx }) => {
            const db = ctx.db!;
            return db.select().from(shopExternalMappings)
                .where(and(
                    eq(shopExternalMappings.entityType, input.entityType),
                    eq(shopExternalMappings.entityId, input.entityId),
                ));
        }),

    link: pluginProcedure
        .input(z.object({
            entityType: z.string().min(1),
            entityId: z.string().min(1),
            platform: z.string().min(1),
            direction: z.string().min(1).default('supply'),
            externalId: z.string().min(1),
            externalUrl: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;
            const id = crypto.randomUUID();

            await db.insert(shopExternalMappings).values({
                id,
                entityType: input.entityType,
                entityId: input.entityId,
                platform: input.platform,
                direction: input.direction,
                externalId: input.externalId,
                externalUrl: input.externalUrl,
                syncStatus: 'linked',
                organizationId: '', // auto-injected by ScopedDb
            });

            ctx.hooks?.emit('mapping.afterLink', {
                mappingId: id,
                entityType: input.entityType,
                entityId: input.entityId,
                platform: input.platform,
                externalId: input.externalId,
            }).catch(() => {});

            return { id };
        }),

    unlink: pluginProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;
            await db.delete(shopExternalMappings).where(eq(shopExternalMappings.id, input.id));
            return { id: input.id };
        }),

    batchLink: pluginProcedure
        .input(z.object({
            items: z.array(z.object({
                entityType: z.string().min(1),
                entityId: z.string().min(1),
                platform: z.string().min(1),
                direction: z.string().min(1).default('supply'),
                externalId: z.string().min(1),
                externalUrl: z.string().optional(),
            })).min(1).max(100),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;
            let created = 0;
            let skipped = 0;

            await db.transaction(async (tx) => {
                for (const item of input.items) {
                    // Idempotent: check if mapping already exists
                    const existing = await tx.select({ id: shopExternalMappings.id })
                        .from(shopExternalMappings)
                        .where(and(
                            eq(shopExternalMappings.entityType, item.entityType),
                            eq(shopExternalMappings.entityId, item.entityId),
                            eq(shopExternalMappings.platform, item.platform),
                            eq(shopExternalMappings.externalId, item.externalId),
                        ))
                        .limit(1);

                    if (existing.length > 0) {
                        skipped++;
                        continue;
                    }

                    await tx.insert(shopExternalMappings).values({
                        id: crypto.randomUUID(),
                        entityType: item.entityType,
                        entityId: item.entityId,
                        platform: item.platform,
                        direction: item.direction,
                        externalId: item.externalId,
                        externalUrl: item.externalUrl,
                        syncStatus: 'linked',
                        organizationId: '', // auto-injected
                    });

                    created++;
                }
            });

            return { created, skipped };
        }),

    updateSyncStatus: pluginProcedure
        .input(z.object({
            id: z.string(),
            syncStatus: z.enum(['linked', 'syncing', 'synced', 'error']),
            lastSyncedAt: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;

            const setData: Record<string, unknown> = {
                syncStatus: input.syncStatus,
                updatedAt: new Date(),
            };

            if (input.lastSyncedAt) {
                setData.lastSyncedAt = new Date(input.lastSyncedAt);
            } else if (input.syncStatus === 'synced') {
                setData.lastSyncedAt = new Date();
            }

            await db.update(shopExternalMappings)
                .set(setData)
                .where(eq(shopExternalMappings.id, input.id));

            return { id: input.id, syncStatus: input.syncStatus };
        }),

    checkOrderProcurable: pluginProcedure
        .input(z.object({ orderId: z.string() }))
        .query(async ({ input, ctx }) => {
            const db = ctx.db!;

            const orderItems = await db.select().from(shopOrderItems)
                .where(eq(shopOrderItems.orderId, input.orderId));

            if (orderItems.length === 0) {
                return { procurable: false, unmappedItems: [], reason: 'No order items found' };
            }

            const unmappedItems: Array<{ itemId: string; name: unknown; productId?: string | null }> = [];

            for (const item of orderItems) {
                if (!item.productId) {
                    unmappedItems.push({ itemId: item.id, name: item.name, productId: item.productId });
                    continue;
                }

                const mappings = await db.select({ id: shopExternalMappings.id })
                    .from(shopExternalMappings)
                    .where(and(
                        eq(shopExternalMappings.entityType, 'product'),
                        eq(shopExternalMappings.entityId, item.productId),
                    ))
                    .limit(1);

                if (mappings.length === 0) {
                    unmappedItems.push({ itemId: item.id, name: item.name, productId: item.productId });
                }
            }

            return {
                procurable: unmappedItems.length === 0,
                unmappedItems,
            };
        }),
});
