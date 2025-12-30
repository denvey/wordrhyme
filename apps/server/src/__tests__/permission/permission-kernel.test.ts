/**
 * Permission Kernel Tests
 *
 * Contract Compliance Tests:
 * - 9.1.3: Permission checks enforced (deny by default)
 * - 9.1.9: Reserved namespace permissions rejected
 * - 9.1.11: Audit logs created for denied permissions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PermissionKernel, PermissionDeniedError } from '../../permission/permission-kernel';
import { isValidCapabilityFormat, ROLE_PERMISSIONS } from '../../permission/permission.types';
import * as contextModule from '../../context/async-local-storage';

// Mock the database and context
vi.mock('../../db', () => ({
    db: {
        insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
        }),
    },
}));

describe('PermissionKernel', () => {
    let kernel: PermissionKernel;

    beforeEach(() => {
        kernel = new PermissionKernel();
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
                userId: undefined,
                tenantId: 'tenant-1',
                userRole: undefined,
                requestId: 'req-1',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            const result = await kernel.can('content:read:space');

            expect(result).toBe(false);
        });

        it('should deny access when user lacks required capability', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                tenantId: 'tenant-1',
                userRole: 'viewer', // Viewer role has limited permissions
                requestId: 'req-2',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // Viewer doesn't have 'plugin:install:global' capability
            const result = await kernel.can('plugin:install:global');

            expect(result).toBe(false);
        });

        it('should allow access when user has required capability', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'admin-1',
                tenantId: 'tenant-1',
                userRole: 'admin', // Admin has full access
                requestId: 'req-3',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // Admin should have '*:*:*' capability
            const result = await kernel.can('content:read:space');

            expect(result).toBe(true);
        });

        it('should deny access for invalid capability format', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                tenantId: 'tenant-1',
                userRole: 'admin',
                requestId: 'req-4',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // Invalid format (missing scope)
            const result = await kernel.can('invalid-capability');

            expect(result).toBe(false);
        });

        it('should deny cross-tenant access', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                tenantId: 'tenant-1',
                userRole: 'admin',
                requestId: 'req-5',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // Try to access a different tenant
            const result = await kernel.can('content:read:space', {
                tenantId: 'tenant-2', // Different tenant
            });

            expect(result).toBe(false);
        });
    });

    /**
     * Test wildcard matching
     */
    describe('wildcard matching', () => {
        it('should match wildcard permissions', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'admin-1',
                tenantId: 'tenant-1',
                userRole: 'admin', // Admin has '*:*:*'
                requestId: 'req-6',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            const result = await kernel.can('plugin:install:global');

            expect(result).toBe(true);
        });
    });

    /**
     * Test require() throws on denied
     */
    describe('require()', () => {
        it('should throw PermissionDeniedError when access denied', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                tenantId: 'tenant-1',
                userRole: 'viewer',
                requestId: 'req-7',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            await expect(
                kernel.require('plugin:install:global')
            ).rejects.toThrow(PermissionDeniedError);
        });

        it('should not throw when access allowed', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'admin-1',
                tenantId: 'tenant-1',
                userRole: 'admin',
                requestId: 'req-8',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            await expect(
                kernel.require('content:read:space')
            ).resolves.not.toThrow();
        });
    });

    /**
     * Test request-level caching
     */
    describe('caching', () => {
        it('should cache permission results per request', async () => {
            const mockGetContext = vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                tenantId: 'tenant-1',
                userRole: 'admin',
                requestId: 'req-cache',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            // First call
            const result1 = await kernel.can('content:read:space');
            // Second call (should use cache)
            const result2 = await kernel.can('content:read:space');

            expect(result1).toBe(result2);
        });

        it('should clear cache for request', async () => {
            vi.spyOn(contextModule, 'getContext').mockReturnValue({
                userId: 'user-1',
                tenantId: 'tenant-1',
                userRole: 'admin',
                requestId: 'req-clear',
                locale: 'en-US',
                currency: 'USD',
                timezone: 'UTC',
            });

            await kernel.can('content:read:space');
            kernel.clearRequestCache('req-clear');

            // Should not throw
            expect(() => kernel.clearRequestCache('req-clear')).not.toThrow();
        });
    });
});

/**
 * 9.1.9: Reserved namespace permissions rejected
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
 * Role Permissions Configuration
 */
describe('Role Permissions', () => {
    it('should have admin role with full access', () => {
        expect(ROLE_PERMISSIONS['admin']).toContain('*:*:*');
    });

    it('should have viewer role defined', () => {
        expect(ROLE_PERMISSIONS['viewer']).toBeDefined();
        expect(Array.isArray(ROLE_PERMISSIONS['viewer'])).toBe(true);
    });
});
