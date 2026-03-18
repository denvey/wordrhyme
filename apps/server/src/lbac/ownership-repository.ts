/**
 * Ownership Repository - ONLY entry point for ownership mutations
 *
 * ⚠️ MANDATORY USAGE:
 * - All ownership grants/revokes MUST go through this repository
 * - Direct DB access to entity_ownerships is FORBIDDEN
 * - This ensures events are always emitted for TagSync
 *
 * @see Frozen Spec: Write Model (Source of Truth)
 */
import { eq, and, inArray, lte, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import {
    entityOwnerships,
    ownershipAuditLog,
    type EntityOwnership,
    type EntityOwnershipInsert,
    ScopeType,
    AccessLevel,
} from '@wordrhyme/db';
import { ownershipEvents, OwnershipEventType, type OwnershipEventPayload } from './events';
import { getContext } from '../context/async-local-storage';

/**
 * Grant Options
 */
export interface GrantOptions {
    entityType: string;
    entityId: string;
    scopeType: string;
    scopeId: string;
    level?: 'read' | 'write';
    inheritedFromType?: string;
    inheritedFromId?: string;
    expireAt?: Date;
}

/**
 * Revoke Options
 */
export interface RevokeOptions {
    entityType: string;
    entityId: string;
    scopeType: string;
    scopeId: string;
}

/**
 * Ownership Repository
 */
export class OwnershipRepository {
    private getActorInfo(): { actorId: string; actorType: 'user' | 'system' | 'plugin'; organizationId: string } {
        try {
            const ctx = getContext();
            return {
                actorId: ctx.userId ?? 'system',
                actorType: ctx.userId ? 'user' : 'system',
                organizationId: ctx.organizationId ?? '',
            };
        } catch {
            return {
                actorId: 'system',
                actorType: 'system',
                organizationId: '',
            };
        }
    }

    /**
     * Grant access to an entity
     */
    async grant(options: GrantOptions): Promise<EntityOwnership> {
        const { actorId, actorType, organizationId } = this.getActorInfo();

        const data: EntityOwnershipInsert = {
            entityType: options.entityType,
            entityId: options.entityId,
            scopeType: options.scopeType,
            scopeId: options.scopeId,
            level: options.level ?? AccessLevel.READ,
            inheritedFromType: options.inheritedFromType ?? null,
            inheritedFromId: options.inheritedFromId ?? null,
            expireAt: options.expireAt ?? null,
            organizationId,
            createdBy: actorId,
        };

        // Upsert (update if exists)
        const result = await db
            .insert(entityOwnerships)
            .values(data)
            .onConflictDoUpdate({
                target: [
                    entityOwnerships.entityType,
                    entityOwnerships.entityId,
                    entityOwnerships.scopeType,
                    entityOwnerships.scopeId,
                ],
                set: {
                    level: data.level,
                    inheritedFromType: data.inheritedFromType,
                    inheritedFromId: data.inheritedFromId,
                    expireAt: data.expireAt,
                    updatedAt: new Date(),
                },
            })
            .returning();

        const ownership = result[0];
        if (!ownership) {
            throw new Error('Failed to create ownership');
        }

        // Emit event
        ownershipEvents.emitOwnershipEvent({
            type: OwnershipEventType.CREATED,
            payload: {
                entityType: ownership.entityType,
                entityId: ownership.entityId,
                scopeType: ownership.scopeType,
                scopeId: ownership.scopeId,
                level: ownership.level,
                inheritedFromType: ownership.inheritedFromType ?? undefined,
                inheritedFromId: ownership.inheritedFromId ?? undefined,
                organizationId: ownership.organizationId,
            },
            timestamp: new Date(),
            actorId,
            actorType,
        });

        // Audit log
        await this.logAudit({
            ownershipId: ownership.id,
            entityType: ownership.entityType,
            entityId: ownership.entityId,
            scopeType: ownership.scopeType,
            scopeId: ownership.scopeId,
            action: 'grant',
            afterState: ownership,
            actorId,
            actorType,
            organizationId,
        });

        return ownership;
    }

    /**
     * Bulk grant access
     */
    async bulkGrant(grants: GrantOptions[]): Promise<EntityOwnership[]> {
        if (grants.length === 0) return [];

        const { actorId, actorType, organizationId } = this.getActorInfo();

        const data: EntityOwnershipInsert[] = grants.map((g) => ({
            entityType: g.entityType,
            entityId: g.entityId,
            scopeType: g.scopeType,
            scopeId: g.scopeId,
            level: g.level ?? AccessLevel.READ,
            inheritedFromType: g.inheritedFromType ?? null,
            inheritedFromId: g.inheritedFromId ?? null,
            expireAt: g.expireAt ?? null,
            organizationId,
            createdBy: actorId,
        }));

        const ownerships = await db
            .insert(entityOwnerships)
            .values(data)
            .onConflictDoNothing()
            .returning();

        // Emit bulk event
        if (ownerships.length > 0) {
            ownershipEvents.emitOwnershipEvent({
                type: OwnershipEventType.BULK_CREATED,
                payload: ownerships.map((o) => ({
                    entityType: o.entityType,
                    entityId: o.entityId,
                    scopeType: o.scopeType,
                    scopeId: o.scopeId,
                    level: o.level,
                    inheritedFromType: o.inheritedFromType,
                    inheritedFromId: o.inheritedFromId,
                    organizationId: o.organizationId,
                })),
                timestamp: new Date(),
                actorId,
                actorType,
            });
        }

        return ownerships;
    }

    /**
     * Revoke access from an entity
     */
    async revoke(options: RevokeOptions): Promise<EntityOwnership | null> {
        const { actorId, actorType, organizationId } = this.getActorInfo();

        const [deleted] = await db
            .delete(entityOwnerships)
            .where(
                and(
                    eq(entityOwnerships.entityType, options.entityType),
                    eq(entityOwnerships.entityId, options.entityId),
                    eq(entityOwnerships.scopeType, options.scopeType),
                    eq(entityOwnerships.scopeId, options.scopeId)
                )
            )
            .returning();

        if (deleted) {
            // Emit event
            ownershipEvents.emitOwnershipEvent({
                type: OwnershipEventType.DELETED,
                payload: {
                    entityType: deleted.entityType,
                    entityId: deleted.entityId,
                    scopeType: deleted.scopeType,
                    scopeId: deleted.scopeId,
                    organizationId: deleted.organizationId,
                },
                timestamp: new Date(),
                actorId,
                actorType,
            });

            // Audit log
            await this.logAudit({
                ownershipId: deleted.id,
                entityType: deleted.entityType,
                entityId: deleted.entityId,
                scopeType: deleted.scopeType,
                scopeId: deleted.scopeId,
                action: 'revoke',
                beforeState: deleted,
                actorId,
                actorType,
                organizationId,
            });
        }

        return deleted ?? null;
    }

    /**
     * Revoke all inherited ownerships from a scope
     */
    async revokeInherited(
        inheritedFromType: string,
        inheritedFromId: string,
        entityType?: string,
        entityId?: string
    ): Promise<EntityOwnership[]> {
        const { actorId, actorType, organizationId } = this.getActorInfo();

        let query = and(
            eq(entityOwnerships.inheritedFromType, inheritedFromType),
            eq(entityOwnerships.inheritedFromId, inheritedFromId)
        );

        if (entityType && entityId) {
            query = and(
                query,
                eq(entityOwnerships.entityType, entityType),
                eq(entityOwnerships.entityId, entityId)
            );
        }

        const deleted = await db.delete(entityOwnerships).where(query!).returning();

        if (deleted.length > 0) {
            ownershipEvents.emitOwnershipEvent({
                type: OwnershipEventType.INHERITANCE_COLLAPSED,
                payload: deleted.map((o) => ({
                    entityType: o.entityType,
                    entityId: o.entityId,
                    scopeType: o.scopeType,
                    scopeId: o.scopeId,
                    inheritedFromType: o.inheritedFromType,
                    inheritedFromId: o.inheritedFromId,
                    organizationId: o.organizationId,
                })),
                timestamp: new Date(),
                actorId,
                actorType,
            });
        }

        return deleted;
    }

    /**
     * Get all ownerships for an entity
     */
    async getByEntity(entityType: string, entityId: string): Promise<EntityOwnership[]> {
        return db
            .select()
            .from(entityOwnerships)
            .where(
                and(
                    eq(entityOwnerships.entityType, entityType),
                    eq(entityOwnerships.entityId, entityId)
                )
            );
    }

    /**
     * Get all ownerships for a scope (what can this user/team access?)
     */
    async getByScope(scopeType: string, scopeId: string): Promise<EntityOwnership[]> {
        return db
            .select()
            .from(entityOwnerships)
            .where(
                and(
                    eq(entityOwnerships.scopeType, scopeType),
                    eq(entityOwnerships.scopeId, scopeId)
                )
            );
    }

    /**
     * Check if scope has access to entity
     */
    async hasAccess(
        entityType: string,
        entityId: string,
        scopeType: string,
        scopeId: string,
        requiredLevel?: 'read' | 'write'
    ): Promise<boolean> {
        const ownership = await db
            .select()
            .from(entityOwnerships)
            .where(
                and(
                    eq(entityOwnerships.entityType, entityType),
                    eq(entityOwnerships.entityId, entityId),
                    eq(entityOwnerships.scopeType, scopeType),
                    eq(entityOwnerships.scopeId, scopeId)
                )
            )
            .limit(1);

        if (ownership.length === 0) return false;

        const first = ownership[0];
        if (requiredLevel === 'write') {
            return first?.level === 'write';
        }

        return true;
    }

    /**
     * Clean up expired ownerships
     */
    async cleanupExpired(): Promise<number> {
        const expired = await db
            .delete(entityOwnerships)
            .where(
                and(
                    lte(entityOwnerships.expireAt, new Date()),
                    isNotNull(entityOwnerships.expireAt)
                )
            )
            .returning();

        for (const ownership of expired) {
            await this.logAudit({
                ownershipId: ownership.id,
                entityType: ownership.entityType,
                entityId: ownership.entityId,
                scopeType: ownership.scopeType,
                scopeId: ownership.scopeId,
                action: 'expire',
                beforeState: ownership,
                actorId: 'system',
                actorType: 'system',
                organizationId: ownership.organizationId,
            });
        }

        return expired.length;
    }

    /**
     * Log audit entry
     */
    private async logAudit(data: {
        ownershipId: string;
        entityType: string;
        entityId: string;
        scopeType: string;
        scopeId: string;
        action: string;
        beforeState?: unknown;
        afterState?: unknown;
        actorId: string;
        actorType: string;
        organizationId: string;
        reason?: string;
    }): Promise<void> {
        await db.insert(ownershipAuditLog).values({
            ownershipId: data.ownershipId,
            entityType: data.entityType,
            entityId: data.entityId,
            scopeType: data.scopeType,
            scopeId: data.scopeId,
            action: data.action,
            beforeState: data.beforeState ?? null,
            afterState: data.afterState ?? null,
            actorId: data.actorId,
            actorType: data.actorType,
            organizationId: data.organizationId,
            reason: data.reason ?? null,
        });
    }
}

// Singleton instance
export const ownershipRepository = new OwnershipRepository();
