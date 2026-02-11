/**
 * Relationship Database Schema
 *
 * Drizzle ORM table definitions for entity relationships.
 * Generic relationship table for linking entities (e.g., user follows user, team contains team).
 */
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { organization } from './auth';

// ============================================================
// Relationship Table (Generic Entity Relationships)
// ============================================================

export const relationship = pgTable(
  'relationship',
  {
    id: text('id').primaryKey(),
    // Relationship type (e.g., 'follows', 'contains', 'manages')
    type: text('type').notNull(),
    // Source entity ID
    sourceId: text('source_id').notNull(),
    // Target entity ID
    targetId: text('target_id').notNull(),
    // FK to organization table
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // Additional metadata for the relationship
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('relationship_org_idx').on(table.organizationId),
    index('relationship_source_idx').on(table.type, table.sourceId),
    index('relationship_target_idx').on(table.type, table.targetId),
    uniqueIndex('relationship_unique_idx').on(
      table.type,
      table.sourceId,
      table.targetId,
    ),
  ],
);

// ============================================================
// Zod Schemas
// ============================================================

export const relationshipSchema = createInsertSchema(relationship);

// ============================================================
// Inferred Types
// ============================================================

export type Relationship = typeof relationship.$inferSelect;
