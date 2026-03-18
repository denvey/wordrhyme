import { describe, it, expect } from 'vitest';
import {
    canTransition,
    assertValidTransition,
    getValidTransitions,
    isTerminalStatus,
    buildCancelNote,
    buildRefundNote,
} from '../order.service';

describe('canTransition', () => {
    it('should allow valid transitions', () => {
        expect(canTransition('pending', 'processing')).toEqual({
            allowed: true,
            validTargets: ['processing', 'canceled'],
        });
        expect(canTransition('paid', 'fulfilled')).toEqual({
            allowed: true,
            validTargets: ['fulfilled', 'canceled', 'refunded'],
        });
    });

    it('should reject invalid transitions', () => {
        const result = canTransition('pending', 'fulfilled');
        expect(result.allowed).toBe(false);
    });

    it('should reject transitions from terminal states', () => {
        expect(canTransition('canceled', 'pending').allowed).toBe(false);
        expect(canTransition('refunded', 'pending').allowed).toBe(false);
    });

    it('should allow refund from completed', () => {
        expect(canTransition('completed', 'refunded').allowed).toBe(true);
    });
});

describe('assertValidTransition', () => {
    it('should not throw for valid transitions', () => {
        expect(() => assertValidTransition('pending', 'processing')).not.toThrow();
        expect(() => assertValidTransition('paid', 'refunded')).not.toThrow();
    });

    it('should throw with descriptive message for invalid transitions', () => {
        expect(() => assertValidTransition('pending', 'completed')).toThrow(
            'Invalid status transition: pending → completed',
        );
    });

    it('should include valid targets in error message', () => {
        try {
            assertValidTransition('pending', 'fulfilled');
        } catch (e) {
            expect((e as Error).message).toContain('processing, canceled');
        }
    });
});

describe('getValidTransitions', () => {
    it('should return valid targets for each status', () => {
        expect(getValidTransitions('pending')).toEqual(['processing', 'canceled']);
        expect(getValidTransitions('fulfilled')).toEqual(['completed', 'refunded']);
    });

    it('should return empty array for terminal states', () => {
        expect(getValidTransitions('canceled')).toEqual([]);
        expect(getValidTransitions('refunded')).toEqual([]);
    });
});

describe('isTerminalStatus', () => {
    it('should return true for canceled and refunded', () => {
        expect(isTerminalStatus('canceled')).toBe(true);
        expect(isTerminalStatus('refunded')).toBe(true);
    });

    it('should return false for non-terminal statuses', () => {
        expect(isTerminalStatus('pending')).toBe(false);
        expect(isTerminalStatus('paid')).toBe(false);
        expect(isTerminalStatus('fulfilled')).toBe(false);
    });
});

describe('buildCancelNote', () => {
    it('should append reason to existing note', () => {
        expect(buildCancelNote('Original note', 'Customer request')).toBe(
            'Original note\nCancel reason: Customer request',
        );
    });

    it('should create note from reason only', () => {
        expect(buildCancelNote(undefined, 'Out of stock')).toBe('Cancel reason: Out of stock');
    });

    it('should return existing note when no reason', () => {
        expect(buildCancelNote('Existing', undefined)).toBe('Existing');
    });

    it('should return undefined when both are empty', () => {
        expect(buildCancelNote(undefined, undefined)).toBeUndefined();
    });
});

describe('buildRefundNote', () => {
    it('should build full refund note', () => {
        const note = buildRefundNote('Order note', '50.00', 'Defective item');
        expect(note).toBe('Order note\nRefund amount: 50.00\nRefund reason: Defective item');
    });

    it('should handle partial info', () => {
        expect(buildRefundNote(undefined, '30.00', undefined)).toBe('Refund amount: 30.00');
        expect(buildRefundNote(undefined, undefined, 'Wrong item')).toBe('Refund reason: Wrong item');
    });

    it('should return undefined when all empty', () => {
        expect(buildRefundNote(undefined, undefined, undefined)).toBeUndefined();
    });
});
