/**
 * Shop Plugin - Products Router
 *
 * CRUD + publish + status transitions + upsert + inlineCreate for products.
 * Standard CRUD via createCrudRouter, custom procedures via Drizzle API.
 */
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
    shopProducts,
    shopProductVariations,
    createProductSchema,
    updateProductSchema,
    inlineCreateInputSchema,
    assertValidTransition,
    shopProductImages,
} from '../../shared';
import type { Product, InlineCreateOutput } from '../../shared';

// ============================================================
// Standard CRUD
// ============================================================

const crud = createCrudRouter({
    table: shopProducts,
    idField: 'spuId',
    procedure: pluginProcedure,
    schema: createProductSchema,
    updateSchema: updateProductSchema,
    omitFields: ['organizationId', 'aclTags', 'denyTags', 'createdBy', 'createdAt', 'updatedAt'],
});

const productUpsertSchema = createProductSchema.extend({
    spuId: z.string().optional(),
});

// ============================================================
// SKU Code Auto-Generation
// ============================================================

function generateAutoCode(prefix: string): string {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${datePart}-${randomPart}`;
}

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
            const [existing] = await db.select().from(shopProducts).where(eq(shopProducts.spuId, input.id));
            if (!existing) throw new Error('Product not found');

            assertValidTransition(existing.status as Product['status'], 'published');

            await db.update(shopProducts)
                .set({ status: 'published', updatedAt: new Date() })
                .where(eq(shopProducts.spuId, input.id));

            ctx.hooks?.emit('product.afterPublish', { spuId: input.id }).catch(() => {});
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
            const [existing] = await db.select().from(shopProducts).where(eq(shopProducts.spuId, input.id));
            if (!existing) throw new Error('Product not found');

            assertValidTransition(existing.status as Product['status'], input.status);

            await db.update(shopProducts)
                .set({ status: input.status, updatedAt: new Date() })
                .where(eq(shopProducts.spuId, input.id));

            return { id: input.id, status: input.status };
        }),

    // Upsert (by spu_id primary key)
    upsert: pluginProcedure
        .input(productUpsertSchema)
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;

            const [existing] = input.spuId
                ? await db.select().from(shopProducts).where(eq(shopProducts.spuId, input.spuId))
                : [undefined];

            const [inserted] = await db.insert(shopProducts)
                .values({
                    ...(input.spuId ? { spuId: input.spuId } : {}),
                    name: input.name,
                    description: input.description,
                    status: input.status ?? 'draft',
                    priceCents: input.priceCents,
                    currencyCode: input.currencyCode ?? 'USD',
                    source: input.source,
                    spuCode: input.spuCode,
                    sourcingPlatform: input.sourcingPlatform,
                    sourcingMemo: input.sourcingMemo,

                    createdBy: ctx.userId ?? '',
                })
                .onConflictDoUpdate({
                    target: shopProducts.spuId,
                    set: {
                        name: input.name,
                        description: input.description,
                        priceCents: input.priceCents,
                        currencyCode: input.currencyCode ?? 'USD',
                        source: input.source,
                        spuCode: input.spuCode,
                        sourcingPlatform: input.sourcingPlatform,
                        sourcingMemo: input.sourcingMemo,
                        status: input.status ?? 'draft',
                        updatedAt: new Date(),
                    },
                })
                .returning();

            return { row: inserted, inserted: !existing };
        }),

    // Batch upsert
    batchUpsert: pluginProcedure
        .input(z.object({
            items: z.array(productUpsertSchema).min(1).max(100),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;
            let created = 0;
            let updated = 0;

            await db.transaction(async (tx: any) => {
                for (const item of input.items) {
                    const [existing] = item.spuId
                        ? await tx.select().from(shopProducts).where(eq(shopProducts.spuId, item.spuId))
                        : [undefined];

                    await tx.insert(shopProducts)
                        .values({
                            ...(item.spuId ? { spuId: item.spuId } : {}),
                            name: item.name,
                            description: item.description,
                            status: item.status ?? 'draft',
                            priceCents: item.priceCents,
                            currencyCode: item.currencyCode ?? 'USD',
                            source: item.source,
                            spuCode: item.spuCode,
                            sourcingPlatform: item.sourcingPlatform,
                            sourcingMemo: item.sourcingMemo,

                            createdBy: ctx.userId ?? '',
                        })
                        .onConflictDoUpdate({
                            target: shopProducts.spuId,
                            set: {
                                name: item.name,
                                description: item.description,
                                priceCents: item.priceCents,
                                currencyCode: item.currencyCode ?? 'USD',
                                source: item.source,
                                spuCode: item.spuCode,
                                sourcingPlatform: item.sourcingPlatform,
                                sourcingMemo: item.sourcingMemo,
                                status: item.status ?? 'draft',
                                updatedAt: new Date(),
                            },
                        });

                    if (existing) {
                        updated++;
                    } else {
                        created++;
                    }
                }
            });

            return { created, updated };
        }),

    // ============================================================
    // Inline Create: Atomically create SPU + 1:1 SKU
    // Used by Quotation for zero-navigation product filing.
    // ============================================================
    inlineCreate: pluginProcedure
        .input(inlineCreateInputSchema)
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;

            // Auto-generate codes if needed
            const spuCode = input.spuCode ?? generateAutoCode('SPU');
            const skuCode = input.autoSku
                ? generateAutoCode('AUTO')
                : input.skuCode!;

            let result: InlineCreateOutput;

            await db.transaction(async (tx: any) => {
                // 1. Create SPU
                const [createdProduct] = await tx.insert(shopProducts).values({
                    name: input.name,
                    status: 'draft',
                    spuCode,
                    mainImage: input.mainImage,
                    source: input.source,
                    url: input.sourceUrl,
                    memo: input.memo,

                    createdBy: ctx.userId ?? '',
                }).returning({ spuId: shopProducts.spuId });

                // 2. Create 1:1 SKU
                const [createdVariation] = await tx.insert(shopProductVariations).values({
                    spuId: createdProduct!.spuId,
                    skuCode,
                    skuType: 'single',
                    weight: input.weight,
                    length: input.length,
                    width: input.width,
                    height: input.height,
                    cargoType: input.cargoType,
                    purchaseCost: input.purchaseCost,
                    shippingCost: input.shippingCost,
                    packingCost: input.packingCost,

                }).returning({ skuId: shopProductVariations.skuId });

                // 3. Create image gallery
                if (input.images && input.images.length > 0) {
                    const imageValues = input.images.map((src, index) => ({
                        spuId: createdProduct!.spuId,
                        src,
                        sortOrder: index,
                        isMain: src === input.mainImage || (index === 0 && !input.mainImage), // main if matches or first
                    }));
                    await tx.insert(shopProductImages).values(imageValues);
                }

                result = {
                    spuId: createdProduct!.spuId,
                    skuId: createdVariation!.skuId,
                    spuCode,
                    skuCode,
                    weight: input.weight,
                    cargoType: input.cargoType,
                    name: input.name,
                };
            });

            ctx.hooks?.emit('product.afterInlineCreate', {
                ...result!,
            }).catch(() => {});

            return result!;
        }),
});
