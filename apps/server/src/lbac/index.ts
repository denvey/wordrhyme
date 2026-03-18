/**
 * LBAC Module - Unified exports
 *
 * This module provides the complete LBAC (Label-Based Access Control) system.
 *
 * Architecture:
 * - Write Model: entity_ownerships (Source of Truth)
 * - Read Model: aclTags/denyTags on business tables (Cache)
 * - Sync: TagSyncService (Event-driven)
 *
 * Usage:
 * ```typescript
 * import {
 *   ownershipRepository,      // Grant/revoke access
 *   lbacQuery,                // Query with auto-filtering
 *   keyBuilder,               // Build user keys
 *   tagSyncService,           // Manual tag refresh
 * } from './lbac';
 *
 * // Grant access
 * await ownershipRepository.grant({
 *   entityType: 'article',
 *   entityId: 'a1',
 *   scopeType: 'team',
 *   scopeId: 't1',
 * });
 *
 * // Query with LBAC
 * const articles = await lbacQuery(articlesTable)
 *   .where(eq(articlesTable.status, 'published'))
 *   .execute();
 * ```
 *
 * @see Frozen Spec: Hybrid CQRS + LBAC
 */

// Core abstractions
export { keyBuilder, KeyBuilder, type KeyProvider, type KeyBuilderContext } from './key-builder';

// Events
export {
    ownershipEvents,
    OwnershipEventType,
    type OwnershipEvent,
    type OwnershipEventPayload,
} from './events';

// Repository (Write operations)
export {
    ownershipRepository,
    OwnershipRepository,
    type GrantOptions,
    type RevokeOptions,
} from './ownership-repository';

// Tag Sync (Event-driven cache update)
export {
    tagSyncService,
    TagSyncService,
    TAG_GOVERNANCE,
} from './tag-sync-service';

// Inheritance (Write-time expansion)
export {
    ownershipInheritanceService,
    OwnershipInheritanceService,
    type ScopeMember,
    type ScopeMemberProvider,
} from './ownership-inheritance-service';
