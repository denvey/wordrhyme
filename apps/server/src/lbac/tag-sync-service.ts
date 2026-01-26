/**
 * Tag Sync Service - Event-driven tag synchronization
 *
 * Listens to ownership events and rebuilds aclTags on business tables.
 *
 * ⚠️ CRITICAL INVARIANT:
 * - aclTags on business tables are CACHE ONLY
 * - entity_ownerships is the SINGLE SOURCE OF TRUTH
 * - This service is the ONLY way to update aclTags
 *
 * @see Frozen Spec: Read Model (Performance Cache)
 */
import { eq, and, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { entityOwnerships } from '../db/schema/entity-ownerships';
import { ownershipEvents, OwnershipEventType, type OwnershipEvent } from './events';

/**
 * Entity Type to Table mapping
 */
type EntityTableMap = Map<string, PgTable>;

/**
 * Tag Governance Configuration
 */
export const TAG_GOVERNANCE = {
    /** Maximum tags per entity (soft limit) */
    maxTagsPerEntity: 100,

    /** Forbidden tag patterns */
    forbiddenPatterns: [
        /^user:.*\*$/,  // No user wildcards
    ] as RegExp[],
};

/**
 * Tag Sync Service
 */
export class TagSyncService {
    private entityTableMap: EntityTableMap = new Map();
    private initialized = false;

    constructor() {
        this.setupEventListeners();
    }

    /**
     * Register an entity type with its table
     */
    registerEntityType(entityType: string, table: PgTable): void {
        this.entityTableMap.set(entityType, table);
    }

    /**
     * Setup event listeners for ownership changes
     */
    private setupEventListeners(): void {
        if (this.initialized) return;

        // Single ownership changes
        ownershipEvents.onOwnershipEvent(OwnershipEventType.CREATED, async (event) => {
            await this.handleSingleEvent(event);
        });

        ownershipEvents.onOwnershipEvent(OwnershipEventType.UPDATED, async (event) => {
            await this.handleSingleEvent(event);
        });

        ownershipEvents.onOwnershipEvent(OwnershipEventType.DELETED, async (event) => {
            await this.handleSingleEvent(event);
        });

        // Bulk changes
        ownershipEvents.onOwnershipEvent(OwnershipEventType.BULK_CREATED, async (event) => {
            await this.handleBulkEvent(event);
        });

        ownershipEvents.onOwnershipEvent(OwnershipEventType.BULK_DELETED, async (event) => {
            await this.handleBulkEvent(event);
        });

        // Inheritance changes
        ownershipEvents.onOwnershipEvent(OwnershipEventType.INHERITANCE_EXPANDED, async (event) => {
            await this.handleBulkEvent(event);
        });

        ownershipEvents.onOwnershipEvent(OwnershipEventType.INHERITANCE_COLLAPSED, async (event) => {
            await this.handleBulkEvent(event);
        });

        this.initialized = true;
    }

    /**
     * Handle single ownership event
     */
    private async handleSingleEvent(event: OwnershipEvent): Promise<void> {
        if (Array.isArray(event.payload)) return;

        const { entityType, entityId } = event.payload;
        await this.refresh(entityType, entityId);
    }

    /**
     * Handle bulk ownership event
     */
    private async handleBulkEvent(event: OwnershipEvent): Promise<void> {
        if (!Array.isArray(event.payload)) return;

        // Group by entity for efficiency
        const entityGroups = new Map<string, Set<string>>();

        for (const payload of event.payload) {
            const key = payload.entityType;
            if (!entityGroups.has(key)) {
                entityGroups.set(key, new Set());
            }
            entityGroups.get(key)!.add(payload.entityId);
        }

        // Refresh each entity
        for (const [entityType, entityIds] of entityGroups) {
            for (const entityId of entityIds) {
                await this.refresh(entityType, entityId);
            }
        }
    }

    /**
     * Refresh aclTags for an entity from entity_ownerships
     *
     * This is the ONLY method that updates aclTags on business tables.
     */
    async refresh(entityType: string, entityId: string): Promise<string[]> {
        const table = this.entityTableMap.get(entityType);
        if (!table) {
            console.warn(`[TagSync] Unknown entity type: ${entityType}`);
            return [];
        }

        // 1. Query all ownerships for this entity
        const ownerships = await db
            .select()
            .from(entityOwnerships)
            .where(
                and(
                    eq(entityOwnerships.entityType, entityType),
                    eq(entityOwnerships.entityId, entityId)
                )
            );

        // 2. Build aclTags from ownerships
        const aclTags = ownerships.map((o) => `${o.scopeType}:${o.scopeId}`);

        // 3. Validate tags (governance)
        this.validateTags(aclTags);

        // 4. Update business table
        const tableAny = table as PgTable & { id: unknown; aclTags: unknown };
        await db
            .update(table)
            .set({ aclTags } as Record<string, unknown>)
            .where(eq(tableAny.id as any, entityId));

        return aclTags;
    }

    /**
     * Rebuild all tags for an entity type
     *
     * Use for disaster recovery or data migration.
     */
    async rebuildAll(entityType: string): Promise<{ total: number; rebuilt: number }> {
        const table = this.entityTableMap.get(entityType);
        if (!table) {
            throw new Error(`Unknown entity type: ${entityType}`);
        }

        const tableAny = table as PgTable & { id: unknown };

        // Get all entity IDs
        const entities = await db
            .select({ id: tableAny.id as any })
            .from(table);

        let rebuilt = 0;
        for (const entity of entities) {
            await this.refresh(entityType, entity.id);
            rebuilt++;
        }

        return { total: entities.length, rebuilt };
    }

    /**
     * Validate tags against governance rules
     */
    private validateTags(tags: string[]): void {
        // Check cardinality
        if (tags.length > TAG_GOVERNANCE.maxTagsPerEntity) {
            console.warn(
                `[TagSync] Tag cardinality warning: ${tags.length} tags exceeds soft limit of ${TAG_GOVERNANCE.maxTagsPerEntity}`
            );
        }

        // Check forbidden patterns
        for (const tag of tags) {
            for (const pattern of TAG_GOVERNANCE.forbiddenPatterns) {
                if (pattern.test(tag)) {
                    throw new Error(`Forbidden tag pattern: ${tag}`);
                }
            }
        }
    }

    /**
     * Get current tags for an entity (from ownership, not cache)
     */
    async getCurrentTags(entityType: string, entityId: string): Promise<string[]> {
        const ownerships = await db
            .select()
            .from(entityOwnerships)
            .where(
                and(
                    eq(entityOwnerships.entityType, entityType),
                    eq(entityOwnerships.entityId, entityId)
                )
            );

        return ownerships.map((o) => `${o.scopeType}:${o.scopeId}`);
    }
}

// Singleton instance
export const tagSyncService = new TagSyncService();
