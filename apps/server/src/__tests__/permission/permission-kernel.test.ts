/**
 * Permission Kernel Tests
 *
 * Contract Compliance Tests:
 * - 9.1.3: Permission checks enforced (deny by default)
 * - CASL integration: Action/subject-based permission checks
 * - Condition interpolation: ABAC support
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PermissionKernel, PermissionDeniedError } from '../../permission/permission-kernel';
import { isValidCapabilityFormat } from '../../permission/permission.types';
import * as contextModule from '../../context/async-local-storage';
import * as caslAbility from '../../permission/casl-ability';
import type { CaslRule } from '../../db/schema/role-permissions';

// Mock the CASL ability module
vi.mock('../../permission/casl-ability', async (importOriginal) => {
    const original = await importOriginal<typeof caslAbility>();
    return {
        ...original,
        loadRulesFromDB: vi.fn(),
    };
});

// Mock the database (for legacy capability lookup)
vi.mock('../../db', () => ({
    db: {
        insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
        }),
        select: vi.fn(),
    },
}));

/**
 * Helper to mock CASL rules for a user's roles
 */
function mockCaslRules(rules: CaslRule[]) {
    vi.mocked(caslAbility.loadRulesFromDB).mockResolvedValue(rules);
}

describe('PermissionKernel', () => {
    let kernel: PermissionKernel;

    beforeEach(() => {
        kernel = new PermissionKernel();
        // Default: return empty rules (deny all)
        mockCaslRules([]);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    /**
     * 9.1.3: Permission checks enforced (deny by default)
     */
    describe('deny by default', () => {
        it('should deny access when no user in context', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                organizationId: 'tenant-1',
                requestId: 'req-1',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            } as contextModule.RequestContext);

            const result = await kernel.can('read', 'Content');
            expect(result).toBe(false);
        });

        it('should deny access when user lacks required permission', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                organizationId: 'tenant-1',
                userRole: 'viewer',
                userRoles: ['viewer'],
                requestId: 'req-2',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // Viewer can only read
            mockCaslRules([
                { action: 'read', subject: 'Content', fields: null, conditions: null, inverted: false },
            ]);

            // Viewer doesn't have 'manage' on Plugin
            const result = await kernel.can('manage', 'Plugin');
            expect(result).toBe(false);
        });

        it('should allow access when user has required permission', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'admin-1',
                organizationId: 'tenant-1',
                userRole: 'admin',
                userRoles: ['admin'],
                requestId: 'req-3',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // Admin has manage all
            mockCaslRules([
                { action: 'manage', subject: 'all', fields: null, conditions: null, inverted: false },
            ]);

            const result = await kernel.can('read', 'Content');
            expect(result).toBe(true);
        });

        it('should deny access when no tenant context', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                userRole: 'admin',
                requestId: 'req-4',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            } as contextModule.RequestContext);

            const result = await kernel.can('read', 'Content');
            expect(result).toBe(false);
        });
    });

    /**
     * Test CASL-style permission checks
     */
    describe('CASL-style permission checks', () => {
        it('should check action/subject permissions', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                organizationId: 'tenant-1',
                userRole: 'editor',
                userRoles: ['editor'],
                requestId: 'req-casl-1',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // Editor can read and update Content
            mockCaslRules([
                { action: 'read', subject: 'Content', fields: null, conditions: null, inverted: false },
                { action: 'update', subject: 'Content', fields: null, conditions: null, inverted: false },
            ]);

            expect(await kernel.can('read', 'Content')).toBe(true);
            expect(await kernel.can('update', 'Content')).toBe(true);
            expect(await kernel.can('delete', 'Content')).toBe(false);
        });

        it('should support subject instances with conditions', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                organizationId: 'tenant-1',
                userRole: 'member',
                userRoles: ['member'],
                requestId: 'req-casl-2',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // Member can only update their own content
            mockCaslRules([
                { action: 'read', subject: 'Content', fields: null, conditions: null, inverted: false },
                { action: 'update', subject: 'Content', fields: null, conditions: { ownerId: 'user-1' }, inverted: false },
            ]);

            // Can read any content
            expect(await kernel.can('read', 'Content')).toBe(true);

            // Can update own content
            const ownContent = { __caslSubjectType__: 'Content', id: 'c1', ownerId: 'user-1' };
            expect(await kernel.can('update', 'Content', ownContent)).toBe(true);

            // Cannot update other's content
            const otherContent = { __caslSubjectType__: 'Content', id: 'c2', ownerId: 'user-2' };
            expect(await kernel.can('update', 'Content', otherContent)).toBe(false);
        });

        it('should support wildcard "manage" action', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'owner-1',
                organizationId: 'tenant-1',
                userRole: 'owner',
                userRoles: ['owner'],
                requestId: 'req-casl-3',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // Owner has manage on all
            mockCaslRules([
                { action: 'manage', subject: 'all', fields: null, conditions: null, inverted: false },
            ]);

            // Should match any action on any subject
            expect(await kernel.can('create', 'User')).toBe(true);
            expect(await kernel.can('read', 'Organization')).toBe(true);
            expect(await kernel.can('update', 'Plugin')).toBe(true);
            expect(await kernel.can('delete', 'Role')).toBe(true);
        });

        it('should support inverted rules (cannot)', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                organizationId: 'tenant-1',
                userRole: 'restricted',
                userRoles: ['restricted'],
                requestId: 'req-casl-4',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // Can read everything except AuditLog
            mockCaslRules([
                { action: 'read', subject: 'all', fields: null, conditions: null, inverted: false },
                { action: 'read', subject: 'AuditLog', fields: null, conditions: null, inverted: true },
            ]);

            expect(await kernel.can('read', 'Content')).toBe(true);
            expect(await kernel.can('read', 'User')).toBe(true);
            expect(await kernel.can('read', 'AuditLog')).toBe(false);
        });
    });

    /**
     * Test legacy capability format support
     */
    describe('legacy capability format', () => {
        it('should parse legacy resource:action:scope format', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                organizationId: 'tenant-1',
                userRole: 'editor',
                userRoles: ['editor'],
                requestId: 'req-legacy-1',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // Editor has read and update on Content
            mockCaslRules([
                { action: 'read', subject: 'Content', fields: null, conditions: null, inverted: false },
                { action: 'update', subject: 'Content', fields: null, conditions: null, inverted: false },
            ]);

            // Legacy format should be converted to CASL check
            expect(await kernel.can('content:read:space')).toBe(true);
            expect(await kernel.can('content:update:space')).toBe(true);
            expect(await kernel.can('content:delete:space')).toBe(false);
        });
    });

    /**
     * Test require() throws on denied
     */
    describe('require()', () => {
        it('should throw PermissionDeniedError when access denied', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                organizationId: 'tenant-1',
                userRole: 'viewer',
                userRoles: ['viewer'],
                requestId: 'req-req-1',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // Viewer can only read
            mockCaslRules([
                { action: 'read', subject: 'Content', fields: null, conditions: null, inverted: false },
            ]);

            await expect(
                kernel.require('manage', 'Plugin')
            ).rejects.toThrow(PermissionDeniedError);
        });

        it('should not throw when access allowed', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'admin-1',
                organizationId: 'tenant-1',
                userRole: 'admin',
                userRoles: ['admin'],
                requestId: 'req-req-2',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // Admin has full access
            mockCaslRules([
                { action: 'manage', subject: 'all', fields: null, conditions: null, inverted: false },
            ]);

            await expect(
                kernel.require('read', 'Content')
            ).resolves.not.toThrow();
        });
    });

    /**
     * Test request-level caching
     */
    describe('caching', () => {
        it('should cache ability per request', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                organizationId: 'tenant-1',
                userRole: 'admin',
                userRoles: ['admin'],
                requestId: 'req-cache-1',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            mockCaslRules([
                { action: 'manage', subject: 'all', fields: null, conditions: null, inverted: false },
            ]);

            // First call loads from DB
            await kernel.can('read', 'Content');
            // Second call should use cached ability
            await kernel.can('update', 'Content');

            // loadRulesFromDB should only be called once per request
            expect(caslAbility.loadRulesFromDB).toHaveBeenCalledTimes(1);
        });

        it('should clear cache for request', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                organizationId: 'tenant-1',
                userRole: 'admin',
                userRoles: ['admin'],
                requestId: 'req-cache-2',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            mockCaslRules([
                { action: 'manage', subject: 'all', fields: null, conditions: null, inverted: false },
            ]);

            await kernel.can('read', 'Content');
            kernel.clearRequestCache('req-cache-2');

            // Should not throw
            expect(() => kernel.clearRequestCache('req-cache-2')).not.toThrow();
        });
    });

    /**
     * Test getRulesForUser for frontend hydration
     */
    describe('getRulesForUser', () => {
        it('should return CASL rules for frontend', async () => {
            mockCaslRules([
                { action: 'read', subject: 'Content', fields: null, conditions: null, inverted: false },
                { action: 'update', subject: 'Content', fields: ['title', 'body'], conditions: { ownerId: 'user-1' }, inverted: false },
            ]);

            const rules = await kernel.getRulesForUser(['editor'], 'tenant-1');

            expect(rules).toHaveLength(2);
            expect(rules[0]).toEqual({
                action: 'read',
                subject: 'Content',
                fields: null,
                conditions: null,
                inverted: false,
            });
            expect(rules[1]).toMatchObject({
                action: 'update',
                subject: 'Content',
            });
        });

        it('should return empty array for no roles', async () => {
            const rules = await kernel.getRulesForUser([], 'tenant-1');
            expect(rules).toEqual([]);
        });
    });
});

/**
 * Capability Format Validation (Legacy)
 */
describe('Capability Format Validation', () => {
    it('should validate correct capability format', () => {
        expect(isValidCapabilityFormat('content:read:space')).toBe(true);
        expect(isValidCapabilityFormat('plugin:install:global')).toBe(true);
        expect(isValidCapabilityFormat('user:manage:org')).toBe(true);
    });

    it('should reject invalid capability format', () => {
        expect(isValidCapabilityFormat('invalid')).toBe(false);
        expect(isValidCapabilityFormat('only:two')).toBe(false);
        expect(isValidCapabilityFormat('')).toBe(false);
        expect(isValidCapabilityFormat('too:many:parts:here')).toBe(false);
    });
});

/**
 * Condition Interpolation Tests
 */
describe('Condition Interpolation', () => {
    it('should interpolate user.id in conditions', () => {
        const user = { id: 'user-123', organizationId: 'org-1' };
        const conditions = { ownerId: '${user.id}' };

        const result = caslAbility.interpolateConditions(conditions, user);

        expect(result).toEqual({ ownerId: 'user-123' });
    });

    it('should interpolate nested user properties', () => {
        const user = { id: 'user-123', organizationId: 'org-1', profile: { teamId: 'team-1' } };
        const conditions = { teamId: '${user.profile.teamId}' };

        const result = caslAbility.interpolateConditions(conditions as any, user as any);

        expect(result).toEqual({ teamId: 'team-1' });
    });

    it('should handle null conditions', () => {
        const user = { id: 'user-1', organizationId: 'org-1' };

        expect(caslAbility.interpolateConditions(null, user)).toBeUndefined();
        expect(caslAbility.interpolateConditions(undefined, user)).toBeUndefined();
    });

    it('should pass through non-template values', () => {
        const user = { id: 'user-1', organizationId: 'org-1' };
        const conditions = { status: 'published', count: 5 };

        const result = caslAbility.interpolateConditions(conditions, user);

        expect(result).toEqual({ status: 'published', count: 5 });
    });
});
