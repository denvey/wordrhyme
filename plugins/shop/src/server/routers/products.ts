/**
 * Shop Plugin - Products Router
 *
 * CRUD + publish + status transitions + upsert for products.
 * Standard CRUD via createCrudRouter, custom procedures via Drizzle API.
 */
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
    shopProducts,
    createProductSchema,
    updateProductSchema,
    assertValidTransition,
} from '../../shared';
import type { Product } from '../../shared';

// ============================================================
// Standard CRUD
// ============================================================

const crud = createCrudRouter({
    table: shopProducts,
    procedure: pluginProcedure,
    schema: createProductSchema,
    updateSchema: updateProductSchema,
    omitFields: ['organizationId', 'aclTags', 'denyTags', 'createdBy', 'createdAt', 'updatedAt'],
});

// ============================================================
// Custom Procedures (Drizzle API)
// ============================================================

export const productsRouter = pluginRouter({
    // Standard CRUD from createCrudRouter
    ...crud.procedures,

    // Publish product (draft → published)
    publish: pluginProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;
            const [existing] = await db.select().from(shopProducts).where(eq(shopProducts.id, input.id));
            if (!existing) throw new Error('Product not found');

            assertValidTransition(existing.status as Product['status'], 'published');

            await db.update(shopProducts)
                .set({ status: 'published', updatedAt: new Date() })
                .where(eq(shopProducts.id, input.id));

            ctx.hooks?.emit('product.afterPublish', { productId: input.id }).catch(() => {});

            return { id: input.id };
        }),

    // Update product status with transition validation
    updateStatus: pluginProcedure
        .input(z.object({
            id: z.string(),
            status: z.enum(['draft', 'pending', 'published', 'archived']),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;
            const [existing] = await db.select().from(shopProducts).where(eq(shopProducts.id, input.id));
            if (!existing) throw new Error('Product not found');

            assertValidTransition(existing.status as Product['status'], input.status);

            await db.update(shopProducts)
                .set({ status: input.status, updatedAt: new Date() })
                .where(eq(shopProducts.id, input.id));

            return { id: input.id, status: input.status };
        }),

    // Upsert (by organization_id + spu_id)
    upsert: pluginProcedure
        .input(createProductSchema)
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;

            const [inserted] = await db.insert(shopProducts)
                .values({
                    id: crypto.randomUUID(),
                    spuId: input.spuId,
                    name: input.name,
                    description: input.description,
                    status: input.status ?? 'draft',
                    priceCents: input.priceCents,
                    currencyCode: input.currencyCode ?? 'USD',
                    source: input.source,
                    organizationId: '', // auto-injected by ScopedDb
                    createdBy: ctx.userId ?? '',
                })
                .onConflictDoUpdate({
                    target: [shopProducts.organizationId, shopProducts.spuId],
                    set: {
                        name: input.name,
                        description: input.description,
                        priceCents: input.priceCents,
                        updatedAt: new Date(),
                    },
                })
                .returning();

            return { row: inserted, inserted: true };
        }),

    // Batch upsert
    batchUpsert: pluginProcedure
        .input(z.object({
            items: z.array(createProductSchema).min(1).max(100),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;
            let created = 0;
            let updated = 0;

            await db.transaction(async (tx) => {
                for (const item of input.items) {
                    const [result] = await tx.insert(shopProducts)
                        .values({
                            id: crypto.randomUUID(),
                            spuId: item.spuId,
                            name: item.name,
                            description: item.description,
                            status: item.status ?? 'draft',
                            priceCents: item.priceCents,
                            currencyCode: item.currencyCode ?? 'USD',
                            source: item.source,
                            organizationId: '', // auto-injected
                            createdBy: ctx.userId ?? '',
                        })
                        .onConflictDoUpdate({
                            target: [shopProducts.organizationId, shopProducts.spuId],
                            set: {
                                name: item.name,
                                description: item.description,
                                priceCents: item.priceCents,
                                updatedAt: new Date(),
                            },
                        })
                        .returning();

                    // Simple heuristic: if updatedAt is very recent, it was updated
                    created++;
                }
            });

            return { created, updated };
        }),
});
