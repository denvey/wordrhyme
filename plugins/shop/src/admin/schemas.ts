/**
 * Zod schemas for AutoCrudTable display.
 *
 * Generated from Drizzle table definitions via drizzle-zod.
 * These are "select" schemas used for table column inference.
 */
import { createSelectSchema } from 'drizzle-zod';
import {
    shopProducts,
    shopOrders,
    shopAttributes,
    shopAttributeValues,
} from '../shared';

export const productSchema = createSelectSchema(shopProducts);
export const orderSchema = createSelectSchema(shopOrders);
export const attributeSchema = createSelectSchema(shopAttributes);
export const attributeValueSchema = createSelectSchema(shopAttributeValues);
