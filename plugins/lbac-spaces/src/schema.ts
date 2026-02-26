/**
 * LBAC Spaces Plugin - Drizzle Schema
 *
 * Defines space and space_member tables for workspace-level access control.
 */
import { pgTable, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

// Reference to core tables (FK targets only)
const organization = pgTable('organization', { id: text('id').primaryKey() });
const user = pgTable('user', { id: text('id').primaryKey() });

/**
 * Space table - workspace/project level isolation
 */
export const space = pgTable('space', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    path: text('path'),
    level: integer('level').notNull().default(0),
    visibility: text('visibility').notNull().default('private'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: text('created_by'),
}, (t) => [
    uniqueIndex('space_org_slug_uidx').on(t.organizationId, t.slug),
    index('space_org_idx').on(t.organizationId),
    index('space_parent_idx').on(t.parentId),
]);

/**
 * Space Member table - user membership in spaces
 */
export const spaceMember = pgTable('space_member', {
    id: text('id').primaryKey(),
    spaceId: text('space_id').notNull().references(() => space.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
    uniqueIndex('space_member_uidx').on(t.spaceId, t.userId),
    index('space_member_space_idx').on(t.spaceId),
    index('space_member_user_idx').on(t.userId),
]);

/**
 * Self-referencing FK for space hierarchy
 */
export const selfReferences = [
    { table: 'space', column: 'parent_id', references: { table: 'space', column: 'id' }, onDelete: 'set null' },
] as const;

/**
 * Custom indexes requiring raw SQL
 */
export const customSQL = [
    'CREATE INDEX IF NOT EXISTS "space_path_gist_idx" ON "space" USING GIST(("path"::ltree))',
] as const;

/**
 * PostgreSQL extensions required by this plugin
 */
export const requiredExtensions = ['ltree'] as const;
