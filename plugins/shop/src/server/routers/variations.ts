/**
 * Shop Plugin - Variations Router
 *
 * CRUD for product variations (SKU-level).
 * Standard CRUD via createCrudRouter, plus custom batchCreate.
 */
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
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
// Advanced Matrix Sync API
// ============================================================

export const syncMatrixSpecGroupSchema = z.object({
    id: z.string(),
    name: z.string(),
    hasImage: z.boolean().default(false),
    values: z.array(z.object({
        id: z.string(),
        name: z.string(),
        image: z.string().optional(),
    })),
});

export const syncMatrixVariantSchema = z.object({
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
    image: z.string().optional(),
    options: z.record(z.string(), z.string()), // mapping from groupId to valueId
});

export type SyncMatrixSpecGroup = z.infer<typeof syncMatrixSpecGroupSchema>;
export type SyncMatrixVariant = z.infer<typeof syncMatrixVariantSchema>;

function readLocalizedText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const preferred = record['zh-CN'] ?? record['en-US'];
        if (typeof preferred === 'string') return preferred;
        const firstString = Object.values(record).find((item) => typeof item === 'string');
        if (typeof firstString === 'string') return firstString;
    }
    return '';
}

function toLocalizedText(value: string): Record<string, string> {
    return { 'zh-CN': value, 'en-US': value };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle tx type is framework-internal
export async function syncMatrixTransaction(
    tx: any,
    spuId: string,
    specs: SyncMatrixSpecGroup[],
    variants: SyncMatrixVariant[],
) {
    // 1. Process Attributes and Values
    const attrMap: Record<string, string> = {};
    const valMap: Record<string, string> = {};
    const currentProductAttrs: any[] = await tx.select()
        .from(shopProductAttributes)
        .where(eq(shopProductAttributes.spuId, spuId));
    const currentAttrIds = currentProductAttrs.map((item) => item.attributeId);
    const currentAttrs: any[] = currentAttrIds.length > 0
        ? await tx.select().from(shopAttributes).where(inArray(shopAttributes.id, currentAttrIds))
        : [];
    const currentAttrValues: any[] = currentAttrIds.length > 0
        ? await tx.select().from(shopAttributeValues).where(inArray(shopAttributeValues.attributeId, currentAttrIds))
        : [];
    const linkedProducts: any[] = currentAttrIds.length > 0
        ? await tx.select({
            attributeId: shopProductAttributes.attributeId,
            spuId: shopProductAttributes.spuId,
        }).from(shopProductAttributes).where(inArray(shopProductAttributes.attributeId, currentAttrIds))
        : [];
    const attrUsageCounts = linkedProducts.reduce((acc: Record<string, number>, item: { attributeId: string; spuId: string }) => {
        acc[item.attributeId] = (acc[item.attributeId] ?? 0) + 1;
        return acc;
    }, {});

    for (const spec of specs) {
        let attrId = '';
        const existingAttr = currentAttrs.find((attr) => attr.id === spec.id);
        const canReuseAttr = Boolean(existingAttr) && (attrUsageCounts[spec.id] ?? 0) <= 1;

        if (existingAttr && canReuseAttr) {
            attrId = existingAttr.id;
            if (readLocalizedText(existingAttr.name) !== spec.name) {
                await tx.update(shopAttributes)
                    .set({ name: toLocalizedText(spec.name) })
                    .where(eq(shopAttributes.id, attrId));
            }
        } else {
            const [newAttr] = await tx.insert(shopAttributes).values({
                name: toLocalizedText(spec.name),
                slug: `attr-${crypto.randomUUID().slice(0, 12)}`,
                organizationId: '',
            }).returning({ id: shopAttributes.id });
            attrId = newAttr.id;
        }
        attrMap[spec.id] = attrId;

        const existingValuesForAttr = canReuseAttr
            ? currentAttrValues.filter((value) => value.attributeId === attrId)
            : [];

        for (const val of spec.values) {
            const matchedVal = existingValuesForAttr.find((value) => value.id === val.id);

            if (matchedVal) {
                if (readLocalizedText(matchedVal.value) !== val.name || (matchedVal.image ?? null) !== (val.image ?? null)) {
                    await tx.update(shopAttributeValues)
                        .set({
                            value: toLocalizedText(val.name),
                            image: val.image ?? null,
                        })
                        .where(eq(shopAttributeValues.id, matchedVal.id));
                }
                valMap[val.id] = matchedVal.id;
            } else {
                const [newVal] = await tx.insert(shopAttributeValues).values({
                    attributeId: attrId,
                    value: toLocalizedText(val.name),
                    image: val.image,
                    slug: `val-${crypto.randomUUID().slice(0, 12)}`,
                    organizationId: '',
                }).returning({ id: shopAttributeValues.id });
                valMap[val.id] = newVal.id;
            }
        }
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
        const parsed = typeof val === 'string' ? Number.parseFloat(val) : val;
        return isNaN(parsed) ? undefined : parsed;
    };

    // Price helper: input values are already in cents (前端已转为分).
    // batchCreate uses a different path where prices come as yuan-string and server × 100.
    const parsedPrice = (val: string | number | undefined) => {
        const num = parsedNum(val);
        return num !== undefined ? Math.round(num) : undefined;
    };

    const inputSkuIds = variants.filter(v => !v.id.startsWith('new-')).map(v => v.id);

    // Collect current existing
    const existingVariations = await tx.select({ skuId: shopProductVariations.skuId })
        .from(shopProductVariations)
        .where(eq(shopProductVariations.spuId, spuId));

    const existingSkuIds = existingVariations.map((v: any) => v.skuId);
    const toDelete = existingSkuIds.filter((id: string) => !inputSkuIds.includes(id));

    if (toDelete.length > 0) {
        await tx.delete(shopProductVariations).where(inArray(shopProductVariations.skuId, toDelete));
        await tx.delete(shopVariantAttributeValues).where(inArray(shopVariantAttributeValues.skuId, toDelete));
    }

    for (const variant of variants) {
        const skuType = Object.keys(variant.options).length > 0 ? 'bundle' : 'single';
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
            image: variant.image ? { src: variant.image } : undefined,
            skuType,
        };

        let activeSkuId = variant.id;

        if (variant.id.startsWith('new-')) {
            const [inserted] = await tx.insert(shopProductVariations).values({
                spuId,
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
            const realAttrValId = valMap[String(valueId)];
            if (realAttrValId) {
                await tx.insert(shopVariantAttributeValues).values({
                    skuId: activeSkuId,
                    attributeValueId: realAttrValId,
                    organizationId: '',
                });
            }
        }
    }
}


export async function getVariationMatrix(db: any, spuId: string) {
    const productAttrs: any[] = await db.select()
        .from(shopProductAttributes)
        .where(eq(shopProductAttributes.spuId, spuId))
        .orderBy(shopProductAttributes.sortOrder);

    const variationAttrs = productAttrs.filter((item) => item.isVariation);
    const attributeIds = variationAttrs.map((item) => item.attributeId);

    const attributes: any[] = attributeIds.length > 0
        ? await db.select().from(shopAttributes).where(inArray(shopAttributes.id, attributeIds))
        : [];

    const variants: any[] = await db.select().from(shopProductVariations).where(eq(shopProductVariations.spuId, spuId));
    const skuIds = variants.map((variant) => variant.skuId);

    const variantAttrValues: any[] = skuIds.length > 0
        ? await db.select().from(shopVariantAttributeValues).where(inArray(shopVariantAttributeValues.skuId, skuIds))
        : [];

    const valueIds = [...new Set(variantAttrValues.map((item) => item.attributeValueId))];
    const attrValues: any[] = valueIds.length > 0
        ? await db.select().from(shopAttributeValues).where(inArray(shopAttributeValues.id, valueIds))
        : [];

    const specsMap: Record<string, any> = {};
    for (const pa of variationAttrs) {
        const attr = attributes.find((a) => a.id === pa.attributeId);
        if (attr) {
            specsMap[attr.id] = {
                id: attr.id,
                name: readLocalizedText(attr.name),
                hasImage: false,
                values: [],
            };
        }
    }

    for (const v of attrValues) {
        if (specsMap[v.attributeId]) {
            specsMap[v.attributeId].values.push({
                id: v.id,
                name: readLocalizedText(v.value),
                image: v.image || undefined,
            });
            if (v.image) {
                specsMap[v.attributeId].hasImage = true;
            }
        }
    }

    const specs = productAttrs
        .filter((pa) => specsMap[pa.attributeId])
        .map((pa) => specsMap[pa.attributeId]);

    const formattedVariants = variants.map((variant) => {
        const myValues = variantAttrValues.filter((v) => v.skuId === variant.skuId);
        const options: Record<string, string> = {};
        for (const val of myValues) {
            const attrVal = attrValues.find((a) => a.id === val.attributeValueId);
            if (attrVal) {
                options[attrVal.attributeId] = attrVal.id;
            }
        }
        return {
            id: variant.skuId,
            skuCode: variant.skuCode || '',
            priceCents: variant.priceCents || 0,
            regularPriceCents: variant.regularPriceCents || 0,
            purchaseCost: variant.purchaseCost || 0,
            stockQuantity: variant.stockQuantity || 0,
            weight: variant.weight || 0,
            length: variant.length || 0,
            width: variant.width || 0,
            height: variant.height || 0,
            image: variant.image?.src || '',
            options,
        };
    });

    return { specs, variants: formattedVariants };
}

export const variationsRouter = pluginRouter({
    ...crud.procedures,

    getMatrix: pluginProcedure
        .input(z.object({ spuId: z.string() }))
        .query(async ({ input, ctx }) => {
            const db = ctx.db!;
            return getVariationMatrix(db, input.spuId);
        }),
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
                        priceCents: combo.price ? Math.round(Number.parseFloat(combo.price) * 100) : undefined,
                        regularPriceCents: combo.regularPrice ? Math.round(Number.parseFloat(combo.regularPrice) * 100) : undefined,
                        salePriceCents: combo.salePrice ? Math.round(Number.parseFloat(combo.salePrice) * 100) : undefined,
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
                await syncMatrixTransaction(tx, spuId, specs, variants);
            });

            ctx.logger?.info('Full Variant Matrix Synced', { spuId });
            return { success: true };
        }),
});
