/**
 * Team Database Schema
 *
 * Drizzle ORM table definitions for teams and team membership.
 * Supports hierarchical team structures with parent-child relationships.
 */
import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { organization } from './auth';
import { user } from './auth';

// ============================================================
// Team Table (Hierarchical Teams)
// ============================================================

export const team = pgTable(
  'team',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    // Hierarchical structure
    parentId: text('parent_id'),
    path: text('path'), // Materialized path for efficient tree queries
    level: integer('level').default(0).notNull(),
  },
  (table) => [
    index('team_organizationId_idx').on(table.organizationId),
    index('team_parent_idx').on(table.parentId),
    index('team_org_path_idx').on(table.organizationId, table.path),
  ],
);

// ============================================================
// Team Member Table (Many-to-Many: Team <-> User)
// ============================================================

export const teamMember = pgTable(
  'team_member',
  {
    id: text('id').primaryKey(),
    // FK to team table
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    // FK to user table
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('teamMember_team_user_uidx').on(table.teamId, table.userId),
    index('teamMember_teamId_idx').on(table.teamId),
    index('teamMember_userId_idx').on(table.userId),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const teamSchema = createInsertSchema(team);
export const teamMemberSchema = createInsertSchema(teamMember);

// ============================================================
// Inferred Types
// ============================================================

export type Team = typeof team.$inferSelect;
export type TeamMember = typeof teamMember.$inferSelect;
