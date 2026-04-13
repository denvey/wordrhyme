/**
 * @wordrhyme/shop-core - Category Schemas
 *
 * Derived from Drizzle schema via drizzle-zod.
 * Uses `zod/v4` import to match drizzle-zod@1.0 internal types.
 */
import { z } from 'zod/v4';
import type { InferSelectModel } from 'drizzle-orm';
import { createPluginInsertSchema } from '@wordrhyme/db/plugin';
import { createSelectSchema } from 'drizzle-zod';
import { shopCategories } from './schema';

// ============================================================
// Constants
// ============================================================

export const MAX_CATEGORY_DEPTH = 5;

// ============================================================
// Entity Types (derived from Drizzle)
// ============================================================

export type Category = InferSelectModel<typeof shopCategories>;

export interface CategoryTree extends Category {
    children: CategoryTree[];
}

// ============================================================
// Category Schemas (derived from Drizzle)
// ============================================================

export const createCategorySchema = createPluginInsertSchema(shopCategories, {
    name: () => z.record(z.string(), z.string()),
    slug: () => z.string().min(1).regex(/^[a-z0-9-]+$/),
    // JSONB I18n fields: drizzle-zod defaults to z.unknown(), must override
    description: () => z.record(z.string(), z.string()).optional(),
    seoTitle: () => z.record(z.string(), z.string()).optional(),
    seoDescription: () => z.record(z.string(), z.string()).optional(),
}).omit({
    id: true,
    nestedLevel: true,
    createdAt: true,
    updatedAt: true,
});

export const updateCategorySchema = createCategorySchema.partial();

export const selectCategorySchema = createSelectSchema(shopCategories);

export const moveCategorySchema = z.object({
    id: z.string(),
    parentId: z.string().nullable(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/**
 * Validate that a category depth is within limits.
 */
export function validateCategoryDepth(nestedLevel: number): boolean {
    return nestedLevel < MAX_CATEGORY_DEPTH;
}
