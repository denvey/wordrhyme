/**
 * Shop Plugin - Attribute Values Router
 *
 * CRUD for attribute values (e.g. Red, Blue under Color attribute).
 * Uses createCrudRouter for standard operations.
 * Delete cascade handled by database FK constraints.
 */
import { pluginRouter, pluginProcedure } from '@wordrhyme/plugin/server';
import { createCrudRouter } from '@wordrhyme/auto-crud-server';
import {
    shopAttributeValues,
    createAttributeValueSchema,
    updateAttributeValueSchema,
} from '../../shared';

// ============================================================
// Attribute Values CRUD Router
// ============================================================

const crud = createCrudRouter({
    table: shopAttributeValues,
    procedure: pluginProcedure,
    schema: createAttributeValueSchema,
    updateSchema: updateAttributeValueSchema,
    omitFields: ['organizationId', 'createdAt'],
});

export const attributeValuesRouter = pluginRouter({
    ...crud.procedures,
});
