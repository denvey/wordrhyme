/**
 * LBAC Relationships Plugin - Server Entry
 *
 * Provides dynamic relationship-based access for LBAC:
 * - Followers can see follower-only content
 * - Collaborators can access shared documents
 * - Subscribers can view premium content
 *
 * Uses SQL discovery (EXISTS) instead of storing user IDs in aclTags.
 * This handles high-cardinality relationships (100k+ followers) efficiently.
 *
 * @see Frozen Spec: plugin-social (renamed to plugin-relationships)
 */
import type { PluginContext, PluginDatabaseCapability } from '@wordrhyme/plugin';
import * as schemaExports from '../schema';

/**
 * Plugin schema export - discovered by PluginManager for DDL generation
 */
export const schema = schemaExports;

/**
 * Relationship Types
 */
export const RelationshipType = {
    FOLLOW: 'follow',
    COLLABORATE: 'collaborate',
    SUBSCRIBE: 'subscribe',
    SHARE: 'share',
} as const;

export type RelationshipTypeValue = typeof RelationshipType[keyof typeof RelationshipType];

/**
 * Visibility Tags (used in aclTags)
 */
export const VisibilityTag = {
    FOLLOWERS: 'visibility:followers',
    COLLABORATORS: 'visibility:collaborators',
    SUBSCRIBERS: 'visibility:subscribers',
    SHARED: 'visibility:shared',
} as const;

/**
 * Relationship info
 */
interface Relationship {
    id: string;
    type: string;
    sourceId: string;
    targetId: string;
}

/**
 * Discovery SQL Builders
 *
 * These generate SQL for lbacQuery().withDiscovery()
 */
export const discoveryBuilders = {
    /**
     * Followers can see content where:
     * - Content has visibility:followers tag
     * - Current user follows the content owner
     */
    followers: (userId: string, ownerIdColumn: string) => `
        EXISTS (
            SELECT 1 FROM relationship
            WHERE type = 'follow'
              AND source_id = '${userId}'
              AND target_id = ${ownerIdColumn}
        )
    `,

    /**
     * Collaborators can see content where:
     * - Content has visibility:collaborators tag
     * - Current user collaborates with the content owner
     */
    collaborators: (userId: string, ownerIdColumn: string) => `
        EXISTS (
            SELECT 1 FROM relationship
            WHERE type = 'collaborate'
              AND source_id = '${userId}'
              AND target_id = ${ownerIdColumn}
        )
    `,

    /**
     * Subscribers can see content where:
     * - Content has visibility:subscribers tag
     * - Current user subscribes to the content owner
     */
    subscribers: (userId: string, ownerIdColumn: string) => `
        EXISTS (
            SELECT 1 FROM relationship
            WHERE type = 'subscribe'
              AND source_id = '${userId}'
              AND target_id = ${ownerIdColumn}
        )
    `,

    /**
     * Shared content where:
     * - Content was directly shared with the user
     */
    shared: (userId: string, entityType: string, entityIdColumn: string) => `
        EXISTS (
            SELECT 1 FROM relationship
            WHERE type = 'share'
              AND source_id = ${entityIdColumn}
              AND target_id = '${userId}'
        )
    `,
};

/**
 * Relationship Service
 */
class RelationshipService {
    constructor(private ctx: PluginContext) {}

    /**
     * Create a relationship
     */
    async create(
        type: RelationshipTypeValue,
        sourceId: string,
        targetId: string,
        metadata?: Record<string, unknown>
    ): Promise<Relationship> {
        if (!this.ctx.db) {
            throw new Error('Database capability not available');
        }

        const result = await (this.ctx.db as PluginDatabaseCapability).raw<Relationship[]>(`
            INSERT INTO relationship (id, type, source_id, target_id, organization_id, metadata)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
            ON CONFLICT (type, source_id, target_id) DO NOTHING
            RETURNING id, type, source_id as "sourceId", target_id as "targetId"
        `, [type, sourceId, targetId, this.ctx.organizationId, metadata ? JSON.stringify(metadata) : null]);

        return result[0];
    }

    /**
     * Remove a relationship
     */
    async remove(
        type: RelationshipTypeValue,
        sourceId: string,
        targetId: string
    ): Promise<boolean> {
        if (!this.ctx.db) {
            throw new Error('Database capability not available');
        }

        const result = await (this.ctx.db as PluginDatabaseCapability).raw<{ count: number }[]>(`
            DELETE FROM relationship
            WHERE type = $1 AND source_id = $2 AND target_id = $3
            RETURNING 1
        `, [type, sourceId, targetId]);

        return result.length > 0;
    }

    /**
     * Check if relationship exists
     */
    async exists(
        type: RelationshipTypeValue,
        sourceId: string,
        targetId: string
    ): Promise<boolean> {
        if (!this.ctx.db) {
            throw new Error('Database capability not available');
        }

        const result = await (this.ctx.db as PluginDatabaseCapability).raw<{ exists: boolean }[]>(`
            SELECT EXISTS (
                SELECT 1 FROM relationship
                WHERE type = $1 AND source_id = $2 AND target_id = $3
            ) as exists
        `, [type, sourceId, targetId]);

        return result[0]?.exists ?? false;
    }

    /**
     * Get all relationships of a type for a source
     */
    async getBySource(
        type: RelationshipTypeValue,
        sourceId: string
    ): Promise<Relationship[]> {
        if (!this.ctx.db) {
            throw new Error('Database capability not available');
        }

        return (this.ctx.db as PluginDatabaseCapability).raw<Relationship[]>(`
            SELECT id, type, source_id as "sourceId", target_id as "targetId"
            FROM relationship
            WHERE type = $1 AND source_id = $2
        `, [type, sourceId]);
    }

    /**
     * Get all relationships of a type for a target
     */
    async getByTarget(
        type: RelationshipTypeValue,
        targetId: string
    ): Promise<Relationship[]> {
        if (!this.ctx.db) {
            throw new Error('Database capability not available');
        }

        return (this.ctx.db as PluginDatabaseCapability).raw<Relationship[]>(`
            SELECT id, type, source_id as "sourceId", target_id as "targetId"
            FROM relationship
            WHERE type = $1 AND target_id = $2
        `, [type, targetId]);
    }

    /**
     * Count relationships
     */
    async count(
        type: RelationshipTypeValue,
        targetId: string
    ): Promise<number> {
        if (!this.ctx.db) {
            throw new Error('Database capability not available');
        }

        const result = await (this.ctx.db as PluginDatabaseCapability).raw<{ count: string }[]>(`
            SELECT COUNT(*) as count
            FROM relationship
            WHERE type = $1 AND target_id = $2
        `, [type, targetId]);

        return parseInt(result[0]?.count ?? '0', 10);
    }
}

/**
 * Lifecycle: onEnable
 */
export async function onEnable(ctx: PluginContext) {
    // Note: Plugin services API is not yet available in PluginContext
    // This is a placeholder for when the services capability is added
    //
    // Expected API:
    // ctx.services.set('relationships', new RelationshipService(ctx))
    // ctx.services.set('relationshipDiscovery', discoveryBuilders)

    ctx.logger.info('[lbac-relationships] Plugin enabled (Services API pending)');
    ctx.logger.info('[lbac-relationships] Available relationship types: follow, collaborate, subscribe, share');
}

/**
 * Lifecycle: onDisable
 */
export async function onDisable(ctx: PluginContext) {
    // Cleanup services when available
    ctx.logger.info('[lbac-relationships] Plugin disabled');
}

// Export types and utilities
export { RelationshipService };
