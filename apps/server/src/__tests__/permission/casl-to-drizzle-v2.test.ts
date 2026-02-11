/**
 * CASL to Drizzle v2 Converter Tests
 */

import { describe, it, expect } from 'vitest';
import {
    caslToDrizzleV2,
    buildCombinedAbacDrizzleV2,
    mergeWhereAnd,
    mergeWhereOr,
} from '../../permission/casl-to-drizzle-v2';
import type { AbilityUserContext } from '../../permission/casl-ability';

describe('caslToDrizzleV2', () => {
    const userContext: AbilityUserContext = {
        id: 'user-123',
        organizationId: 'org-456',
        currentTeamId: 'team-789',
    };

    describe('simple values', () => {
        it('converts simple string equality', () => {
            const result = caslToDrizzleV2({ status: 'active' }, userContext);
            expect(result.success).toBe(true);
            expect(result.where).toEqual({ status: 'active' });
        });

        it('converts simple number equality', () => {
            const result = caslToDrizzleV2({ count: 10 }, userContext);
            expect(result.success).toBe(true);
            expect(result.where).toEqual({ count: 10 });
        });

        it('converts template variables', () => {
            const result = caslToDrizzleV2({ ownerId: '${user.id}' }, userContext);
            expect(result.success).toBe(true);
            expect(result.where).toEqual({ ownerId: 'user-123' });
        });

        it('converts multiple fields', () => {
            const result = caslToDrizzleV2(
                { status: 'active', ownerId: '${user.id}' },
                userContext
            );
            expect(result.success).toBe(true);
            expect(result.where).toEqual({ status: 'active', ownerId: 'user-123' });
        });
    });

    describe('comparison operators', () => {
        it('converts $eq', () => {
            const result = caslToDrizzleV2({ age: { $eq: 25 } }, userContext);
            expect(result.success).toBe(true);
            expect(result.where).toEqual({ age: { eq: 25 } });
        });

        it('converts $ne', () => {
            const result = caslToDrizzleV2({ status: { $ne: 'deleted' } }, userContext);
            expect(result.success).toBe(true);
            expect(result.where).toEqual({ status: { ne: 'deleted' } });
        });

        it('converts $gt, $gte, $lt, $lte', () => {
            const result = caslToDrizzleV2(
                { score: { $gt: 50, $lte: 100 } },
                userContext
            );
            expect(result.success).toBe(true);
            expect(result.where).toEqual({ score: { gt: 50, lte: 100 } });
        });

        it('converts $in', () => {
            const result = caslToDrizzleV2(
                { status: { $in: ['draft', 'published'] } },
                userContext
            );
            expect(result.success).toBe(true);
            expect(result.where).toEqual({ status: { in: ['draft', 'published'] } });
        });

        it('converts $nin to notIn', () => {
            const result = caslToDrizzleV2(
                { status: { $nin: ['deleted', 'archived'] } },
                userContext
            );
            expect(result.success).toBe(true);
            expect(result.where).toEqual({ status: { notIn: ['deleted', 'archived'] } });
        });
    });

    describe('$exists operator', () => {
        it('converts $exists: true to isNotNull', () => {
            const result = caslToDrizzleV2({ verifiedAt: { $exists: true } }, userContext);
            expect(result.success).toBe(true);
            expect(result.where).toEqual({ verifiedAt: { isNotNull: true } });
        });

        it('converts $exists: false to isNull', () => {
            const result = caslToDrizzleV2({ deletedAt: { $exists: false } }, userContext);
            expect(result.success).toBe(true);
            expect(result.where).toEqual({ deletedAt: { isNull: true } });
        });
    });

    describe('logical operators', () => {
        it('converts $and', () => {
            const result = caslToDrizzleV2(
                {
                    $and: [
                        { status: 'active' },
                        { ownerId: '${user.id}' },
                    ],
                },
                userContext
            );
            expect(result.success).toBe(true);
            expect(result.where).toEqual({
                AND: [
                    { status: 'active' },
                    { ownerId: 'user-123' },
                ],
            });
        });

        it('converts $or', () => {
            const result = caslToDrizzleV2(
                {
                    $or: [
                        { visibility: 'public' },
                        { ownerId: '${user.id}' },
                    ],
                },
                userContext
            );
            expect(result.success).toBe(true);
            expect(result.where).toEqual({
                OR: [
                    { visibility: 'public' },
                    { ownerId: 'user-123' },
                ],
            });
        });

        it('converts $not', () => {
            const result = caslToDrizzleV2(
                {
                    $not: { status: 'deleted' },
                },
                userContext
            );
            expect(result.success).toBe(true);
            expect(result.where).toEqual({
                NOT: { status: 'deleted' },
            });
        });

        it('converts $nor', () => {
            const result = caslToDrizzleV2(
                {
                    $nor: [
                        { status: 'deleted' },
                        { status: 'archived' },
                    ],
                },
                userContext
            );
            expect(result.success).toBe(true);
            expect(result.where).toEqual({
                NOT: {
                    OR: [
                        { status: 'deleted' },
                        { status: 'archived' },
                    ],
                },
            });
        });
    });

    describe('complex conditions', () => {
        it('converts nested logical operators', () => {
            const result = caslToDrizzleV2(
                {
                    status: 'published',
                    $or: [
                        { visibility: 'public' },
                        {
                            $and: [
                                { visibility: 'private' },
                                { ownerId: '${user.id}' },
                            ],
                        },
                    ],
                },
                userContext
            );
            expect(result.success).toBe(true);
            expect(result.where).toEqual({
                status: 'published',
                OR: [
                    { visibility: 'public' },
                    {
                        AND: [
                            { visibility: 'private' },
                            { ownerId: 'user-123' },
                        ],
                    },
                ],
            });
        });

        it('handles real-world ABAC condition', () => {
            // Editor can update their own draft articles
            const result = caslToDrizzleV2(
                {
                    authorId: '${user.id}',
                    status: { $in: ['draft', 'review'] },
                    deletedAt: { $exists: false },
                },
                userContext
            );
            expect(result.success).toBe(true);
            expect(result.where).toEqual({
                authorId: 'user-123',
                status: { in: ['draft', 'review'] },
                deletedAt: { isNull: true },
            });
        });
    });

    describe('edge cases', () => {
        it('returns allowAll for empty conditions', () => {
            const result = caslToDrizzleV2({}, userContext);
            expect(result.success).toBe(true);
            expect(result.allowAll).toBe(true);
        });

        it('returns allowAll for null conditions', () => {
            const result = caslToDrizzleV2(null, userContext);
            expect(result.success).toBe(true);
            expect(result.allowAll).toBe(true);
        });

        it('returns error for unsupported root operator', () => {
            const result = caslToDrizzleV2({ $text: { $search: 'hello' } }, userContext);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Unsupported root operator');
        });
    });
});

describe('buildCombinedAbacDrizzleV2', () => {
    const userContext: AbilityUserContext = {
        id: 'user-123',
        organizationId: 'org-456',
    };

    it('returns allowAll for unconditional can rule without cannot rules', () => {
        const rules = [
            { action: 'read', subject: 'Article', inverted: false },
        ];
        const result = buildCombinedAbacDrizzleV2(rules, 'read', 'Article', userContext);
        expect(result.success).toBe(true);
        expect(result.allowAll).toBe(true);
    });

    it('combines multiple can rules with OR', () => {
        const rules = [
            { action: 'read', subject: 'Article', inverted: false, conditions: { visibility: 'public' } },
            { action: 'read', subject: 'Article', inverted: false, conditions: { authorId: '${user.id}' } },
        ];
        const result = buildCombinedAbacDrizzleV2(rules, 'read', 'Article', userContext);
        expect(result.success).toBe(true);
        expect(result.where).toEqual({
            OR: [
                { visibility: 'public' },
                { authorId: 'user-123' },
            ],
        });
    });

    it('applies cannot rules with NOT', () => {
        const rules = [
            { action: 'read', subject: 'Article', inverted: false }, // can read all
            { action: 'read', subject: 'Article', inverted: true, conditions: { status: 'deleted' } }, // cannot read deleted
        ];
        const result = buildCombinedAbacDrizzleV2(rules, 'read', 'Article', userContext);
        expect(result.success).toBe(true);
        expect(result.where).toEqual({
            AND: [
                {}, // allow all (unconditional can)
                { NOT: { status: 'deleted' } },
            ],
        });
    });

    it('returns error for no matching rules', () => {
        const rules = [
            { action: 'read', subject: 'Post', inverted: false },
        ];
        const result = buildCombinedAbacDrizzleV2(rules, 'read', 'Article', userContext);
        expect(result.success).toBe(false);
        expect(result.error).toContain('No rules for');
    });
});

describe('merge utilities', () => {
    it('mergeWhereAnd combines conditions with AND', () => {
        const result = mergeWhereAnd(
            { status: 'active' },
            { ownerId: 'user-123' }
        );
        expect(result).toEqual({
            AND: [
                { status: 'active' },
                { ownerId: 'user-123' },
            ],
        });
    });

    it('mergeWhereAnd returns single condition unwrapped', () => {
        const result = mergeWhereAnd({ status: 'active' });
        expect(result).toEqual({ status: 'active' });
    });

    it('mergeWhereAnd ignores undefined', () => {
        const result = mergeWhereAnd(undefined, { status: 'active' }, undefined);
        expect(result).toEqual({ status: 'active' });
    });

    it('mergeWhereOr combines conditions with OR', () => {
        const result = mergeWhereOr(
            { visibility: 'public' },
            { ownerId: 'user-123' }
        );
        expect(result).toEqual({
            OR: [
                { visibility: 'public' },
                { ownerId: 'user-123' },
            ],
        });
    });
});
