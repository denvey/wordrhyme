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
    idField: 'skuId',
    procedure: pluginProcedure,
    schema: createVariationSchema,
    omitFields: ['organizationId', 'createdAt', 'updatedAt'],
});

// ============================================================
// Batch create schema (derived from createVariationSchema)
// ============================================================

const batchCombinationSchema = createVariationSchema
    .omit({ spuId: true })
    .extend({
        // 前端传 string 格式价格（如 "9.99"），业务层手动转 cents
        price: z.string().optional(),
        regularPrice: z.string().optional(),
        salePrice: z.string().optional(),
        // 关联表 shopVariantAttributeValues 的数据
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
            spuId: z.string(),
            combinations: z.array(batchCombinationSchema).min(1).max(100),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;

            const createdIds: string[] = [];

            await db.transaction(async (tx) => {
                for (const combo of input.combinations) {
                    const [createdVariation] = await tx.insert(shopProductVariations).values({
                        spuId: input.spuId,
                        skuCode: combo.skuCode,
                        name: combo.name,
                        priceCents: combo.price ? Math.round(parseFloat(combo.price) * 100) : undefined,
                        regularPriceCents: combo.regularPrice ? Math.round(parseFloat(combo.regularPrice) * 100) : undefined,
                        salePriceCents: combo.salePrice ? Math.round(parseFloat(combo.salePrice) * 100) : undefined,
                        stockQuantity: combo.stockQuantity,
                        stockStatus: combo.stockStatus,
                        image: combo.image ? { src: combo.image } : undefined,
                        weight: combo.weight,
                        length: combo.length,
                        width: combo.width,
                        height: combo.height,
                        attributeType: combo.attributeType,
                        purchaseCost: combo.purchaseCost,
                        organizationId: '', // auto-injected by ScopedDb
                    }).returning({ skuId: shopProductVariations.skuId });

                    // Insert variant_attribute_values links
                    for (const av of combo.attributeValues) {
                        await tx.insert(shopVariantAttributeValues).values({
                            skuId: createdVariation!.skuId,
                            attributeValueId: av.valueId,
                            organizationId: '', // auto-injected
                        });
                    }

                    createdIds.push(createdVariation!.skuId);
                }
            });

            ctx.logger?.info('Batch variations created', {
                spuId: input.spuId,
                count: createdIds.length,
            });

            return { ids: createdIds, count: createdIds.length };
        }),
});
