/**
 * @wordrhyme/shop-core - Attribute Schemas
 *
 * Derived from Drizzle schema via drizzle-zod.
 * Uses `zod/v4` import to match drizzle-zod@1.0 internal types.
 */
import { z } from 'zod/v4';
import type { InferSelectModel } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import {
    shopAttributes,
    shopAttributeValues,
    shopProductAttributes,
} from './schema';

// ============================================================
// Entity Types (derived from Drizzle)
// ============================================================

export type Attribute = InferSelectModel<typeof shopAttributes>;
export type AttributeValue = InferSelectModel<typeof shopAttributeValues>;
export type ProductAttribute = InferSelectModel<typeof shopProductAttributes>;

// ============================================================
// Enums
// ============================================================

export const attributeTypeSchema = z.enum(['select', 'multiselect', 'text']);
export type AttributeType = z.infer<typeof attributeTypeSchema>;

// ============================================================
// I18n field (inline for zod/v4 type consistency)
// ============================================================

const i18nField = z.record(z.string(), z.string());

// ============================================================
// Attribute Schemas (derived from Drizzle)
// ============================================================

export const createAttributeSchema = createInsertSchema(shopAttributes, {
    name: () => i18nField,
    slug: () => z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    type: () => attributeTypeSchema.default('select'),
}).omit({
    id: true,
    organizationId: true,
    createdAt: true,
    updatedAt: true,
});

export const updateAttributeSchema = createAttributeSchema.partial();

export const selectAttributeSchema = createSelectSchema(shopAttributes);

export type CreateAttributeInput = z.infer<typeof createAttributeSchema>;
export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>;

// ============================================================
// Attribute Value Schemas (derived from Drizzle)
// ============================================================

export const createAttributeValueSchema = createInsertSchema(shopAttributeValues, {
    value: () => i18nField,
    slug: () => z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    colorHex: () => z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).omit({
    id: true,
    organizationId: true,
    createdAt: true,
});

export const updateAttributeValueSchema = createAttributeValueSchema.partial().omit({ attributeId: true });

export const selectAttributeValueSchema = createSelectSchema(shopAttributeValues);

export type CreateAttributeValueInput = z.infer<typeof createAttributeValueSchema>;
export type UpdateAttributeValueInput = z.infer<typeof updateAttributeValueSchema>;

// ============================================================
// Product Attribute Schemas (derived from Drizzle)
// ============================================================

export const assignProductAttributeSchema = createInsertSchema(shopProductAttributes).omit({
    id: true,
    organizationId: true,
});

export const selectProductAttributeSchema = createSelectSchema(shopProductAttributes);

export type AssignProductAttributeInput = z.infer<typeof assignProductAttributeSchema>;
