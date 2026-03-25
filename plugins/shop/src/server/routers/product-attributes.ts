import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { z } from 'zod/v4';
import { eq, and } from 'drizzle-orm';
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { shopProductAttributes } from '../../shared/schema';

// ============================================================
// Internal Types
// ============================================================

const syncInputSchema = z.object({
    spu_id: z.string(),
    attributes: z.array(z.object({
        attribute_id: z.string(),
        is_variation: z.boolean().default(false),
        values: z.array(z.string()).default([]),
    })),
});

// ============================================================
// Standard CRUD
// ============================================================

const crud = createCrudRouter({
    table: shopProductAttributes,
    idField: 'id',
    procedure: pluginProcedure,
    omitFields: ['organizationId', 'aclTags', 'denyTags'],
});

// ============================================================
// Custom Procedures
// ============================================================

export const productAttributesRouter = pluginRouter({
    ...(crud as any),

    // Custom list procedure to return aggregated values per attribute
    list: pluginProcedure
        .input(z.object({ input: z.string().optional() }))
        .query(async ({ input, ctx }) => {
            let spuId: string | undefined;
            if (input.input) {
                try {
                    const parsed = JSON.parse(input.input);
                    spuId = parsed.spu_id;
                } catch (e) {
                    // ignore
                }
            }

            if (!spuId) {
                return { items: [], total: 0 };
            }

            const items = await ctx.db
                .select()
                .from(shopProductAttributes)
                .where(eq(shopProductAttributes.spuId, spuId))
                .orderBy(shopProductAttributes.sortOrder);

            // The frontend expects items to have structure:
            // { attribute_id: string; is_variation: boolean; values: string[] }
            // But since values are stored in a different table (shopVariantAttributeValues)
            // or we just need the bindings for the builder UI, we map it accordingly.
            const mappedItems = items.map((item: any) => ({
                id: item.id,
                spu_id: item.spuId,
                attribute_id: item.attributeId,
                is_variation: item.isVariation,
                visible: item.visible,
                sort_order: item.sortOrder,
                values: [], // In a full implementation, we'd fetch this from variation linkages
            }));

            return { items: mappedItems, total: items.length };
        }),

    sync: pluginProcedure
        .input(syncInputSchema)
        .mutation(async ({ input, ctx }) => {
            // Delete existing mappings for this spu_id
            await ctx.db
                .delete(shopProductAttributes)
                .where(
                    and(
                        eq(shopProductAttributes.spuId, input.spu_id),
                        ctx.organizationId ? eq(shopProductAttributes.organizationId, ctx.organizationId) : undefined
                    )
                );

            // Insert new mappings
            if (input.attributes.length > 0) {
                const valuesToInsert = input.attributes.map((attr, index) => ({
                    spuId: input.spu_id,
                    attributeId: attr.attribute_id,
                    isVariation: attr.is_variation,
                    sortOrder: index,
                    // Auto-injected by scoped-db: organizationId, aclTags, etc.
                }));

                await ctx.db
                    .insert(shopProductAttributes)
                    .values(valuesToInsert);
            }

            return { success: true };
        }),
});
