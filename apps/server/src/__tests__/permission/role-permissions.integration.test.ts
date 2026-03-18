/**
 * Role Permissions Integration Tests
 *
 * Tests real-world role-based permission scenarios with CASL rules:
 * - Owner role (manage all)
 * - Admin role (manage Content, User, etc.)
 * - Member role (manage Content, read Member)
 * - Field-level permissions
 * - ABAC conditions (ownerId, status, etc.)
 * - Inverted rules (Cannot)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PermissionKernel } from '../../permission/permission-kernel';
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

// Mock database
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

/**
 * Helper to create context
 */
function createContext(overrides: {
    userId?: string;
    organizationId?: string;
    userRoles?: string[];
    requestId?: string;
}) {
    return {
        requestId: overrides.requestId || 'test-req',
        userId: overrides.userId,
        organizationId: overrides.organizationId,
        userRole: overrides.userRoles?.[0],
        userRoles: overrides.userRoles,
        locale: 'en-US',
        currency: 'USD',
        timezone: 'UTC',
    };
}

describe('Role Permissions Integration', () => {
    let kernel: PermissionKernel;

    beforeEach(() => {
        kernel = new PermissionKernel();
        mockCaslRules([]);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    /**
     * Owner Role Tests
     * Owner has { action: 'manage', subject: 'all' }
     */
    describe('Owner Role', () => {
        const ownerContext = createContext({
            userId: 'owner-1',
            organizationId: 'org-1',
            userRoles: ['owner'],
        });

        beforeEach(() => {
            mockCaslRules([
                { action: 'manage', subject: 'all', fields: null, conditions: null, inverted: false },
            ]);
        });

        it('should allow managing all resources', async () => {
            expect(await kernel.can('manage', 'User', undefined, ownerContext)).toBe(true);
            expect(await kernel.can('manage', 'Content', undefined, ownerContext)).toBe(true);
            expect(await kernel.can('manage', 'Role', undefined, ownerContext)).toBe(true);
            expect(await kernel.can('manage', 'Organization', undefined, ownerContext)).toBe(true);
        });

        it('should allow all CRUD operations on all resources', async () => {
            expect(await kernel.can('create', 'User', undefined, ownerContext)).toBe(true);
            expect(await kernel.can('read', 'Content', undefined, ownerContext)).toBe(true);
            expect(await kernel.can('update', 'Role', undefined, ownerContext)).toBe(true);
            expect(await kernel.can('delete', 'Organization', undefined, ownerContext)).toBe(true);
        });

        it('should pass legacy capability format', async () => {
            expect(await kernel.can('user:manage:organization', undefined, undefined, ownerContext)).toBe(true);
            expect(await kernel.can('content:read:space', undefined, undefined, ownerContext)).toBe(true);
            expect(await kernel.can('role:create:organization', undefined, undefined, ownerContext)).toBe(true);
        });

        it('should not throw when requiring permissions', async () => {
            await expect(
                kernel.require('manage', 'User', undefined, ownerContext)
            ).resolves.not.toThrow();

            await expect(
                kernel.require('role:manage:organization', undefined, undefined, ownerContext)
            ).resolves.not.toThrow();
        });
    });

    /**
     * Admin Role Tests
     * Admin has specific permissions for Content, Menu, User (read only)
     */
    describe('Admin Role', () => {
        const adminContext = createContext({
            userId: 'admin-1',
            organizationId: 'org-1',
            userRoles: ['admin'],
        });

        beforeEach(() => {
            mockCaslRules([
                { action: 'manage', subject: 'Content', fields: null, conditions: null, inverted: false },
                { action: 'manage', subject: 'Menu', fields: null, conditions: null, inverted: false },
                { action: 'read', subject: 'User', fields: null, conditions: null, inverted: false },
            ]);
        });

        it('should allow managing Content and Menu', async () => {
            expect(await kernel.can('manage', 'Content', undefined, adminContext)).toBe(true);
            expect(await kernel.can('manage', 'Menu', undefined, adminContext)).toBe(true);
            expect(await kernel.can('create', 'Content', undefined, adminContext)).toBe(true);
            expect(await kernel.can('delete', 'Menu', undefined, adminContext)).toBe(true);
        });

        it('should only allow reading User', async () => {
            expect(await kernel.can('read', 'User', undefined, adminContext)).toBe(true);
            expect(await kernel.can('create', 'User', undefined, adminContext)).toBe(false);
            expect(await kernel.can('update', 'User', undefined, adminContext)).toBe(false);
            expect(await kernel.can('delete', 'User', undefined, adminContext)).toBe(false);
        });

        it('should deny access to Role and Organization', async () => {
            expect(await kernel.can('read', 'Role', undefined, adminContext)).toBe(false);
            expect(await kernel.can('manage', 'Organization', undefined, adminContext)).toBe(false);
        });

        it('should throw when requiring forbidden permissions', async () => {
            await expect(
                kernel.require('delete', 'User', undefined, adminContext)
            ).rejects.toThrow('Permission denied');

            await expect(
                kernel.require('manage', 'Role', undefined, adminContext)
            ).rejects.toThrow('Permission denied');
        });
    });

    /**
     * Member Role Tests
     * Member has { manage: Content, read: Member }
     */
    describe('Member Role', () => {
        const memberContext = createContext({
            userId: 'member-1',
            organizationId: 'org-1',
            userRoles: ['member'],
        });

        beforeEach(() => {
            mockCaslRules([
                { action: 'manage', subject: 'Content', fields: null, conditions: null, inverted: false },
                { action: 'read', subject: 'Member', fields: null, conditions: null, inverted: false },
            ]);
        });

        it('should allow full Content management', async () => {
            expect(await kernel.can('create', 'Content', undefined, memberContext)).toBe(true);
            expect(await kernel.can('read', 'Content', undefined, memberContext)).toBe(true);
            expect(await kernel.can('update', 'Content', undefined, memberContext)).toBe(true);
            expect(await kernel.can('delete', 'Content', undefined, memberContext)).toBe(true);
        });

        it('should only allow reading Members', async () => {
            expect(await kernel.can('read', 'Member', undefined, memberContext)).toBe(true);
            expect(await kernel.can('update', 'Member', undefined, memberContext)).toBe(false);
            expect(await kernel.can('delete', 'Member', undefined, memberContext)).toBe(false);
        });

        it('should deny access to other resources', async () => {
            expect(await kernel.can('read', 'User', undefined, memberContext)).toBe(false);
            expect(await kernel.can('read', 'Role', undefined, memberContext)).toBe(false);
            expect(await kernel.can('read', 'Organization', undefined, memberContext)).toBe(false);
        });
    });

    /**
     * Field-Level Permissions Tests
     * Editor can update Content, but only specific fields
     */
    describe('Field-Level Permissions', () => {
        const editorContext = createContext({
            userId: 'editor-1',
            organizationId: 'org-1',
            userRoles: ['editor'],
        });

        beforeEach(() => {
            mockCaslRules([
                { action: 'read', subject: 'Content', fields: null, conditions: null, inverted: false },
                { action: 'update', subject: 'Content', fields: ['title', 'body', 'tags'], conditions: null, inverted: false },
            ]);
        });

        it('should allow reading all Content fields', async () => {
            expect(await kernel.can('read', 'Content', undefined, editorContext)).toBe(true);
        });

        it('should allow updating only permitted fields', async () => {
            expect(await kernel.can('update', 'Content', undefined, editorContext)).toBe(true);

            const permittedFields = await kernel.permittedFields('update', 'Content', editorContext);
            expect(permittedFields).toEqual(['title', 'body', 'tags']);
        });

        it('should deny creating or deleting Content', async () => {
            expect(await kernel.can('create', 'Content', undefined, editorContext)).toBe(false);
            expect(await kernel.can('delete', 'Content', undefined, editorContext)).toBe(false);
        });
    });

    /**
     * ABAC Conditions Tests
     * User can only update/delete their own Content
     */
    describe('ABAC Conditions (ownerId)', () => {
        const userId = 'user-123';
        const userContext = createContext({
            userId,
            organizationId: 'org-1',
            userRoles: ['contributor'],
        });

        beforeEach(() => {
            mockCaslRules([
                { action: 'read', subject: 'Content', fields: null, conditions: null, inverted: false },
                { action: 'update', subject: 'Content', fields: null, conditions: { ownerId: userId }, inverted: false },
                { action: 'delete', subject: 'Content', fields: null, conditions: { ownerId: userId }, inverted: false },
            ]);
        });

        it('should allow reading any Content', async () => {
            expect(await kernel.can('read', 'Content', undefined, userContext)).toBe(true);
        });

        it('should allow updating own Content', async () => {
            const ownContent = { __caslSubjectType__: 'Content', id: 'c1', ownerId: userId };
            expect(await kernel.can('update', 'Content', ownContent, userContext)).toBe(true);
        });

        it('should deny updating other users Content', async () => {
            const otherContent = { __caslSubjectType__: 'Content', id: 'c2', ownerId: 'user-456' };
            expect(await kernel.can('update', 'Content', otherContent, userContext)).toBe(false);
        });

        it('should allow deleting own Content', async () => {
            const ownContent = { __caslSubjectType__: 'Content', id: 'c1', ownerId: userId };
            expect(await kernel.can('delete', 'Content', ownContent, userContext)).toBe(true);
        });

        it('should deny deleting other users Content', async () => {
            const otherContent = { __caslSubjectType__: 'Content', id: 'c2', ownerId: 'user-456' };
            expect(await kernel.can('delete', 'Content', otherContent, userContext)).toBe(false);
        });

        it('should deny creating Content (no rule for create)', async () => {
            expect(await kernel.can('create', 'Content', undefined, userContext)).toBe(false);
        });
    });

    /**
     * ABAC Conditions Tests - Status-based
     * User can only read published Content or their own drafts
     */
    describe('ABAC Conditions (status + ownerId)', () => {
        const userId = 'user-123';
        const userContext = createContext({
            userId,
            organizationId: 'org-1',
            userRoles: ['viewer'],
        });

        beforeEach(() => {
            // Two rules: read published OR read own drafts
            mockCaslRules([
                { action: 'read', subject: 'Content', fields: null, conditions: { status: 'published' }, inverted: false },
                { action: 'read', subject: 'Content', fields: null, conditions: { ownerId: userId }, inverted: false },
            ]);
        });

        it('should allow reading published Content', async () => {
            const publishedContent = { __caslSubjectType__: 'Content', id: 'c1', status: 'published', ownerId: 'other-user' };
            expect(await kernel.can('read', 'Content', publishedContent, userContext)).toBe(true);
        });

        it('should allow reading own draft Content', async () => {
            const ownDraft = { __caslSubjectType__: 'Content', id: 'c2', status: 'draft', ownerId: userId };
            expect(await kernel.can('read', 'Content', ownDraft, userContext)).toBe(true);
        });

        it('should deny reading other users draft Content', async () => {
            const otherDraft = { __caslSubjectType__: 'Content', id: 'c3', status: 'draft', ownerId: 'other-user' };
            expect(await kernel.can('read', 'Content', otherDraft, userContext)).toBe(false);
        });

        it('should deny updating any Content', async () => {
            const content = { __caslSubjectType__: 'Content', id: 'c1', status: 'published', ownerId: userId };
            expect(await kernel.can('update', 'Content', content, userContext)).toBe(false);
        });
    });

    /**
     * Inverted Rules Tests (Cannot)
     * User can read all except AuditLog
     */
    describe('Inverted Rules (Cannot)', () => {
        const userContext = createContext({
            userId: 'user-1',
            organizationId: 'org-1',
            userRoles: ['restricted'],
        });

        beforeEach(() => {
            mockCaslRules([
                { action: 'read', subject: 'all', fields: null, conditions: null, inverted: false },
                { action: 'read', subject: 'AuditLog', fields: null, conditions: null, inverted: true },
            ]);
        });

        it('should allow reading most resources', async () => {
            expect(await kernel.can('read', 'User', undefined, userContext)).toBe(true);
            expect(await kernel.can('read', 'Content', undefined, userContext)).toBe(true);
            expect(await kernel.can('read', 'Organization', undefined, userContext)).toBe(true);
        });

        it('should deny reading AuditLog despite read all permission', async () => {
            expect(await kernel.can('read', 'AuditLog', undefined, userContext)).toBe(false);
        });

        it('should deny non-read operations', async () => {
            expect(await kernel.can('update', 'User', undefined, userContext)).toBe(false);
            expect(await kernel.can('delete', 'Content', undefined, userContext)).toBe(false);
        });
    });

    /**
     * Multi-Role Tests
     * User has both 'member' and 'editor' roles
     */
    describe('Multi-Role Aggregation', () => {
        const multiRoleContext = createContext({
            userId: 'user-1',
            organizationId: 'org-1',
            userRoles: ['member', 'editor'],
        });

        beforeEach(() => {
            // Member: manage Content
            // Editor: manage Menu, read User
            mockCaslRules([
                { action: 'manage', subject: 'Content', fields: null, conditions: null, inverted: false },
                { action: 'manage', subject: 'Menu', fields: null, conditions: null, inverted: false },
                { action: 'read', subject: 'User', fields: null, conditions: null, inverted: false },
            ]);
        });

        it('should aggregate permissions from both roles', async () => {
            expect(await kernel.can('manage', 'Content', undefined, multiRoleContext)).toBe(true);
            expect(await kernel.can('manage', 'Menu', undefined, multiRoleContext)).toBe(true);
            expect(await kernel.can('read', 'User', undefined, multiRoleContext)).toBe(true);
        });

        it('should deny permissions not granted by any role', async () => {
            expect(await kernel.can('manage', 'User', undefined, multiRoleContext)).toBe(false);
            expect(await kernel.can('read', 'Role', undefined, multiRoleContext)).toBe(false);
        });
    });

    /**
     * No Permission Tests
     * User has no roles or empty rules
     */
    describe('Deny by Default', () => {
        const noRoleContext = createContext({
            userId: 'user-1',
            organizationId: 'org-1',
            userRoles: [],
        });

        beforeEach(() => {
            mockCaslRules([]);
        });

        it('should deny all actions when no rules exist', async () => {
            expect(await kernel.can('read', 'Content', undefined, noRoleContext)).toBe(false);
            expect(await kernel.can('manage', 'all', undefined, noRoleContext)).toBe(false);
        });

        it('should deny when no user in context', async () => {
            const noUserContext = createContext({
                organizationId: 'org-1',
                userRoles: [],
            });
            expect(await kernel.can('read', 'Content', undefined, noUserContext)).toBe(false);
        });

        it('should deny when no tenant in context', async () => {
            const noTenantContext = createContext({
                userId: 'user-1',
                userRoles: ['member'],
            });
            expect(await kernel.can('read', 'Content', undefined, noTenantContext)).toBe(false);
        });
    });

    /**
     * Real-World Scenario: Content Management System
     */
    describe('Real-World Scenario: CMS Roles', () => {
        it('Scenario 1: Content Author (can only manage own content)', async () => {
            const authorId = 'author-1';
            const authorContext = createContext({
                userId: authorId,
                organizationId: 'org-1',
                userRoles: ['author'],
            });

            mockCaslRules([
                { action: 'read', subject: 'Content', fields: null, conditions: null, inverted: false },
                { action: 'create', subject: 'Content', fields: null, conditions: null, inverted: false },
                { action: 'update', subject: 'Content', fields: ['title', 'body'], conditions: { ownerId: authorId }, inverted: false },
                { action: 'delete', subject: 'Content', fields: null, conditions: { ownerId: authorId, status: 'draft' }, inverted: false },
            ]);

            // Can read any content
            expect(await kernel.can('read', 'Content', undefined, authorContext)).toBe(true);

            // Can create content
            expect(await kernel.can('create', 'Content', undefined, authorContext)).toBe(true);

            // Can update own content (only title, body)
            const ownContent = { __caslSubjectType__: 'Content', id: 'c1', ownerId: authorId };
            expect(await kernel.can('update', 'Content', ownContent, authorContext)).toBe(true);
            expect(await kernel.permittedFields('update', 'Content', authorContext)).toEqual(['title', 'body']);

            // Cannot update other's content
            const otherContent = { __caslSubjectType__: 'Content', id: 'c2', ownerId: 'other-user' };
            expect(await kernel.can('update', 'Content', otherContent, authorContext)).toBe(false);

            // Can delete own drafts
            const ownDraft = { __caslSubjectType__: 'Content', id: 'c3', ownerId: authorId, status: 'draft' };
            expect(await kernel.can('delete', 'Content', ownDraft, authorContext)).toBe(true);

            // Cannot delete published content
            const ownPublished = { __caslSubjectType__: 'Content', id: 'c4', ownerId: authorId, status: 'published' };
            expect(await kernel.can('delete', 'Content', ownPublished, authorContext)).toBe(false);
        });

        it('Scenario 2: Content Reviewer (can read all, approve published)', async () => {
            const reviewerContext = createContext({
                userId: 'reviewer-1',
                organizationId: 'org-1',
                userRoles: ['reviewer'],
            });

            mockCaslRules([
                { action: 'read', subject: 'Content', fields: null, conditions: null, inverted: false },
                { action: 'update', subject: 'Content', fields: ['status'], conditions: { status: 'pending' }, inverted: false },
            ]);

            // Can read any content
            expect(await kernel.can('read', 'Content', undefined, reviewerContext)).toBe(true);

            // Can update status of pending content
            const pendingContent = { __caslSubjectType__: 'Content', id: 'c1', status: 'pending' };
            expect(await kernel.can('update', 'Content', pendingContent, reviewerContext)).toBe(true);
            expect(await kernel.permittedFields('update', 'Content', reviewerContext)).toEqual(['status']);

            // Cannot update published content
            const publishedContent = { __caslSubjectType__: 'Content', id: 'c2', status: 'published' };
            expect(await kernel.can('update', 'Content', publishedContent, reviewerContext)).toBe(false);

            // Cannot create or delete
            expect(await kernel.can('create', 'Content', undefined, reviewerContext)).toBe(false);
            expect(await kernel.can('delete', 'Content', undefined, reviewerContext)).toBe(false);
        });
    });
});
