import { z } from 'zod';
import { i18nFieldSchema } from './i18n-field';
import { MAX_CATEGORY_DEPTH } from './category.types';

export const createCategorySchema = z.object({
    name: i18nFieldSchema,
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    description: i18nFieldSchema.optional(),
    mainImage: z.string().optional(),
    parentId: z.string().nullable().optional(),
    sortOrder: z.number().int().default(0),
    isEnabled: z.boolean().default(true),
    seoTitle: i18nFieldSchema.optional(),
    seoDescription: i18nFieldSchema.optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

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
