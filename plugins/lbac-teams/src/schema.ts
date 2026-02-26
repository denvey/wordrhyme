/**
 * LBAC Teams Plugin - Drizzle Schema
 *
 * Defines team and team_member tables with hierarchy support (ltree).
 */
import { pgTable, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

// Reference to core tables (FK targets only)
const organization = pgTable('organization', { id: text('id').primaryKey() });
const user = pgTable('user', { id: text('id').primaryKey() });

/**
 * Team table - hierarchical teams within an organization
 */
export const team = pgTable('team', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    path: text('path'),
    level: integer('level').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
    index('team_org_idx').on(t.organizationId),
    index('team_parent_idx').on(t.parentId),
    index('team_org_path_idx').on(t.organizationId, t.path),
]);

/**
 * Team Member table - user membership in teams
 */
export const teamMember = pgTable('team_member', {
    id: text('id').primaryKey(),
    teamId: text('team_id').notNull().references(() => team.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
    uniqueIndex('team_member_uidx').on(t.teamId, t.userId),
    index('team_member_team_idx').on(t.teamId),
    index('team_member_user_idx').on(t.userId),
]);

/**
 * Self-referencing FK for team hierarchy (parent_id -> team.id)
 * Note: Defined separately because Drizzle doesn't support self-referencing
 * in the same pgTable() call. Applied via raw SQL in migration.
 */
export const selfReferences = [
    { table: 'team', column: 'parent_id', references: { table: 'team', column: 'id' }, onDelete: 'restrict' },
] as const;

/**
 * Custom indexes requiring raw SQL (e.g., GIST with ltree cast)
 */
export const customSQL = [
    'CREATE INDEX IF NOT EXISTS "team_path_gist_idx" ON "team" USING GIST(("path"::ltree))',
] as const;

/**
 * PostgreSQL extensions required by this plugin
 */
export const requiredExtensions = ['ltree'] as const;
