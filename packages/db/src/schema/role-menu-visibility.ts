/**
 * Role Menu Visibility Database Schema
 *
 * Drizzle ORM table definitions for menu access control.
 * These are the source of truth - Zod schemas are generated from these.
 */
import {
  pgTable,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { roles } from './roles';
import { menus } from './menus';
import { organization } from './auth';

// ============================================================
// Role Menu Visibility Table
// ============================================================

/**
 * Role Menu Visibility Table
 *
 * Controls which menus are visible to which roles.
 * - organizationId = NULL: Global default (set by platform admin)
 * - organizationId = value: Tenant override (set by tenant admin)
 *
 * Resolution order: tenant override > global default > default hidden
 */
export const roleMenuVisibility = pgTable(
  'role_menu_visibility',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // FK to roles table
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    // FK to menus table
    menuId: text('menu_id')
      .notNull()
      .references(() => menus.id, { onDelete: 'cascade' }),
    // NULL = global default, value = tenant override
    // FK to organization table
    organizationId: text('organization_id')
      .references(() => organization.id, { onDelete: 'cascade' }),
    visible: boolean('visible').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Unique constraint: one record per role + menu + organization
    uniqueIndex('uq_role_menu_visibility').on(
      table.roleId,
      table.menuId,
      table.organizationId,
    ),
    // Query optimization indexes
    index('idx_rmv_org_role').on(table.organizationId, table.roleId),
    index('idx_rmv_menu_org').on(table.menuId, table.organizationId),
    index('idx_rmv_role_id').on(table.roleId),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const roleMenuVisibilitySchema = createInsertSchema(roleMenuVisibility);

// ============================================================
// Inferred Types
// ============================================================

export type RoleMenuVisibility = typeof roleMenuVisibility.$inferSelect;
