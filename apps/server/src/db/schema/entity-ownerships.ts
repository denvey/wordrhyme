/**
 * Entity Ownerships - Source of Truth (SoT)
 *
 * This is the ONLY authoritative source for permission grants.
 * aclTags on business tables are READ CACHE derived from this table.
 *
 * Rules:
 * 1. All permission grants MUST be recorded here
 * 2. aclTags MUST be rebuilt from this table (via TagSyncService)
 * 3. Inheritance is expanded at WRITE time, never at READ time
 * 4. inheritedFromType/Id tracks the inheritance chain for rebuild
 *
 * @see Frozen Spec: Hybrid CQRS + LBAC
 */
import { pgTable, text, timestamp, boolean, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organization } from './auth-schema';

/**
 * Scope Types for ownership
 */
export const ScopeType = {
    USER: 'user',
    TEAM: 'team',
    ROLE: 'role',
    SPACE: 'space',
    ORG: 'org',
} as const;

export type ScopeTypeValue = typeof ScopeType[keyof typeof ScopeType];

/**
 * Access Levels
 */
export const AccessLevel = {
    READ: 'read',
    WRITE: 'write',
} as const;

export type AccessLevelValue = typeof AccessLevel[keyof typeof AccessLevel];

/**
 * Entity Ownerships Table (Write Model - SoT)
 *
 * Records WHO can access WHAT at WHAT level.
 */
export const entityOwnerships = pgTable(
    'entity_ownerships',
    {
        id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

        // Target Entity
        entityType: text('entity_type').notNull(),  // 'article', 'document', etc.
        entityId: text('entity_id').notNull(),

        // Scope (who has access)
        scopeType: text('scope_type').notNull(),    // 'user' | 'team' | 'role' | 'space' | 'org'
        scopeId: text('scope_id').notNull(),

        // Access Level
        level: text('level').notNull().default('read'),  // 'read' | 'write'

        // Inheritance Tracking (for rebuild)
        // If this ownership was inherited, track the source
        inheritedFromType: text('inherited_from_type'),  // 'team' | 'space' | null
        inheritedFromId: text('inherited_from_id'),      // Source scope ID

        // Tenant isolation
        organizationId: text('organization_id')
            .notNull()
            .references(() => organization.id, { onDelete: 'cascade' }),

        // Expiration (optional, for time-limited access)
        expireAt: timestamp('expire_at'),

        // Metadata
        createdAt: timestamp('created_at').defaultNow().notNull(),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
        createdBy: text('created_by'),  // Actor who granted this
    },
    (table) => [
        // Unique constraint: one grant per entity-scope combination
        uniqueIndex('ownership_unique_idx').on(
            table.entityType,
            table.entityId,
            table.scopeType,
            table.scopeId
        ),
        // Query by entity
        index('ownership_entity_idx').on(table.entityType, table.entityId),
        // Query by scope (who has access to what)
        index('ownership_scope_idx').on(table.scopeType, table.scopeId),
        // Query inherited ownerships (for rebuild on membership change)
        index('ownership_inherited_idx').on(table.inheritedFromType, table.inheritedFromId),
        // Tenant isolation
        index('ownership_org_idx').on(table.organizationId),
        // Expiration cleanup
        index('ownership_expire_idx').on(table.expireAt),
    ]
);

/**
 * Ownership Audit Log - For compliance and debugging
 *
 * Records all changes to ownerships for audit trail.
 */
export const ownershipAuditLog = pgTable(
    'ownership_audit_log',
    {
        id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),

        // Reference to ownership (may be deleted)
        ownershipId: text('ownership_id').notNull(),
        entityType: text('entity_type').notNull(),
        entityId: text('entity_id').notNull(),
        scopeType: text('scope_type').notNull(),
        scopeId: text('scope_id').notNull(),

        // Action
        action: text('action').notNull(),  // 'grant' | 'revoke' | 'inherit_expand' | 'inherit_collapse' | 'expire'

        // State snapshot
        beforeState: jsonb('before_state'),
        afterState: jsonb('after_state'),

        // Actor
        actorId: text('actor_id').notNull(),
        actorType: text('actor_type').notNull(),  // 'user' | 'system' | 'plugin'
        reason: text('reason'),

        // Tenant
        organizationId: text('organization_id').notNull(),

        // Timestamp
        timestamp: timestamp('timestamp').defaultNow().notNull(),
    },
    (table) => [
        index('audit_ownership_idx').on(table.ownershipId),
        index('audit_entity_idx').on(table.entityType, table.entityId),
        index('audit_actor_idx').on(table.actorId),
        index('audit_org_idx').on(table.organizationId),
        index('audit_timestamp_idx').on(table.timestamp),
    ]
);

/**
 * Type exports for use in services
 */
export type EntityOwnership = typeof entityOwnerships.$inferSelect;
export type EntityOwnershipInsert = typeof entityOwnerships.$inferInsert;
export type OwnershipAuditLog = typeof ownershipAuditLog.$inferSelect;
export type OwnershipAuditLogInsert = typeof ownershipAuditLog.$inferInsert;
