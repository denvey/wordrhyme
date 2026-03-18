import { z } from 'zod';
import { i18nFieldSchema } from './i18n-field';

export const attributeTypeSchema = z.enum(['select', 'multiselect', 'text']);

export const createAttributeSchema = z.object({
    name: i18nFieldSchema,
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    type: attributeTypeSchema.default('select'),
    sortOrder: z.number().int().default(0),
});

export const updateAttributeSchema = createAttributeSchema.partial();

export const createAttributeValueSchema = z.object({
    attributeId: z.string(),
    value: i18nFieldSchema,
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    image: z.string().optional(),
    sortOrder: z.number().int().default(0),
});

export const updateAttributeValueSchema = createAttributeValueSchema.partial().omit({ attributeId: true });

export const assignProductAttributeSchema = z.object({
    productId: z.string(),
    attributeId: z.string(),
    visible: z.boolean().default(true),
    isVariation: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
});

export type CreateAttributeInput = z.infer<typeof createAttributeSchema>;
export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>;
export type CreateAttributeValueInput = z.infer<typeof createAttributeValueSchema>;
export type UpdateAttributeValueInput = z.infer<typeof updateAttributeValueSchema>;
export type AssignProductAttributeInput = z.infer<typeof assignProductAttributeSchema>;
