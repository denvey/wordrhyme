/**
 * LBAC Relationships Plugin - Drizzle Schema
 *
 * Defines relationship table for dynamic access control
 * (followers, collaborators, subscribers, shares).
 */
import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

// Reference to core tables (FK targets only)
const organization = pgTable('organization', { id: text('id').primaryKey() });

/**
 * Relationship table - dynamic user-to-user relationships
 *
 * Common types: follow, collaborate, subscribe, share
 */
export const relationship = pgTable('relationship', {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    sourceId: text('source_id').notNull(),
    targetId: text('target_id').notNull(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
    uniqueIndex('relationship_unique_idx').on(t.type, t.sourceId, t.targetId),
    index('relationship_source_idx').on(t.type, t.sourceId),
    index('relationship_target_idx').on(t.type, t.targetId),
    index('relationship_org_idx').on(t.organizationId),
]);
