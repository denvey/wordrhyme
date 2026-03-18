/**
 * Shop Plugin - Variations Router
 *
 * CRUD for product variations (SKU-level).
 * Standard CRUD via createCrudRouter, plus custom batchCreate.
 */
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
    shopProductVariations,
    shopVariantAttributeValues,
    createVariationSchema,
} from '../../shared';

// ============================================================
// Standard CRUD
// ============================================================

const crud = createCrudRouter({
    table: shopProductVariations,
    procedure: pluginProcedure,
    schema: createVariationSchema,
    omitFields: ['organizationId', 'createdAt', 'updatedAt'],
});

// ============================================================
// Batch create schema
// ============================================================

const batchCombinationSchema = z.object({
    skuId: z.string().min(1).max(50),
    name: z.string().optional(),
    price: z.string().optional(),
    regularPrice: z.string().optional(),
    salePrice: z.string().optional(),
    stockQuantity: z.number().int().default(0),
    stockStatus: z.enum(['instock', 'outofstock', 'onbackorder']).default('instock'),
    image: z.string().optional(),
    attributeValues: z.array(z.object({
        attributeId: z.string(),
        valueId: z.string(),
    })),
});

// ============================================================
// Router with custom batchCreate
// ============================================================

export const variationsRouter = pluginRouter({
    ...crud.procedures,

    // Batch create variations with attribute value assignments
    batchCreate: pluginProcedure
        .input(z.object({
            productId: z.string(),
            combinations: z.array(batchCombinationSchema).min(1).max(100),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;

            // Verify parent product exists
            const [parent] = await db.select({ id: shopProductVariations.id })
                .from(shopProductVariations)
                .where(eq(shopProductVariations.productId, input.productId))
                .limit(1);

            const createdIds: string[] = [];

            await db.transaction(async (tx) => {
                for (const combo of input.combinations) {
                    const id = crypto.randomUUID();

                    await tx.insert(shopProductVariations).values({
                        id,
                        productId: input.productId,
                        skuId: combo.skuId,
                        name: combo.name,
                        priceCents: combo.price ? Math.round(parseFloat(combo.price) * 100) : undefined,
                        regularPriceCents: combo.regularPrice ? Math.round(parseFloat(combo.regularPrice) * 100) : undefined,
                        salePriceCents: combo.salePrice ? Math.round(parseFloat(combo.salePrice) * 100) : undefined,
                        stockQuantity: combo.stockQuantity,
                        stockStatus: combo.stockStatus,
                        image: combo.image ? { src: combo.image } : undefined,
                        organizationId: '', // auto-injected by ScopedDb
                    });

                    // Insert variant_attribute_values links
                    for (const av of combo.attributeValues) {
                        await tx.insert(shopVariantAttributeValues).values({
                            variantId: id,
                            attributeValueId: av.valueId,
                            organizationId: '', // auto-injected
                        });
                    }

                    createdIds.push(id);
                }
            });

            ctx.logger?.info('Batch variations created', {
                productId: input.productId,
                count: createdIds.length,
            });

            return { ids: createdIds, count: createdIds.length };
        }),
});
