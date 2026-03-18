/**
 * Ownership Inheritance Service - Write-time inheritance expansion
 *
 * Handles inheritance logic for Teams, Spaces, and other scopes.
 *
 * ⚠️ CRITICAL RULES:
 * 1. Inheritance is ALWAYS expanded at WRITE time
 * 2. Inheritance is NEVER resolved at READ time
 * 3. Deny ALWAYS blocks inheritance expansion
 * 4. All inherited ownerships track their source (inheritedFromType/Id)
 *
 * @see Frozen Spec: Ownership Inheritance Expansion
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { entityOwnerships } from '@wordrhyme/db';
import { ownershipRepository, type GrantOptions } from './ownership-repository';
import { ownershipEvents, OwnershipEventType } from './events';
import { getContext } from '../context/async-local-storage';

/**
 * Scope Member interface
 */
export interface ScopeMember {
    type: 'user' | 'team' | 'role';
    id: string;
}

/**
 * Scope Member Provider interface (for plugins to implement)
 */
export interface ScopeMemberProvider {
    scopeType: string;
    getMembers(scopeId: string): Promise<ScopeMember[]>;
}

/**
 * Deny Check Result
 */
interface DenyCheckResult {
    deniedScopes: Set<string>;
}

/**
 * Ownership Inheritance Service
 */
export class OwnershipInheritanceService {
    private memberProviders: Map<string, ScopeMemberProvider> = new Map();

    /**
     * Register a scope member provider (plugin extension point)
     *
     * Example:
     * ```typescript
     * // plugin-teams registers:
     * inheritanceService.registerMemberProvider({
     *   scopeType: 'team',
     *   async getMembers(teamId) {
     *     const members = await getTeamMembers(teamId);
     *     return members.map(m => ({ type: 'user', id: m.userId }));
     *   }
     * });
     * ```
     */
    registerMemberProvider(provider: ScopeMemberProvider): void {
        this.memberProviders.set(provider.scopeType, provider);
    }

    /**
     * Grant access with inheritance expansion
     *
     * When granting to a Team/Space, automatically expand to all members.
     */
    async grantWithInheritance(
        entityType: string,
        entityId: string,
        scopeType: string,
        scopeId: string,
        level: 'read' | 'write' = 'read'
    ): Promise<void> {
        const { actorId, actorType } = this.getActorInfo();

        // 1. Grant direct ownership
        await ownershipRepository.grant({
            entityType,
            entityId,
            scopeType,
            scopeId,
            level,
        });

        // 2. Check if this scope type supports inheritance
        const provider = this.memberProviders.get(scopeType);
        if (!provider) {
            // No inheritance for this scope type
            return;
        }

        // 3. Get denied scopes (deny blocks inheritance)
        const { deniedScopes } = await this.getDeniedScopes(entityType, entityId);

        // 4. Get members and expand
        const members = await provider.getMembers(scopeId);
        const inheritedGrants: GrantOptions[] = [];

        for (const member of members) {
            const memberKey = `${member.type}:${member.id}`;

            // ❌ Skip if member is denied
            if (deniedScopes.has(memberKey)) {
                continue;
            }

            inheritedGrants.push({
                entityType,
                entityId,
                scopeType: member.type,
                scopeId: member.id,
                level,
                inheritedFromType: scopeType,
                inheritedFromId: scopeId,
            });
        }

        // 5. Bulk create inherited ownerships
        if (inheritedGrants.length > 0) {
            await ownershipRepository.bulkGrant(inheritedGrants);

            // Emit inheritance expanded event
            ownershipEvents.emitOwnershipEvent({
                type: OwnershipEventType.INHERITANCE_EXPANDED,
                payload: inheritedGrants.map((g) => ({
                    entityType: g.entityType,
                    entityId: g.entityId,
                    scopeType: g.scopeType,
                    scopeId: g.scopeId,
                    level: g.level,
                    inheritedFromType: g.inheritedFromType,
                    inheritedFromId: g.inheritedFromId,
                    organizationId: this.getActorInfo().organizationId,
                })),
                timestamp: new Date(),
                actorId,
                actorType,
            });
        }
    }

    /**
     * Revoke access with inheritance collapse
     *
     * When revoking from a Team/Space, also remove inherited ownerships.
     */
    async revokeWithInheritance(
        entityType: string,
        entityId: string,
        scopeType: string,
        scopeId: string
    ): Promise<void> {
        // 1. Revoke direct ownership
        await ownershipRepository.revoke({
            entityType,
            entityId,
            scopeType,
            scopeId,
        });

        // 2. Revoke all inherited ownerships from this scope
        await ownershipRepository.revokeInherited(
            scopeType,
            scopeId,
            entityType,
            entityId
        );
    }

    /**
     * Handle scope membership change
     *
     * When a user joins/leaves a Team/Space, re-expand inheritance.
     *
     * Called by plugins when membership changes:
     * ```typescript
     * // In plugin-teams:
     * async addTeamMember(teamId, userId) {
     *   await db.insert(teamMembers).values({ teamId, userId });
     *   await inheritanceService.onScopeMembershipChanged('team', teamId);
     * }
     * ```
     */
    async onScopeMembershipChanged(scopeType: string, scopeId: string): Promise<void> {
        const { actorId, actorType } = this.getActorInfo();

        // 1. Find all entities that have direct ownership from this scope
        const directOwnerships = await db
            .select()
            .from(entityOwnerships)
            .where(
                and(
                    eq(entityOwnerships.scopeType, scopeType),
                    eq(entityOwnerships.scopeId, scopeId),
                    // Only direct grants (not inherited)
                    eq(entityOwnerships.inheritedFromType, null as any)
                )
            );

        // 2. For each entity, re-expand inheritance
        for (const ownership of directOwnerships) {
            // Delete old inherited ownerships
            await ownershipRepository.revokeInherited(
                scopeType,
                scopeId,
                ownership.entityType,
                ownership.entityId
            );

            // Re-expand with current membership
            const provider = this.memberProviders.get(scopeType);
            if (!provider) continue;

            const { deniedScopes } = await this.getDeniedScopes(
                ownership.entityType,
                ownership.entityId
            );

            const members = await provider.getMembers(scopeId);
            const inheritedGrants: GrantOptions[] = [];

            for (const member of members) {
                const memberKey = `${member.type}:${member.id}`;
                if (deniedScopes.has(memberKey)) continue;

                inheritedGrants.push({
                    entityType: ownership.entityType,
                    entityId: ownership.entityId,
                    scopeType: member.type,
                    scopeId: member.id,
                    level: ownership.level as 'read' | 'write',
                    inheritedFromType: scopeType,
                    inheritedFromId: scopeId,
                });
            }

            if (inheritedGrants.length > 0) {
                await ownershipRepository.bulkGrant(inheritedGrants);
            }
        }
    }

    /**
     * Get denied scopes for an entity
     *
     * Used to block inheritance expansion for denied users/teams.
     */
    private async getDeniedScopes(
        entityType: string,
        entityId: string
    ): Promise<DenyCheckResult> {
        // Query denyTags from the business table
        // For now, return empty (to be implemented with actual table query)
        // TODO: Query business table for denyTags
        return { deniedScopes: new Set() };
    }

    /**
     * Get actor info from context
     */
    private getActorInfo(): {
        actorId: string;
        actorType: 'user' | 'system' | 'plugin';
        organizationId: string;
    } {
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
}

// Singleton instance
export const ownershipInheritanceService = new OwnershipInheritanceService();
