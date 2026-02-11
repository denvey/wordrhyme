/**
 * ApiKeyGuard Unit Tests
 *
 * Tests for API key validation, tenant binding, and capability extraction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// Mock Better Auth
const mockVerifyApiKey = vi.fn();
vi.mock('../../auth/auth', () => ({
  auth: {
    api: {
      verifyApiKey: (params: unknown) => mockVerifyApiKey(params),
    },
  },
}));

// Import after mocking
import { ApiKeyGuard, type ApiKeyContext } from '../../auth/guards/api-key.guard';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let mockReflector: Reflector;

  const createMockContext = (
    headers: Record<string, string | string[] | undefined> = {},
    isPublic = false
  ) => {
    const request = {
      headers,
      raw: { headers },
      user: undefined as any,
      apiKeyContext: undefined as ApiKeyContext | undefined,
    };

    mockReflector.getAllAndOverride = vi.fn().mockReturnValue(isPublic);

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockReflector = new Reflector();
    guard = new ApiKeyGuard(mockReflector);
  });

  describe('Public Routes', () => {
    it('should allow access to public routes without API key', async () => {
      const context = createMockContext({}, true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockVerifyApiKey).not.toHaveBeenCalled();
    });
  });

  describe('API Key Extraction', () => {
    it('should extract API key from Authorization Bearer header', async () => {
      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        key: {
          id: 'key-123',
          userId: 'user-1',
          name: 'Test Key',
          metadata: { organizationId: 'org-1' },
          permissions: { capabilities: ['content:read'] },
        },
      });

      const context = createMockContext({
        authorization: 'Bearer whr_testkey123',
      });

      await guard.canActivate(context);

      expect(mockVerifyApiKey).toHaveBeenCalledWith({
        body: { key: 'whr_testkey123' },
      });
    });

    it('should extract API key from X-API-Key header', async () => {
      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        key: {
          id: 'key-123',
          userId: 'user-1',
          metadata: { organizationId: 'org-1' },
          permissions: { capabilities: [] },
        },
      });

      const context = createMockContext({
        'x-api-key': 'whr_testkey456',
      });

      await guard.canActivate(context);

      expect(mockVerifyApiKey).toHaveBeenCalledWith({
        body: { key: 'whr_testkey456' },
      });
    });

    it('should throw UnauthorizedException when no API key provided', async () => {
      const context = createMockContext({});

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(context)).rejects.toThrow('API key required');
    });

    it('should handle array header values', async () => {
      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        key: {
          id: 'key-123',
          userId: 'user-1',
          metadata: { organizationId: 'org-1' },
          permissions: {},
        },
      });

      const context = createMockContext({
        authorization: ['Bearer whr_arraykey'],
      });

      await guard.canActivate(context);

      expect(mockVerifyApiKey).toHaveBeenCalledWith({
        body: { key: 'whr_arraykey' },
      });
    });
  });

  describe('API Key Validation', () => {
    it('should throw UnauthorizedException for invalid API key', async () => {
      mockVerifyApiKey.mockResolvedValue({
        valid: false,
        error: { message: 'Key not found' },
      });

      const context = createMockContext({
        authorization: 'Bearer invalid_key',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(context)).rejects.toThrow('Key not found');
    });

    it('should throw UnauthorizedException when key data is missing', async () => {
      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        key: null,
      });

      const context = createMockContext({
        authorization: 'Bearer whr_nodata',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Tenant Binding', () => {
    it('should throw ForbiddenException when API key has no tenant binding', async () => {
      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        key: {
          id: 'key-123',
          userId: 'user-1',
          metadata: {}, // No organizationId
          permissions: {},
        },
      });

      const context = createMockContext({
        authorization: 'Bearer whr_notenant',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'API key not bound to a tenant'
      );
    });

    it('should throw ForbiddenException on tenant mismatch', async () => {
      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        key: {
          id: 'key-123',
          userId: 'user-1',
          metadata: { organizationId: 'org-a' },
          permissions: {},
        },
      });

      const context = createMockContext({
        authorization: 'Bearer whr_wrongtenant',
        'x-org-id': 'org-b', // Different tenant in request
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow('API key tenant mismatch');
    });

    it('should allow matching tenant', async () => {
      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        key: {
          id: 'key-123',
          userId: 'user-1',
          metadata: { organizationId: 'org-a' },
          permissions: { capabilities: ['content:read'] },
        },
      });

      const context = createMockContext({
        authorization: 'Bearer whr_goodtenant',
        'x-org-id': 'org-a', // Matching tenant
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow when no tenant header is provided', async () => {
      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        key: {
          id: 'key-123',
          userId: 'user-1',
          metadata: { organizationId: 'org-a' },
          permissions: {},
        },
      });

      const context = createMockContext({
        authorization: 'Bearer whr_noheader',
        // No x-org-id header
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe('Context Population', () => {
    it('should attach apiKeyContext to request', async () => {
      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        key: {
          id: 'key-abc',
          userId: 'user-xyz',
          name: 'My API Key',
          metadata: {
            organizationId: 'org-123',
            issuedBy: 'admin',
          },
          permissions: {
            capabilities: ['content:read', 'content:write'],
          },
        },
      });

      const context = createMockContext({
        authorization: 'Bearer whr_full',
      });

      await guard.canActivate(context);

      const request = context.switchToHttp().getRequest();
      expect(request.apiKeyContext).toEqual({
        id: 'key-abc',
        name: 'My API Key',
        userId: 'user-xyz',
        organizationId: 'org-123',
        capabilities: ['content:read', 'content:write'],
        metadata: {
          organizationId: 'org-123',
          issuedBy: 'admin',
        },
      });
    });

    it('should attach user context for compatibility', async () => {
      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        key: {
          id: 'key-123',
          userId: 'user-456',
          metadata: { organizationId: 'org-1' },
          permissions: {},
        },
      });

      const context = createMockContext({
        authorization: 'Bearer whr_compat',
      });

      await guard.canActivate(context);

      const request = context.switchToHttp().getRequest();
      expect(request.user).toEqual({
        id: 'user-456',
        email: '',
        role: 'api-key',
      });
    });

    it('should handle missing name gracefully', async () => {
      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        key: {
          id: 'key-123',
          userId: 'user-1',
          name: null, // No name
          metadata: { organizationId: 'org-1' },
          permissions: {},
        },
      });

      const context = createMockContext({
        authorization: 'Bearer whr_noname',
      });

      await guard.canActivate(context);

      const request = context.switchToHttp().getRequest();
      expect(request.apiKeyContext?.name).toBeUndefined();
    });

    it('should default to empty capabilities array', async () => {
      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        key: {
          id: 'key-123',
          userId: 'user-1',
          metadata: { organizationId: 'org-1' },
          permissions: {}, // No capabilities defined
        },
      });

      const context = createMockContext({
        authorization: 'Bearer whr_nocaps',
      });

      await guard.canActivate(context);

      const request = context.switchToHttp().getRequest();
      expect(request.apiKeyContext?.capabilities).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should wrap unexpected errors as UnauthorizedException', async () => {
      mockVerifyApiKey.mockRejectedValue(new Error('Network error'));

      const context = createMockContext({
        authorization: 'Bearer whr_error',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'API key validation failed'
      );
    });

    it('should pass through UnauthorizedException', async () => {
      mockVerifyApiKey.mockRejectedValue(new UnauthorizedException('Custom error'));

      const context = createMockContext({
        authorization: 'Bearer whr_unauth',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(context)).rejects.toThrow('Custom error');
    });

    it('should pass through ForbiddenException', async () => {
      mockVerifyApiKey.mockRejectedValue(new ForbiddenException('Access denied'));

      const context = createMockContext({
        authorization: 'Bearer whr_forbidden',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow('Access denied');
    });
  });
});
