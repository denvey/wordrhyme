/**
 * Manage Wildcard Tests
 *
 * Verifies that CASL 'manage' action covers ALL actions (after resolveAction removal).
 * Tests field-level permissions, inverted rules, and plugin namespace permissions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PermissionKernel, PermissionDeniedError } from '../../permission/permission-kernel';
import * as contextModule from '../../context/async-local-storage';
import * as caslAbility from '../../permission/casl-ability';
import type { CaslRule } from '@wordrhyme/db';

// Mock the CASL ability module
vi.mock('../../permission/casl-ability', async (importOriginal) => {
    const original = await importOriginal<typeof caslAbility>();
    return {
        ...original,
        loadRulesFromDB: vi.fn(),
    };
});

// Mock the database
vi.mock('../../db', () => ({
    db: {
        insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
        }),
        select: vi.fn(),
    },
    rawDb: {
        insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
        }),
    },
}));

function mockCaslRules(rules: CaslRule[]) {
    vi.mocked(caslAbility.loadRulesFromDB).mockResolvedValue(rules);
}

function mockContext(overrides: Partial<contextModule.RequestContext> = {}) {
    vi.spyOn(contextModule, 'getContext').mockReturnValue({
        userId: 'user-1',
        organizationId: 'tenant-1',
        userRole: 'admin',
        userRoles: ['admin'],
        requestId: `req-manage-${Math.random().toString(36).slice(2, 8)}`,
        locale: 'en-US',
        currency: 'USD',
        timezone: 'UTC',
        ...overrides,
    });
}

describe('manage wildcard coverage', () => {
    let kernel: PermissionKernel;

    beforeEach(() => {
        kernel = new PermissionKernel();
        mockCaslRules([]);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('manage all covers standard CRUD', () => {
        it('should cover create/read/update/delete on any subject', async () => {
            mockContext();
            mockCaslRules([
                { action: 'manage', subject: 'all', fields: null, conditions: null, inverted: false },
            ]);

            expect(await kernel.can('create', 'Content')).toBe(true);
            expect(await kernel.can('read', 'Content')).toBe(true);
            expect(await kernel.can('update', 'Content')).toBe(true);
            expect(await kernel.can('delete', 'Content')).toBe(true);
        });
    });

    describe('manage all covers custom actions', () => {
        it('should cover invite, remove, publish actions', async () => {
            mockContext();
            mockCaslRules([
                { action: 'manage', subject: 'all', fields: null, conditions: null, inverted: false },
            ]);

            expect(await kernel.can('invite', 'Member')).toBe(true);
            expect(await kernel.can('remove', 'Member')).toBe(true);
            expect(await kernel.can('publish', 'Content')).toBe(true);
        });

        it('should cover arbitrary plugin actions', async () => {
            mockContext();
            mockCaslRules([
                { action: 'manage', subject: 'all', fields: null, conditions: null, inverted: false },
            ]);

            expect(await kernel.can('archive', 'Content')).toBe(true);
            expect(await kernel.can('approve', 'Content')).toBe(true);
            expect(await kernel.can('export', 'AuditLog')).toBe(true);
        });
    });

    describe('manage on specific subject', () => {
        it('should cover all actions on that subject only', async () => {
            mockContext();
            mockCaslRules([
                { action: 'manage', subject: 'Content', fields: null, conditions: null, inverted: false },
            ]);

            // Covered on Content
            expect(await kernel.can('create', 'Content')).toBe(true);
            expect(await kernel.can('read', 'Content')).toBe(true);
            expect(await kernel.can('update', 'Content')).toBe(true);
            expect(await kernel.can('delete', 'Content')).toBe(true);
            expect(await kernel.can('publish', 'Content')).toBe(true);
        });

        it('should NOT grant access to other subjects', async () => {
            mockContext();
            mockCaslRules([
                { action: 'manage', subject: 'Content', fields: null, conditions: null, inverted: false },
            ]);

            expect(await kernel.can('read', 'User')).toBe(false);
            expect(await kernel.can('read', 'Plugin')).toBe(false);
            expect(await kernel.can('read', 'Role')).toBe(false);
        });
    });

    describe('inverted rules override manage', () => {
        it('cannot rule should override manage all', async () => {
            mockContext();
            mockCaslRules([
                { action: 'manage', subject: 'all', fields: null, conditions: null, inverted: false },
                { action: 'delete', subject: 'User', fields: null, conditions: null, inverted: true },
            ]);

            // manage all grants everything...
            expect(await kernel.can('create', 'User')).toBe(true);
            expect(await kernel.can('read', 'User')).toBe(true);
            expect(await kernel.can('update', 'User')).toBe(true);

            // ...except what's explicitly denied
            expect(await kernel.can('delete', 'User')).toBe(false);

            // Other subjects still allowed
            expect(await kernel.can('delete', 'Content')).toBe(true);
        });

        it('cannot with conditions should deny matching instances', async () => {
            mockContext({ userId: 'user-1' });
            mockCaslRules([
                { action: 'manage', subject: 'all', fields: null, conditions: null, inverted: false },
                { action: 'delete', subject: 'Content', fields: null, conditions: { status: 'published' }, inverted: true },
            ]);

            // Can delete non-published content
            const draft = { __caslSubjectType__: 'Content', id: 'c1', status: 'draft' };
            expect(await kernel.can('delete', 'Content', draft)).toBe(true);

            // Cannot delete published content
            const published = { __caslSubjectType__: 'Content', id: 'c2', status: 'published' };
            expect(await kernel.can('delete', 'Content', published)).toBe(false);
        });
    });

    describe('plugin namespace permissions', () => {
        it('should support plugin:* subjects', async () => {
            mockContext();
            mockCaslRules([
                { action: 'read', subject: 'plugin:notification', fields: null, conditions: null, inverted: false },
                { action: 'update', subject: 'plugin:notification', fields: null, conditions: null, inverted: false },
            ]);

            expect(await kernel.can('read', 'plugin:notification')).toBe(true);
            expect(await kernel.can('update', 'plugin:notification')).toBe(true);
            expect(await kernel.can('delete', 'plugin:notification')).toBe(false);
        });

        it('manage all should cover plugin subjects', async () => {
            mockContext();
            mockCaslRules([
                { action: 'manage', subject: 'all', fields: null, conditions: null, inverted: false },
            ]);

            expect(await kernel.can('read', 'plugin:notification')).toBe(true);
            expect(await kernel.can('create', 'plugin:storage-s3')).toBe(true);
            expect(await kernel.can('customAction', 'plugin:my-plugin')).toBe(true);
        });
    });

    describe('field-level permissions with manage', () => {
        it('should return permitted fields for specific rules', async () => {
            mockContext();
            mockCaslRules([
                { action: 'read', subject: 'Content', fields: ['title', 'body'], conditions: null, inverted: false },
            ]);

            const fields = await kernel.permittedFields('read', 'Content');
            expect(fields).toEqual(expect.arrayContaining(['title', 'body']));
            expect(fields?.length).toBe(2);
        });

        it('should return undefined (all fields) when no field restriction', async () => {
            mockContext();
            mockCaslRules([
                { action: 'read', subject: 'Content', fields: null, conditions: null, inverted: false },
            ]);

            const fields = await kernel.permittedFields('read', 'Content');
            expect(fields).toBeUndefined();
        });
    });
});
