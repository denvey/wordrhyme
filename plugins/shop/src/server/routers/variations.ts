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
    shopAttributes,
    shopAttributeValues,
    shopProductAttributes
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

import { TRPCError } from '@trpc/server';
import { inArray } from 'drizzle-orm';

// ... (existing code top block is untouched, we inject at bottom)

// ============================================================
// Advanced Matrix Sync API
// ============================================================

const syncMatrixSpecGroupSchema = z.object({
    id: z.string(),
    name: z.string(),
    hasImage: z.boolean().default(false),
    values: z.array(z.object({
        id: z.string(),
        name: z.string(),
    })),
});

const syncMatrixVariantSchema = z.object({
    id: z.string(),
    skuCode: z.string().optional(),
    priceCents: z.union([z.string(), z.number()]).optional(),
    regularPriceCents: z.union([z.string(), z.number()]).optional(),
    purchaseCost: z.union([z.string(), z.number()]).optional(),
    stockQuantity: z.number().default(0),
    weight: z.union([z.string(), z.number()]).optional(),
    length: z.union([z.string(), z.number()]).optional(),
    width: z.union([z.string(), z.number()]).optional(),
    height: z.union([z.string(), z.number()]).optional(),
    options: z.record(z.string()), // mapping from groupId to valueId
});

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
                        organizationId: '', 
                    }).returning({ skuId: shopProductVariations.skuId });

                    for (const av of combo.attributeValues) {
                        await tx.insert(shopVariantAttributeValues).values({
                            skuId: createdVariation!.skuId,
                            attributeValueId: av.valueId,
                            organizationId: '',
                        });
                    }
                    createdIds.push(createdVariation!.skuId);
                }
            });

            ctx.logger?.info('Batch variations created', { spuId: input.spuId, count: createdIds.length });
            return { ids: createdIds, count: createdIds.length };
        }),

    // Full Matrix Sync
    syncMatrix: pluginProcedure
        .input(z.object({
            spuId: z.string(),
            specs: z.array(syncMatrixSpecGroupSchema),
            variants: z.array(syncMatrixVariantSchema),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;
            const { spuId, specs, variants } = input;

            await db.transaction(async (tx) => {
                // 1. Process Attributes and Values
                const attrMap: Record<string, string> = {}; // frontend groupId -> db attr id
                const valMap: Record<string, string> = {};  // frontend valueId -> db val id

                let sortOrder = 0;
                for (const spec of specs) {
                    // Find or create attribute
                    let attrId = '';
                    const existingAttr = await tx.select()
                        .from(shopAttributes)
                        .where(eq(shopAttributes.name, JSON.stringify(spec.name)))
                        .limit(1);

                    if (existingAttr.length > 0) {
                        attrId = existingAttr[0].id;
                    } else {
                        const [newAttr] = await tx.insert(shopAttributes).values({
                            name: spec.name,
                            slug: `attr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                            organizationId: '',
                        }).returning({ id: shopAttributes.id });
                        attrId = newAttr.id;
                    }
                    attrMap[spec.id] = attrId;

                    // Find or create attribute values
                    for (const val of spec.values) {
                        let validId = '';
                        const existingVal = await tx.select()
                            .from(shopAttributeValues)
                            .where(eq(shopAttributeValues.attributeId, attrId))
                            // using brute force filter for jsonb equality to avoid missing ones in simple setups
                            // In real use, slug might be more stable, but we use name mapping.
                            // We do a simple find after querying.
                        
                        const matchedVal = existingVal.find(v => JSON.stringify(v.value) === JSON.stringify(val.name) || v.value === val.name);

                        if (matchedVal) {
                            validId = matchedVal.id;
                        } else {
                            const [newVal] = await tx.insert(shopAttributeValues).values({
                                attributeId: attrId,
                                value: val.name,
                                slug: `val-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                                organizationId: '',
                            }).returning({ id: shopAttributeValues.id });
                            validId = newVal.id;
                        }
                        valMap[val.id] = validId;
                    }
                    sortOrder++;
                }

                // 2. Link Product Attributes
                await tx.delete(shopProductAttributes).where(eq(shopProductAttributes.spuId, spuId));
                
                let paSort = 0;
                for (const spec of specs) {
                    if (spec.values.length > 0) {
                        await tx.insert(shopProductAttributes).values({
                            spuId,
                            attributeId: attrMap[spec.id],
                            isVariation: true,
                            sortOrder: paSort++,
                            organizationId: '',
                        });
                    }
                }

                // 3. Process Variants
                const parsedNum = (val: string | number | undefined) => {
                    if (val === undefined || val === '') return undefined;
                    const parsed = typeof val === 'string' ? parseFloat(val) : val;
                    return isNaN(parsed) ? undefined : parsed;
                };

                const parsedPrice = (val: string | number | undefined) => {
                    const num = parsedNum(val);
                    return num !== undefined ? Math.round(num * 100) : undefined;
                };

                const inputSkuIds = variants.filter(v => !v.id.startsWith('new-')).map(v => v.id);

                // Collect current existing
                const existingVariations = await tx.select({ skuId: shopProductVariations.skuId })
                    .from(shopProductVariations)
                    .where(eq(shopProductVariations.spuId, spuId));

                const existingSkuIds = existingVariations.map(v => v.skuId);
                const toDelete = existingSkuIds.filter(id => !inputSkuIds.includes(id));

                if (toDelete.length > 0) {
                    await tx.delete(shopProductVariations).where(inArray(shopProductVariations.skuId, toDelete));
                    await tx.delete(shopVariantAttributeValues).where(inArray(shopVariantAttributeValues.skuId, toDelete));
                }

                for (const variant of variants) {
                    const varData = {
                        skuCode: variant.skuCode || undefined,
                        priceCents: parsedPrice(variant.priceCents),
                        regularPriceCents: parsedPrice(variant.regularPriceCents),
                        purchaseCost: parsedPrice(variant.purchaseCost),
                        stockQuantity: variant.stockQuantity,
                        weight: parsedNum(variant.weight),
                        length: parsedNum(variant.length),
                        width: parsedNum(variant.width),
                        height: parsedNum(variant.height),
                        attributeType: 'advanced',
                    };

                    let activeSkuId = variant.id;

                    if (variant.id.startsWith('new-')) {
                        const [inserted] = await tx.insert(shopProductVariations).values({
                            spuId,
                            skuType: 'multiple',
                            organizationId: '',
                            ...varData,
                        }).returning({ skuId: shopProductVariations.skuId });
                        activeSkuId = inserted.skuId;
                    } else {
                        await tx.update(shopProductVariations)
                            .set({ ...varData, updatedAt: new Date() })
                            .where(eq(shopProductVariations.skuId, variant.id));
                        
                        await tx.delete(shopVariantAttributeValues).where(eq(shopVariantAttributeValues.skuId, variant.id));
                    }

                    for (const [groupId, valueId] of Object.entries(variant.options)) {
                        const realAttrValId = valMap[valueId];
                        if (realAttrValId) {
                            await tx.insert(shopVariantAttributeValues).values({
                                skuId: activeSkuId,
                                attributeValueId: realAttrValId,
                                organizationId: '',
                            });
                        }
                    }
                }
            });

            ctx.logger?.info('Full Variant Matrix Synced', { spuId });
            return { success: true };
        }),
});
