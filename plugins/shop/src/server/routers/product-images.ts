/**
 * Shop Plugin - Product Images Router
 *
 * Manages product images with sort ordering and main image designation.
 * All custom procedures using Drizzle API.
 */
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import {
    shopProductImages,
    shopProducts,
} from '../../shared';

// ============================================================
// Product Images Router
// ============================================================

export const productImagesRouter = pluginRouter({
    list: pluginProcedure
        .input(z.object({ productId: z.string() }))
        .query(async ({ input, ctx }) => {
            const db = ctx.db!;
            return db.select().from(shopProductImages)
                .where(eq(shopProductImages.productId, input.productId));
        }),

    add: pluginProcedure
        .input(z.object({
            productId: z.string(),
            src: z.string().min(1),
            alt: z.record(z.string(), z.string()).optional(),
            isMain: z.boolean().default(false),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;

            // Get current max sort_order
            const existing = await db.select({ sortOrder: shopProductImages.sortOrder })
                .from(shopProductImages)
                .where(eq(shopProductImages.productId, input.productId));
            const maxSortOrder = existing.reduce((max, img) => Math.max(max, img.sortOrder), -1);

            const id = crypto.randomUUID();

            await db.insert(shopProductImages).values({
                id,
                productId: input.productId,
                src: input.src,
                alt: input.alt,
                isMain: input.isMain,
                sortOrder: maxSortOrder + 1,
                organizationId: '', // auto-injected by ScopedDb
            });

            // If this is marked as main, update product main_image and unset other mains
            if (input.isMain) {
                await db.update(shopProductImages)
                    .set({ isMain: false })
                    .where(and(
                        eq(shopProductImages.productId, input.productId),
                        eq(shopProductImages.isMain, true),
                    ));

                // Re-set our image as main (may have been unset above)
                await db.update(shopProductImages)
                    .set({ isMain: true })
                    .where(eq(shopProductImages.id, id));

                await db.update(shopProducts)
                    .set({ mainImage: input.src, updatedAt: new Date() })
                    .where(eq(shopProducts.id, input.productId));
            }

            ctx.hooks?.emit('product.afterImageUpdate', {
                productId: input.productId,
                action: 'add',
                imageId: id,
            }).catch(() => {});

            return { id };
        }),

    delete: pluginProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;

            const [image] = await db.select().from(shopProductImages)
                .where(eq(shopProductImages.id, input.id));
            if (!image) throw new Error('Image not found');

            await db.delete(shopProductImages).where(eq(shopProductImages.id, input.id));

            // If this was the main image, clear the product's main_image
            if (image.isMain) {
                await db.update(shopProducts)
                    .set({ mainImage: null, updatedAt: new Date() })
                    .where(eq(shopProducts.id, image.productId));
            }

            return { id: input.id };
        }),

    reorder: pluginProcedure
        .input(z.object({
            productId: z.string(),
            imageIds: z.array(z.string()).min(1),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;

            for (let i = 0; i < input.imageIds.length; i++) {
                await db.update(shopProductImages)
                    .set({ sortOrder: i })
                    .where(eq(shopProductImages.id, input.imageIds[i]!));
            }

            return { productId: input.productId };
        }),

    setMain: pluginProcedure
        .input(z.object({
            productId: z.string(),
            imageId: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;

            const [target] = await db.select().from(shopProductImages)
                .where(eq(shopProductImages.id, input.imageId));
            if (!target) throw new Error('Image not found');

            await db.transaction(async (tx) => {
                // Unset all current main images
                await tx.update(shopProductImages)
                    .set({ isMain: false })
                    .where(and(
                        eq(shopProductImages.productId, input.productId),
                        eq(shopProductImages.isMain, true),
                    ));

                // Set new main image
                await tx.update(shopProductImages)
                    .set({ isMain: true })
                    .where(eq(shopProductImages.id, input.imageId));

                // Sync products.main_image
                await tx.update(shopProducts)
                    .set({ mainImage: target.src, updatedAt: new Date() })
                    .where(eq(shopProducts.id, input.productId));
            });

            return { productId: input.productId, imageId: input.imageId };
        }),
});
