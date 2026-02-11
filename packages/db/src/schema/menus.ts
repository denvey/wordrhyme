/**
 * Menus Database Schema
 *
 * Drizzle ORM table definitions for navigation menus.
 * These are the source of truth - Zod schemas are generated from these.
 */
import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  boolean,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { organization } from './auth';
import { paginationSchema } from './common';

// ============================================================
// Types
// ============================================================

export type MenuType = 'system' | 'custom';
export type MenuOpenMode = 'route' | 'external';
export type MenuTarget = 'admin' | 'web';

// ============================================================
// Menus Table
// ============================================================

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
export const menus = pgTable(
  'menus',
  {
    // Primary key (UUID for database)
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Logical identifier (stable across tenants)
    // Format: 'core:dashboard', 'plugin:blog:posts', 'custom:my-menu'
    code: text('code').notNull(),

    // Menu Type
    type: text('type').notNull().$type<MenuType>(), // system = core/plugin, custom = tenant-created

    // Source (for system menus: 'core' | pluginId)
    source: text('source').notNull(), // 'core' | pluginId | 'custom'

    // FK to organization table (nullable: NULL = global template, value = organization-specific)
    organizationId: text('organization_id')
      .references(() => organization.id, { onDelete: 'cascade' }),

    // Menu Display
    label: text('label').notNull(),
    icon: text('icon'),
    path: text('path'), // NULL for directory menus
    openMode: text('open_mode').notNull().default('route').$type<MenuOpenMode>(),

    // Hierarchy (using code for logical reference)
    parentCode: text('parent_code'), // NULL = root level, 'SYS_INBOX' = orphaned
    order: integer('order').notNull().default(0),

    // Visibility Control
    visible: boolean('visible').notNull().default(true), // Tenant can hide menus

    // Permission Control
    requiredPermission: text('required_permission'),

    // Target Application
    target: text('target').notNull().$type<MenuTarget>(),

    // Extensibility
    metadata: jsonb('metadata'),

    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // Unique constraint: code + organizationId (allows same code in different organizations)
    uniqueIndex('menus_code_org_idx').on(table.code, table.organizationId),
    // Query optimization indexes
    index('menus_org_idx').on(table.organizationId),
    index('menus_target_idx').on(table.target),
    index('menus_parent_code_idx').on(table.parentCode),
    index('menus_type_idx').on(table.type),
  ],
);

// ============================================================
// Constants
// ============================================================

/**
 * Virtual Inbox code for orphaned system menus
 * When a system menu's parent is deleted/hidden, it moves here
 */
export const SYS_INBOX_CODE = 'SYS_INBOX';

// ============================================================
// Zod Schemas
// ============================================================

/** Base Schema - 直接用于 Create/Update */
export const menuSchema = createInsertSchema(menus);

// ============================================================
// Query Schemas
// ============================================================

/** Get menu by code */
export const getMenuQuery = z.object({
  code: z.string(),
});

/** List menus for sidebar */
export const listMenusQuery = z.object({
  target: z.enum(['admin', 'web']),
});

/** List all menus for admin management */
export const listAllMenusQuery = z.object({
  target: z.enum(['admin', 'web']).optional(),
}).merge(paginationSchema.partial());

// ============================================================
// Mutation Schemas
// ============================================================

/** Delete menu mutation */
export const deleteMenuMutation = z.object({
  code: z.string(),
});

/** Toggle visibility mutation */
export const toggleMenuVisibilityMutation = z.object({
  code: z.string(),
  visible: z.boolean(),
});

/** Update menu mutation (code for identification + partial fields) */
export const updateMenuMutation = menuSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial()
  .extend({
    code: z.string(), // Required for identification
  });

// ============================================================
// Inferred Types
// ============================================================

export type Menu = typeof menus.$inferSelect;
