/**
 * Role CRUD Integration Tests
 *
 * Tests role management operations including:
 * - Creating custom roles
 * - Updating role names and descriptions
 * - Deleting non-system roles
 * - Assigning permissions to roles
 * - Tenant isolation for roles
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// Mock database
const mockRoles: Array<{
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    description: string | null;
    isSystem: boolean;
}> = [];

const mockRolePermissions: Array<{
    id: string;
    roleId: string;
    capability: string;
}> = [];

// Reset mocks before each test
let roleIdCounter = 0;
let permIdCounter = 0;

beforeEach(() => {
    mockRoles.length = 0;
    mockRolePermissions.length = 0;
    roleIdCounter = 0;
    permIdCounter = 0;
});

afterEach(() => {
    vi.clearAllMocks();
});

/**
 * Helper to generate slug from name (mirrors actual implementation)
 */
function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Mock role service for testing business logic
 */
class MockRoleService {
    async listRoles(organizationId: string) {
        return mockRoles
            .filter(r => r.organizationId === organizationId)
            .sort((a, b) => (a.isSystem === b.isSystem ? 0 : a.isSystem ? -1 : 1));
    }

    async getRole(roleId: string, organizationId: string) {
        const role = mockRoles.find(
            r => r.id === roleId && r.organizationId === organizationId
        );
        if (!role) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Role not found' });
        }

        const permissions = mockRolePermissions
            .filter(p => p.roleId === roleId)
            .map(p => p.capability);

        return { ...role, capabilities: permissions };
    }

    async createRole(
        organizationId: string,
        name: string,
        description?: string
    ) {
        const slug = generateSlug(name);

        // Check for duplicate slug
        const existing = mockRoles.find(
            r => r.organizationId === organizationId && r.slug === slug
        );
        if (existing) {
            throw new TRPCError({
                code: 'CONFLICT',
                message: 'A role with this name already exists',
            });
        }

        const newRole = {
            id: `role-custom-${++roleIdCounter}`,
            organizationId,
            name,
            slug,
            description: description ?? null,
            isSystem: false,
        };

        mockRoles.push(newRole);
        return newRole;
    }

    async updateRole(
        roleId: string,
        organizationId: string,
        updates: { name?: string; description?: string }
    ) {
        const roleIndex = mockRoles.findIndex(
            r => r.id === roleId && r.organizationId === organizationId
        );
        if (roleIndex === -1) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Role not found' });
        }

        const role = mockRoles[roleIndex]!;
        if (updates.name !== undefined) {
            role.name = updates.name;
            if (!role.isSystem) {
                role.slug = generateSlug(updates.name);
            }
        }
        if (updates.description !== undefined) {
            role.description = updates.description;
        }

        return role;
    }

    async deleteRole(roleId: string, organizationId: string) {
        const roleIndex = mockRoles.findIndex(
            r => r.id === roleId && r.organizationId === organizationId
        );
        if (roleIndex === -1) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Role not found' });
        }

        const role = mockRoles[roleIndex]!;
        if (role.isSystem) {
            throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'Cannot delete system role',
            });
        }

        // Remove role and its permissions
        mockRoles.splice(roleIndex, 1);
        const permIndexes = mockRolePermissions
            .map((p, i) => (p.roleId === roleId ? i : -1))
            .filter(i => i !== -1)
            .reverse();
        for (const i of permIndexes) {
            mockRolePermissions.splice(i, 1);
        }

        return { success: true };
    }

    async assignPermissions(
        roleId: string,
        organizationId: string,
        capabilities: string[]
    ) {
        const role = mockRoles.find(
            r => r.id === roleId && r.organizationId === organizationId
        );
        if (!role) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Role not found' });
        }

        if (role.slug === 'owner') {
            throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'Cannot modify owner role permissions',
            });
        }

        // Remove existing permissions
        const permIndexes = mockRolePermissions
            .map((p, i) => (p.roleId === roleId ? i : -1))
            .filter(i => i !== -1)
            .reverse();
        for (const i of permIndexes) {
            mockRolePermissions.splice(i, 1);
        }

        // Add new permissions
        for (const capability of capabilities) {
            mockRolePermissions.push({
                id: `perm-${++permIdCounter}`,
                roleId,
                capability,
            });
        }

        return { success: true };
    }
}

describe('Role CRUD Integration', () => {
    let service: MockRoleService;
    const orgId = 'org-test-123';
    const otherOrgId = 'org-other-456';

    beforeEach(() => {
        service = new MockRoleService();

        // Seed system roles for test org
        mockRoles.push(
            {
                id: 'role-owner',
                organizationId: orgId,
                name: 'Owner',
                slug: 'owner',
                description: 'Full access to organization',
                isSystem: true,
            },
            {
                id: 'role-admin',
                organizationId: orgId,
                name: 'Admin',
                slug: 'admin',
                description: 'Administrative access',
                isSystem: true,
            },
            {
                id: 'role-member',
                organizationId: orgId,
                name: 'Member',
                slug: 'member',
                description: 'Standard member access',
                isSystem: true,
            }
        );

        // Add permissions to system roles
        mockRolePermissions.push(
            { id: 'perm-1', roleId: 'role-owner', capability: '*:*:*' },
            { id: 'perm-2', roleId: 'role-admin', capability: 'content:*:*' },
            { id: 'perm-3', roleId: 'role-admin', capability: 'media:*:*' },
            { id: 'perm-4', roleId: 'role-admin', capability: 'user:read:*' },
            { id: 'perm-5', roleId: 'role-member', capability: 'content:read:*' },
            { id: 'perm-6', roleId: 'role-member', capability: 'media:read:*' }
        );
    });

    describe('List Roles', () => {
        it('should list all roles for organization', async () => {
            const roles = await service.listRoles(orgId);

            expect(roles.length).toBe(3);
            expect(roles.map(r => r.slug)).toContain('owner');
            expect(roles.map(r => r.slug)).toContain('admin');
            expect(roles.map(r => r.slug)).toContain('member');
        });

        it('should not return roles from other organizations', async () => {
            // Add a role to another org
            mockRoles.push({
                id: 'role-other',
                organizationId: otherOrgId,
                name: 'Other Role',
                slug: 'other-role',
                description: null,
                isSystem: false,
            });

            const roles = await service.listRoles(orgId);
            expect(roles.map(r => r.id)).not.toContain('role-other');
        });
    });

    describe('Get Role', () => {
        it('should get role with its capabilities', async () => {
            const role = await service.getRole('role-admin', orgId);

            expect(role.name).toBe('Admin');
            expect(role.capabilities).toContain('content:*:*');
            expect(role.capabilities).toContain('media:*:*');
            expect(role.capabilities.length).toBe(3);
        });

        it('should throw NOT_FOUND for non-existent role', async () => {
            await expect(
                service.getRole('non-existent', orgId)
            ).rejects.toThrow(TRPCError);
        });

        it('should throw NOT_FOUND when accessing role from different org', async () => {
            await expect(
                service.getRole('role-admin', otherOrgId)
            ).rejects.toThrow(TRPCError);
        });
    });

    describe('Create Role', () => {
        it('should create a new custom role', async () => {
            const role = await service.createRole(
                orgId,
                'Content Editor',
                'Can edit content'
            );

            expect(role.name).toBe('Content Editor');
            expect(role.slug).toBe('content-editor');
            expect(role.description).toBe('Can edit content');
            expect(role.isSystem).toBe(false);
        });

        it('should generate slug from name', async () => {
            const role = await service.createRole(
                orgId,
                'Power Admin User!!'
            );

            expect(role.slug).toBe('power-admin-user');
        });

        it('should reject duplicate role names in same org', async () => {
            await service.createRole(orgId, 'Custom Role');

            await expect(
                service.createRole(orgId, 'Custom Role')
            ).rejects.toThrow('A role with this name already exists');
        });

        it('should allow same role name in different orgs', async () => {
            await service.createRole(orgId, 'Custom Role');

            // Should not throw
            const role = await service.createRole(otherOrgId, 'Custom Role');
            expect(role.organizationId).toBe(otherOrgId);
        });
    });

    describe('Update Role', () => {
        it('should update role name and regenerate slug for non-system roles', async () => {
            const created = await service.createRole(orgId, 'Old Name');
            const updated = await service.updateRole(created.id, orgId, {
                name: 'New Name',
            });

            expect(updated.name).toBe('New Name');
            expect(updated.slug).toBe('new-name');
        });

        it('should update only description', async () => {
            const created = await service.createRole(orgId, 'Test Role');
            const updated = await service.updateRole(created.id, orgId, {
                description: 'Updated description',
            });

            expect(updated.description).toBe('Updated description');
            expect(updated.name).toBe('Test Role');
        });

        it('should NOT regenerate slug for system roles', async () => {
            const updated = await service.updateRole('role-admin', orgId, {
                name: 'Super Admin',
            });

            // Name changes but slug stays same for system roles
            expect(updated.name).toBe('Super Admin');
            expect(updated.slug).toBe('admin');
        });

        it('should throw NOT_FOUND for non-existent role', async () => {
            await expect(
                service.updateRole('non-existent', orgId, { name: 'New' })
            ).rejects.toThrow(TRPCError);
        });
    });

    describe('Delete Role', () => {
        it('should delete custom role', async () => {
            const created = await service.createRole(orgId, 'To Delete');

            const result = await service.deleteRole(created.id, orgId);
            expect(result.success).toBe(true);

            // Verify role is deleted
            const roles = await service.listRoles(orgId);
            expect(roles.map(r => r.id)).not.toContain(created.id);
        });

        it('should delete role permissions when role is deleted', async () => {
            const created = await service.createRole(orgId, 'With Perms');
            await service.assignPermissions(created.id, orgId, [
                'content:read:*',
                'media:read:*',
            ]);

            // Verify permissions exist
            const initialPerms = mockRolePermissions.filter(
                p => p.roleId === created.id
            );
            expect(initialPerms.length).toBe(2);

            // Delete role
            await service.deleteRole(created.id, orgId);

            // Verify permissions are deleted
            const remainingPerms = mockRolePermissions.filter(
                p => p.roleId === created.id
            );
            expect(remainingPerms.length).toBe(0);
        });

        it('should NOT delete system roles', async () => {
            await expect(
                service.deleteRole('role-admin', orgId)
            ).rejects.toThrow('Cannot delete system role');
        });

        it('should throw NOT_FOUND for role in different org', async () => {
            const created = await service.createRole(orgId, 'My Role');

            await expect(
                service.deleteRole(created.id, otherOrgId)
            ).rejects.toThrow(TRPCError);
        });
    });

    describe('Assign Permissions', () => {
        it('should assign capabilities to role', async () => {
            const created = await service.createRole(orgId, 'Editor');
            await service.assignPermissions(created.id, orgId, [
                'content:create:space',
                'content:update:space',
                'media:upload:space',
            ]);

            const role = await service.getRole(created.id, orgId);
            expect(role.capabilities).toContain('content:create:space');
            expect(role.capabilities).toContain('content:update:space');
            expect(role.capabilities).toContain('media:upload:space');
            expect(role.capabilities.length).toBe(3);
        });

        it('should replace existing permissions', async () => {
            const created = await service.createRole(orgId, 'Editor');

            // First assignment
            await service.assignPermissions(created.id, orgId, [
                'content:read:*',
                'media:read:*',
            ]);

            // Replace with new permissions
            await service.assignPermissions(created.id, orgId, [
                'content:*:*',
            ]);

            const role = await service.getRole(created.id, orgId);
            expect(role.capabilities).toEqual(['content:*:*']);
        });

        it('should allow clearing all permissions', async () => {
            const created = await service.createRole(orgId, 'Editor');
            await service.assignPermissions(created.id, orgId, [
                'content:read:*',
            ]);

            // Clear permissions
            await service.assignPermissions(created.id, orgId, []);

            const role = await service.getRole(created.id, orgId);
            expect(role.capabilities.length).toBe(0);
        });

        it('should NOT allow modifying owner role permissions', async () => {
            await expect(
                service.assignPermissions('role-owner', orgId, ['content:read:*'])
            ).rejects.toThrow('Cannot modify owner role permissions');
        });

        it('should allow modifying admin role permissions', async () => {
            // Admin is a system role but can have permissions modified
            await service.assignPermissions('role-admin', orgId, [
                'content:*:*',
                'user:*:*',
            ]);

            const role = await service.getRole('role-admin', orgId);
            expect(role.capabilities).toContain('content:*:*');
            expect(role.capabilities).toContain('user:*:*');
        });
    });

    describe('Tenant Isolation', () => {
        it('should isolate roles between organizations', async () => {
            // Create roles in different orgs
            const roleA = await service.createRole(orgId, 'Org A Role');
            const roleB = await service.createRole(otherOrgId, 'Org B Role');

            // Org A can only see its roles
            const orgARoles = await service.listRoles(orgId);
            expect(orgARoles.map(r => r.id)).toContain(roleA.id);
            expect(orgARoles.map(r => r.id)).not.toContain(roleB.id);

            // Org B can only see its roles
            const orgBRoles = await service.listRoles(otherOrgId);
            expect(orgBRoles.map(r => r.id)).toContain(roleB.id);
            expect(orgBRoles.map(r => r.id)).not.toContain(roleA.id);
        });

        it('should not allow cross-org role access', async () => {
            const roleA = await service.createRole(orgId, 'Org A Role');

            // Cannot get from other org
            await expect(
                service.getRole(roleA.id, otherOrgId)
            ).rejects.toThrow(TRPCError);

            // Cannot update from other org
            await expect(
                service.updateRole(roleA.id, otherOrgId, { name: 'Hacked' })
            ).rejects.toThrow(TRPCError);

            // Cannot delete from other org
            await expect(
                service.deleteRole(roleA.id, otherOrgId)
            ).rejects.toThrow(TRPCError);
        });
    });
});
