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
// I18n field (inline for zod/v4 type consistency)
// ============================================================

const i18nField = z.record(z.string(), z.string());

// ============================================================
// Category Schemas (derived from Drizzle)
// ============================================================

export const createCategorySchema = createPluginInsertSchema(shopCategories, {
    name: () => i18nField,
    slug: () => z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    description: () => i18nField.optional(),
    seoTitle: () => i18nField.optional(),
    seoDescription: () => i18nField.optional(),
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
