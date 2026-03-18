/**
 * Roles Database Schema
 *
 * Drizzle ORM table definitions for role-based access control.
 * These are the source of truth - Zod schemas are generated from these.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { organization } from './auth';

// ============================================================
// Roles Table
// ============================================================

/**
 * Roles Table
 *
 * Stores role definitions.
 * - organizationId = 'platform': Platform organization roles (admin, owner, etc.)
 * - organizationId = 'xxx': Tenant-scoped roles (owner, admin, member, viewer)
 * System roles are protected from deletion.
 */
export const roles = pgTable(
  'roles',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('roles_org_slug_uidx').on(table.organizationId, table.slug),
    index('roles_organization_id_idx').on(table.organizationId),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const roleSchema = createInsertSchema(roles);

// ============================================================
// Inferred Types
// ============================================================

export type Role = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;
