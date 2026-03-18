/**
 * Shop Plugin - Attributes Router
 *
 * CRUD for product attributes (e.g. Color, Size).
 * Uses createCrudRouter for standard operations.
 * Delete cascade handled by database FK constraints.
 */
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import { shopAttributes } from '../../shared';
import { createAttributeSchema, updateAttributeSchema } from '../../shared';

// ============================================================
// Attributes CRUD Router
// ============================================================

const crud = createCrudRouter({
    table: shopAttributes,
    procedure: pluginProcedure,
    schema: createAttributeSchema,
    updateSchema: updateAttributeSchema,
    omitFields: ['organizationId', 'createdAt', 'updatedAt'],
});

export const attributesRouter = pluginRouter({
    ...crud.procedures,
});
