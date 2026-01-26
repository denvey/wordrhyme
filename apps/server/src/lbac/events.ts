/**
 * Ownership Events - Event-driven tag synchronization
 *
 * All ownership changes emit events that trigger TagSyncService.
 * This ensures aclTags are ALWAYS in sync with entity_ownerships.
 *
 * ⚠️ Engineering Constraint:
 * - NEVER modify entity_ownerships directly
 * - ALWAYS use OwnershipRepository
 * - NEVER modify aclTags on business tables directly
 * - ALWAYS let TagSyncService handle tag updates
 */
import { EventEmitter } from 'events';

/**
 * Ownership Event Types
 */
export const OwnershipEventType = {
    CREATED: 'ownership.created',
    UPDATED: 'ownership.updated',
    DELETED: 'ownership.deleted',
    BULK_CREATED: 'ownership.bulk_created',
    BULK_DELETED: 'ownership.bulk_deleted',
    INHERITANCE_EXPANDED: 'ownership.inheritance_expanded',
    INHERITANCE_COLLAPSED: 'ownership.inheritance_collapsed',
} as const;

export type OwnershipEventTypeValue = typeof OwnershipEventType[keyof typeof OwnershipEventType];

/**
 * Ownership Event Payload
 */
export interface OwnershipEventPayload {
    entityType: string;
    entityId: string;
    scopeType: string;
    scopeId: string;
    level?: string | undefined;
    inheritedFromType?: string | null | undefined;
    inheritedFromId?: string | null | undefined;
    organizationId: string;
}

/**
 * Ownership Event
 */
export interface OwnershipEvent {
    type: OwnershipEventTypeValue;
    payload: OwnershipEventPayload | OwnershipEventPayload[];
    timestamp: Date;
    actorId: string;
    actorType: 'user' | 'system' | 'plugin';
}

/**
 * Global Ownership Event Emitter
 *
 * Singleton for ownership events across the application.
 */
class OwnershipEventEmitter extends EventEmitter {
    private static instance: OwnershipEventEmitter;

    private constructor() {
        super();
        // Increase max listeners for large-scale operations
        this.setMaxListeners(100);
    }

    static getInstance(): OwnershipEventEmitter {
        if (!OwnershipEventEmitter.instance) {
            OwnershipEventEmitter.instance = new OwnershipEventEmitter();
        }
        return OwnershipEventEmitter.instance;
    }

    /**
     * Emit ownership event
     */
    emitOwnershipEvent(event: OwnershipEvent): void {
        this.emit(event.type, event);
        // Also emit a generic event for catch-all handlers
        this.emit('ownership.*', event);
    }

    /**
     * Subscribe to ownership events
     */
    onOwnershipEvent(
        type: OwnershipEventTypeValue | 'ownership.*',
        handler: (event: OwnershipEvent) => void | Promise<void>
    ): void {
        this.on(type, handler);
    }

    /**
     * Unsubscribe from ownership events
     */
    offOwnershipEvent(
        type: OwnershipEventTypeValue | 'ownership.*',
        handler: (event: OwnershipEvent) => void | Promise<void>
    ): void {
        this.off(type, handler);
    }
}

export const ownershipEvents = OwnershipEventEmitter.getInstance();
