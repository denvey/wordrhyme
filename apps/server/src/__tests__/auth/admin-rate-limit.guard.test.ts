/**
 * AdminRateLimitGuard Unit Tests
 *
 * Tests for admin operation rate limiting with action-specific limits.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// Mock GuardAuditService
const mockAuditLog = vi.fn();
vi.mock('../../auth/guards/guard-audit.service', () => ({
  GuardAuditService: class MockGuardAuditService {
    log = mockAuditLog;
  },
}));

// Import after mocking
import { AdminRateLimitGuard } from '../../auth/guards/admin-rate-limit.guard';
import { GuardAuditService } from '../../auth/guards/guard-audit.service';

describe('AdminRateLimitGuard', () => {
  let guard: AdminRateLimitGuard;
  let mockReflector: Reflector;
  let mockAuditService: GuardAuditService;

  const createMockContext = (
    userId: string | undefined,
    action: string | undefined,
    organizationId?: string
  ) => {
    const request = {
      user: userId ? { id: userId } : undefined,
      tenantContext: organizationId ? { organizationId } : undefined,
    };

    mockReflector.get = vi.fn().mockReturnValue(action);

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
    } as any;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLog.mockResolvedValue(undefined);
    mockReflector = new Reflector();
    mockAuditService = new GuardAuditService() as any;
    guard = new AdminRateLimitGuard(mockReflector, mockAuditService);
  });

  afterEach(() => {
    // Clear the internal store between tests
    (guard as any).store.clear();
  });

  describe('No Rate Limit Required', () => {
    it('should allow when no @Audited decorator', async () => {
      const context = createMockContext('user-1', undefined);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow when action has no rate limit config', async () => {
      const context = createMockContext('user-1', 'user.view'); // No limit configured

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow when no user ID', async () => {
      const context = createMockContext(undefined, 'user.ban');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe('Rate Limit Enforcement - user.ban (10/min)', () => {
    it('should allow first request', async () => {
      const context = createMockContext('user-1', 'user.ban');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow up to limit', async () => {
      for (let i = 0; i < 10; i++) {
        const context = createMockContext('user-1', 'user.ban');
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }
    });

    it('should block after exceeding limit', async () => {
      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        const context = createMockContext('user-1', 'user.ban');
        await guard.canActivate(context);
      }

      // 11th request should be blocked
      const context = createMockContext('user-1', 'user.ban', 'org-1');

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      try {
        await guard.canActivate(context);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const response = (error as HttpException).getResponse() as any;
        expect(response.message).toContain('Rate limit exceeded');
        expect(response.retryAfter).toBeGreaterThan(0);
      }
    });

    it('should log rate limit violations', async () => {
      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        const context = createMockContext('user-1', 'user.ban');
        await guard.canActivate(context);
      }

      // Trigger violation
      const context = createMockContext('user-1', 'user.ban', 'org-1');
      try {
        await guard.canActivate(context);
      } catch {
        // Expected
      }

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'security.rate_limit_exceeded',
          success: false,
          adminId: 'user-1',
          organizationId: 'org-1',
          failureReason: 'Rate limit exceeded for user.ban',
          details: expect.objectContaining({
            attemptedAction: 'user.ban',
            count: 11,
            limit: 10,
          }),
        })
      );
    });
  });

  describe('Rate Limit Enforcement - user.delete (3/5min)', () => {
    it('should allow up to 3 deletes', async () => {
      for (let i = 0; i < 3; i++) {
        const context = createMockContext('user-1', 'user.delete');
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }
    });

    it('should block 4th delete', async () => {
      // Exhaust limit
      for (let i = 0; i < 3; i++) {
        const context = createMockContext('user-1', 'user.delete');
        await guard.canActivate(context);
      }

      // 4th request should be blocked
      const context = createMockContext('user-1', 'user.delete');

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    });
  });

  describe('Rate Limit Enforcement - user.impersonate_start (5/5min)', () => {
    it('should allow up to 5 impersonations', async () => {
      for (let i = 0; i < 5; i++) {
        const context = createMockContext('user-1', 'user.impersonate_start');
        const result = await guard.canActivate(context);
        expect(result).toBe(true);
      }
    });

    it('should block 6th impersonation', async () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        const context = createMockContext('user-1', 'user.impersonate_start');
        await guard.canActivate(context);
      }

      // 6th request should be blocked
      const context = createMockContext('user-1', 'user.impersonate_start');

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    });
  });

  describe('User Isolation', () => {
    it('should isolate limits by user', async () => {
      // User 1 exhausts their limit
      for (let i = 0; i < 10; i++) {
        const context = createMockContext('user-1', 'user.ban');
        await guard.canActivate(context);
      }

      // User 1 should be blocked
      const context1 = createMockContext('user-1', 'user.ban');
      await expect(guard.canActivate(context1)).rejects.toThrow(HttpException);

      // User 2 should still be allowed
      const context2 = createMockContext('user-2', 'user.ban');
      const result = await guard.canActivate(context2);
      expect(result).toBe(true);
    });
  });

  describe('Action Isolation', () => {
    it('should isolate limits by action', async () => {
      // User exhausts ban limit
      for (let i = 0; i < 10; i++) {
        const context = createMockContext('user-1', 'user.ban');
        await guard.canActivate(context);
      }

      // Ban should be blocked
      const banContext = createMockContext('user-1', 'user.ban');
      await expect(guard.canActivate(banContext)).rejects.toThrow(HttpException);

      // But password reset should still work
      const resetContext = createMockContext('user-1', 'user.password_reset');
      const result = await guard.canActivate(resetContext);
      expect(result).toBe(true);
    });
  });

  describe('Window Expiration', () => {
    it('should reset after window expires', async () => {
      vi.useFakeTimers();

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        const context = createMockContext('user-1', 'user.ban');
        await guard.canActivate(context);
      }

      // Should be blocked
      const blockedContext = createMockContext('user-1', 'user.ban');
      await expect(guard.canActivate(blockedContext)).rejects.toThrow(HttpException);

      // Advance time past the 1 minute window
      vi.advanceTimersByTime(61 * 1000);

      // Should be allowed again
      const allowedContext = createMockContext('user-1', 'user.ban');
      const result = await guard.canActivate(allowedContext);
      expect(result).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('Response Format', () => {
    it('should include retryAfter in seconds', async () => {
      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        const context = createMockContext('user-1', 'user.ban');
        await guard.canActivate(context);
      }

      // Trigger error
      const context = createMockContext('user-1', 'user.ban');

      try {
        await guard.canActivate(context);
        expect.fail('Should have thrown');
      } catch (error) {
        const response = (error as HttpException).getResponse() as any;
        expect(response.retryAfter).toBeGreaterThan(0);
        expect(response.retryAfter).toBeLessThanOrEqual(60); // 1 minute window
      }
    });

    it('should return 429 status code', async () => {
      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        const context = createMockContext('user-1', 'user.ban');
        await guard.canActivate(context);
      }

      // Trigger error
      const context = createMockContext('user-1', 'user.ban');

      try {
        await guard.canActivate(context);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(429);
      }
    });
  });
});
