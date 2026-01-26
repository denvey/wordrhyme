import { pgTable, text, integer, timestamp, jsonb, index, uniqueIndex, boolean } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

/**
 * Menus Table (Future-Ready Design for Plan D)
 *
 * Single-Table approach with code-based logical references:
 * - `code`: Logical identifier (e.g., 'dashboard', 'settings')
 * - `parent_code`: Hierarchy reference using code
 * - `organization_id`: Scope (NULL = global template, UUID = organization-specific)
 *
 * Menu Types:
 * - type='system': Core/Plugin menus (from global templates)
 * - type='custom': Organization-created menus
 *
 * Resolution Strategy:
 * 1. Merge global (organization_id=NULL) and organization-specific items
 * 2. Organization item with same code overrides global (Copy-on-Write)
 * 3. Auto-Inbox: Orphaned system menus go to SYS_INBOX
 */
export const menus = pgTable('menus', {
    // Primary key (UUID for database)
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

    // Logical identifier (stable across tenants)
    // Format: 'core:dashboard', 'plugin:blog:posts', 'custom:my-menu'
    code: text('code').notNull(),

    // Menu Type
    type: text('type').notNull().$type<'system' | 'custom'>(), // system = core/plugin, custom = tenant-created

    // Source (for system menus: 'core' | pluginId)
    source: text('source').notNull(), // 'core' | pluginId | 'custom'

    // Multi-Tenant Scope
    // NULL = global template (shared by all organizations)
    // UUID = organization-specific (override or custom)
    organizationId: text('organization_id'), // NULL for global, orgId for organization-specific

    // Menu Display
    label: text('label').notNull(),
    icon: text('icon'),
    path: text('path'), // NULL for directory menus
    openMode: text('open_mode').notNull().default('route').$type<'route' | 'external'>(),

    // Hierarchy (using code for logical reference)
    parentCode: text('parent_code'), // NULL = root level, 'SYS_INBOX' = orphaned
    order: integer('order').notNull().default(0),

    // Visibility Control
    visible: boolean('visible').notNull().default(true), // Tenant can hide menus

    // Permission Control
    requiredPermission: text('required_permission'),

    // Target Application
    target: text('target').notNull().$type<'admin' | 'web'>(),

    // Extensibility
    metadata: jsonb('metadata'),

    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
    // Unique constraint: code + organizationId (allows same code in different organizations)
    codeOrgIdx: uniqueIndex('menus_code_org_idx').on(table.code, table.organizationId),
    // Query optimization indexes
    orgIdx: index('menus_org_idx').on(table.organizationId),
    targetIdx: index('menus_target_idx').on(table.target),
    parentCodeIdx: index('menus_parent_code_idx').on(table.parentCode),
    typeIdx: index('menus_type_idx').on(table.type),
}));

export type Menu = typeof menus.$inferSelect;
export type InsertMenu = typeof menus.$inferInsert;

/**
 * Virtual Inbox code for orphaned system menus
 * When a system menu's parent is deleted/hidden, it moves here
 */
export const SYS_INBOX_CODE = 'SYS_INBOX';

// ==================== Auto-generated Zod Schemas ====================

/**
 * Base insert schema (auto-generated from Drizzle)
 * Use this as the foundation for all menu creation/update schemas
 */
export const insertMenuSchema = createInsertSchema(menus, {
    // Custom refinements
    code: z.string().min(1, 'Code is required'),
    label: z.string().min(1, 'Label is required'),
    path: z.string().nullable().optional(), // NULL for directory menus
    openMode: z.enum(['route', 'external']).default('route'),
    icon: z.string().nullable().optional(),
    parentCode: z.string().nullable().optional(),
    order: z.number().int().min(0).default(0),
    target: z.enum(['admin', 'web']),
});

/**
 * Select schema (auto-generated from Drizzle)
 */
export const selectMenuSchema = createSelectSchema(menus);

/**
 * Schema for creating a custom menu (derived from insertMenuSchema)
 */
export const createMenuSchema = insertMenuSchema.pick({
    code: true,
    label: true,
    path: true,
    icon: true,
    openMode: true,
    parentCode: true,
    order: true,
    target: true,
    metadata: true,
});

/**
 * Schema for updating a menu (all fields optional)
 */
export const updateMenuSchema = insertMenuSchema.pick({
    label: true,
    icon: true,
    path: true,
    openMode: true,
    parentCode: true,
    order: true,
    visible: true,
    metadata: true,
}).partial();
