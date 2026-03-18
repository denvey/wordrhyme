/**
 * Permissions Database Schema
 *
 * Drizzle ORM table definitions for capability definitions.
 * These are the source of truth - Zod schemas are generated from these.
 */
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

// ============================================================
// Permissions Table
// ============================================================

/**
 * Permissions Table
 *
 * Stores capability definitions (Core + Plugin).
 */
export const permissions = pgTable('permissions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  capability: text('capability').notNull().unique(),
  source: text('source').notNull(), // 'core' | pluginId
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ============================================================
// Zod Schemas
// ============================================================

export const permissionSchema = createInsertSchema(permissions);

// ============================================================
// Inferred Types
// ============================================================

export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = typeof permissions.$inferInsert;

/**
 * Role-Permission Mapping (MVP: In-memory constant)
 *
 * Maps roles to capabilities. In production, this would be a database table.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ['*:*:*'],
  admin: ['organization:*:*', 'plugin:*:*', 'user:manage:*', 'content:*:*'],
  editor: ['content:create:space', 'content:update:own', 'content:read:*'],
  member: ['content:read:space', 'content:comment:*'],
  viewer: ['content:read:public'],
};
