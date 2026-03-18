/**
 * @wordrhyme/shop-core - Order Service
 *
 * Pure business logic for order management.
 * Implements order status machine and transition rules.
 * No I/O, no framework dependencies.
 */
import type { OrderStatus, StatusTransitionResult } from './types';

// ============================================================
// Order Status Machine
// ============================================================

const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    pending: ['processing', 'canceled'],
    processing: ['paid', 'canceled'],
    paid: ['fulfilled', 'canceled', 'refunded'],
    fulfilled: ['completed', 'refunded'],
    completed: ['refunded'],
    canceled: [],
    refunded: [],
};

/**
 * Check if a status transition is valid
 */
export function canTransition(current: OrderStatus, target: OrderStatus): StatusTransitionResult {
    const allowed = VALID_ORDER_TRANSITIONS[current] ?? [];
    return {
        allowed: allowed.includes(target),
        validTargets: allowed,
    };
}

/**
 * Assert a status transition is valid, throw if not
 */
export function assertValidTransition(currentStatus: string, targetStatus: string): void {
    const result = canTransition(currentStatus as OrderStatus, targetStatus as OrderStatus);
    if (!result.allowed) {
        throw new Error(
            `Invalid status transition: ${currentStatus} → ${targetStatus}. Valid targets: [${result.validTargets.join(', ')}]`,
        );
    }
}

/**
 * Get all valid target statuses from the current status
 */
export function getValidTransitions(current: OrderStatus): OrderStatus[] {
    return VALID_ORDER_TRANSITIONS[current] ?? [];
}

/**
 * Check if an order is in a terminal state (no further transitions)
 */
export function isTerminalStatus(status: OrderStatus): boolean {
    return getValidTransitions(status).length === 0;
}

/**
 * Build cancel note by appending reason to existing note
 */
export function buildCancelNote(existingNote: string | undefined, reason: string | undefined): string | undefined {
    if (!reason) return existingNote;
    const parts = [existingNote, `Cancel reason: ${reason}`].filter(Boolean);
    return parts.length > 0 ? parts.join('\n') : undefined;
}

/**
 * Build refund note by appending amount and reason to existing note
 */
export function buildRefundNote(
    existingNote: string | undefined,
    amount: string | undefined,
    reason: string | undefined,
): string | undefined {
    const parts: string[] = [];
    if (existingNote) parts.push(existingNote);
    if (amount) parts.push(`Refund amount: ${amount}`);
    if (reason) parts.push(`Refund reason: ${reason}`);
    return parts.length > 0 ? parts.join('\n') : undefined;
}
