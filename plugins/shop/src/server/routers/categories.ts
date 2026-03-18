/**
 * Shop Plugin - Categories Router
 *
 * CRUD + move for product categories.
 * Standard CRUD via createCrudRouter, custom move with depth/cycle validation.
 */
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
    shopCategories,
    createCategorySchema,
    updateCategorySchema,
    moveCategorySchema,
    MAX_CATEGORY_DEPTH,
} from '../../shared';

// ============================================================
// Helpers
// ============================================================

/**
 * Compute the depth of a parent category by walking up the tree.
 */
async function getParentDepth(db: any, parentId: string | null | undefined): Promise<number> {
    if (!parentId) return 0;

    let depth = 0;
    let currentId: string | null = parentId;

    while (currentId) {
        depth++;
        if (depth > MAX_CATEGORY_DEPTH) {
            throw new Error(`Category depth exceeds maximum of ${MAX_CATEGORY_DEPTH}`);
        }

        const [row] = await db.select().from(shopCategories).where(eq(shopCategories.id, currentId));
        if (!row) throw new Error(`Parent category not found: ${currentId}`);
        currentId = row.parentId ?? null;
    }

    return depth;
}

/**
 * Check if moving a category to a new parent would create a cycle.
 */
async function wouldCreateCycle(db: any, categoryId: string, newParentId: string | null): Promise<boolean> {
    if (!newParentId) return false;

    let currentId: string | null = newParentId;
    while (currentId) {
        if (currentId === categoryId) return true;

        const [row] = await db.select().from(shopCategories).where(eq(shopCategories.id, currentId));
        if (!row) break;
        currentId = row.parentId ?? null;
    }

    return false;
}

// ============================================================
// Standard CRUD
// ============================================================

const crud = createCrudRouter({
    table: shopCategories,
    procedure: pluginProcedure,
    schema: createCategorySchema,
    updateSchema: updateCategorySchema,
    omitFields: ['organizationId', 'aclTags', 'denyTags', 'createdAt', 'updatedAt'],
});

// ============================================================
// Router
// ============================================================

export const categoriesRouter = pluginRouter({
    ...crud.procedures,

    // Move category (with depth/cycle validation)
    move: pluginProcedure
        .input(moveCategorySchema)
        .mutation(async ({ input, ctx }) => {
            const db = ctx.db!;

            const [existing] = await db.select().from(shopCategories).where(eq(shopCategories.id, input.id));
            if (!existing) throw new Error('Category not found');

            // Cycle detection
            if (await wouldCreateCycle(db, input.id, input.parentId)) {
                throw new Error('Moving this category would create a circular reference');
            }

            // Depth validation
            const parentDepth = await getParentDepth(db, input.parentId);
            const nestedLevel = parentDepth + 1;
            if (nestedLevel > MAX_CATEGORY_DEPTH) {
                throw new Error(`Category depth ${nestedLevel} exceeds maximum of ${MAX_CATEGORY_DEPTH}`);
            }

            await db.update(shopCategories)
                .set({
                    parentId: input.parentId,
                    nestedLevel: nestedLevel,
                    updatedAt: new Date(),
                })
                .where(eq(shopCategories.id, input.id));

            ctx.logger?.info('Category moved', { id: input.id, parentId: input.parentId, nestedLevel });
            return { id: input.id, parentId: input.parentId, nestedLevel };
        }),
});
