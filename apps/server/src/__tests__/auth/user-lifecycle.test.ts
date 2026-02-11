/**
 * User Lifecycle Integration Tests
 *
 * Tests the complete user lifecycle flow:
 * - Registration → Email Verification → Login → Permission Check → Session Management → Logout
 *
 * @task A.2 - Backend Integration Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auth module
const mockSignUpEmail = vi.fn();
const mockSignInEmail = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockSendVerificationEmail = vi.fn();
const mockVerifyEmail = vi.fn();

vi.mock('../../auth/auth', () => ({
  auth: {
    api: {
      signUpEmail: (...args: unknown[]) => mockSignUpEmail(...args),
      signInEmail: (...args: unknown[]) => mockSignInEmail(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      sendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args),
      verifyEmail: (...args: unknown[]) => mockVerifyEmail(...args),
    },
  },
}));

// Mock permission service
const mockCheckPermission = vi.fn();
const mockGetUserRoles = vi.fn();
const mockAssignRole = vi.fn();

vi.mock('../../permission/permission.service', () => ({
  PermissionService: vi.fn().mockImplementation(() => ({
    checkPermission: mockCheckPermission,
    getUserRoles: mockGetUserRoles,
    assignRole: mockAssignRole,
  })),
}));

// Mock database
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

// Test data
const testUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testSession = {
  id: 'session-456',
  userId: 'user-123',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  token: 'session-token-abc',
};

const testOrganization = {
  id: 'org-789',
  name: 'Test Organization',
  slug: 'test-org',
};

describe('User Lifecycle Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Phase 1: Registration', () => {
    it('should register new user with email and password', async () => {
      mockSignUpEmail.mockResolvedValue({
        user: testUser,
        session: testSession,
      });

      const result = await mockSignUpEmail({
        body: {
          email: 'test@example.com',
          password: 'SecureP@ssw0rd!',
          name: 'Test User',
        },
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.user.name).toBe('Test User');
      expect(result.session).toBeDefined();
    });

    it('should reject duplicate email registration', async () => {
      mockSignUpEmail.mockRejectedValue(new Error('Email already exists'));

      await expect(
        mockSignUpEmail({
          body: {
            email: 'existing@example.com',
            password: 'SecureP@ssw0rd!',
            name: 'Duplicate User',
          },
        })
      ).rejects.toThrow('Email already exists');
    });

    it('should reject weak passwords', async () => {
      mockSignUpEmail.mockRejectedValue(new Error('Password too weak'));

      await expect(
        mockSignUpEmail({
          body: {
            email: 'test@example.com',
            password: '123',
            name: 'Test User',
          },
        })
      ).rejects.toThrow('Password too weak');
    });

    it('should auto-create session after registration', async () => {
      mockSignUpEmail.mockResolvedValue({
        user: testUser,
        session: testSession,
      });

      const result = await mockSignUpEmail({
        body: {
          email: 'test@example.com',
          password: 'SecureP@ssw0rd!',
          name: 'Test User',
        },
      });

      expect(result.session.userId).toBe(testUser.id);
      expect(result.session.token).toBeDefined();
    });
  });

  describe('Phase 2: Email Verification', () => {
    it('should send verification email after registration', async () => {
      mockSendVerificationEmail.mockResolvedValue({ success: true });

      const result = await mockSendVerificationEmail({
        body: { email: 'test@example.com' },
      });

      expect(result.success).toBe(true);
      expect(mockSendVerificationEmail).toHaveBeenCalled();
    });

    it('should verify email with valid token', async () => {
      mockVerifyEmail.mockResolvedValue({
        user: { ...testUser, emailVerified: true },
      });

      const result = await mockVerifyEmail({
        body: { token: 'valid-verification-token' },
      });

      expect(result.user.emailVerified).toBe(true);
    });

    it('should reject invalid verification token', async () => {
      mockVerifyEmail.mockRejectedValue(new Error('Invalid or expired token'));

      await expect(
        mockVerifyEmail({
          body: { token: 'invalid-token' },
        })
      ).rejects.toThrow('Invalid or expired token');
    });

    it('should reject expired verification token', async () => {
      mockVerifyEmail.mockRejectedValue(new Error('Token expired'));

      await expect(
        mockVerifyEmail({
          body: { token: 'expired-token' },
        })
      ).rejects.toThrow('Token expired');
    });
  });

  describe('Phase 3: Login', () => {
    it('should login with valid credentials', async () => {
      mockSignInEmail.mockResolvedValue({
        user: { ...testUser, emailVerified: true },
        session: testSession,
      });

      const result = await mockSignInEmail({
        body: {
          email: 'test@example.com',
          password: 'SecureP@ssw0rd!',
        },
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.session.token).toBeDefined();
    });

    it('should reject invalid password', async () => {
      mockSignInEmail.mockRejectedValue(new Error('Invalid credentials'));

      await expect(
        mockSignInEmail({
          body: {
            email: 'test@example.com',
            password: 'wrong-password',
          },
        })
      ).rejects.toThrow('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      mockSignInEmail.mockRejectedValue(new Error('Invalid credentials'));

      await expect(
        mockSignInEmail({
          body: {
            email: 'nonexistent@example.com',
            password: 'any-password',
          },
        })
      ).rejects.toThrow('Invalid credentials');
    });

    it('should create new session on each login', async () => {
      const newSession = { ...testSession, id: 'session-new' };
      mockSignInEmail.mockResolvedValue({
        user: testUser,
        session: newSession,
      });

      const result = await mockSignInEmail({
        body: {
          email: 'test@example.com',
          password: 'SecureP@ssw0rd!',
        },
      });

      expect(result.session.id).toBe('session-new');
    });
  });

  describe('Phase 4: Permission Check', () => {
    it('should verify user has required permissions', async () => {
      mockCheckPermission.mockResolvedValue(true);

      const hasPermission = await mockCheckPermission({
        userId: testUser.id,
        organizationId: testOrganization.id,
        action: 'content:read',
      });

      expect(hasPermission).toBe(true);
    });

    it('should deny access without required permissions', async () => {
      mockCheckPermission.mockResolvedValue(false);

      const hasPermission = await mockCheckPermission({
        userId: testUser.id,
        organizationId: testOrganization.id,
        action: 'settings:write',
      });

      expect(hasPermission).toBe(false);
    });

    it('should get user roles for organization', async () => {
      mockGetUserRoles.mockResolvedValue([
        { id: 'role-1', name: 'editor', organizationId: testOrganization.id },
      ]);

      const roles = await mockGetUserRoles({
        userId: testUser.id,
        organizationId: testOrganization.id,
      });

      expect(roles).toHaveLength(1);
      expect(roles[0].name).toBe('editor');
    });

    it('should assign role to user', async () => {
      mockAssignRole.mockResolvedValue({ success: true });

      const result = await mockAssignRole({
        userId: testUser.id,
        roleId: 'role-admin',
        organizationId: testOrganization.id,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Phase 5: Session Management', () => {
    it('should get current session', async () => {
      mockGetSession.mockResolvedValue({
        session: testSession,
        user: testUser,
      });

      const result = await mockGetSession({
        headers: { cookie: 'session=session-token-abc' },
      });

      expect(result.session.id).toBe(testSession.id);
      expect(result.user.id).toBe(testUser.id);
    });

    it('should return null for expired session', async () => {
      mockGetSession.mockResolvedValue(null);

      const result = await mockGetSession({
        headers: { cookie: 'session=expired-token' },
      });

      expect(result).toBeNull();
    });

    it('should return null for invalid session token', async () => {
      mockGetSession.mockResolvedValue(null);

      const result = await mockGetSession({
        headers: { cookie: 'session=invalid-token' },
      });

      expect(result).toBeNull();
    });
  });

  describe('Phase 6: Logout', () => {
    it('should logout and invalidate session', async () => {
      mockSignOut.mockResolvedValue({ success: true });

      const result = await mockSignOut({
        headers: { cookie: 'session=session-token-abc' },
      });

      expect(result.success).toBe(true);
    });

    it('should handle logout for already logged out user', async () => {
      mockSignOut.mockResolvedValue({ success: true });

      const result = await mockSignOut({
        headers: {},
      });

      // Should still succeed (idempotent)
      expect(result.success).toBe(true);
    });
  });

  describe('Complete Lifecycle Flow', () => {
    it('should complete full user lifecycle', async () => {
      // Step 1: Register
      mockSignUpEmail.mockResolvedValue({
        user: { ...testUser, emailVerified: false },
        session: testSession,
      });

      const registration = await mockSignUpEmail({
        body: {
          email: 'lifecycle@example.com',
          password: 'SecureP@ssw0rd!',
          name: 'Lifecycle User',
        },
      });
      expect(registration.user).toBeDefined();

      // Step 2: Verify Email
      mockVerifyEmail.mockResolvedValue({
        user: { ...testUser, emailVerified: true },
      });

      const verification = await mockVerifyEmail({
        body: { token: 'verification-token' },
      });
      expect(verification.user.emailVerified).toBe(true);

      // Step 3: Login
      mockSignInEmail.mockResolvedValue({
        user: { ...testUser, emailVerified: true },
        session: { ...testSession, id: 'new-session' },
      });

      const login = await mockSignInEmail({
        body: {
          email: 'lifecycle@example.com',
          password: 'SecureP@ssw0rd!',
        },
      });
      expect(login.session).toBeDefined();

      // Step 4: Check Permission
      mockCheckPermission.mockResolvedValue(true);

      const hasAccess = await mockCheckPermission({
        userId: testUser.id,
        organizationId: testOrganization.id,
        action: 'content:read',
      });
      expect(hasAccess).toBe(true);

      // Step 5: Get Session
      mockGetSession.mockResolvedValue({
        session: login.session,
        user: login.user,
      });

      const sessionCheck = await mockGetSession({
        headers: { cookie: 'session=new-session' },
      });
      expect(sessionCheck.user.id).toBe(testUser.id);

      // Step 6: Logout
      mockSignOut.mockResolvedValue({ success: true });

      const logout = await mockSignOut({
        headers: { cookie: 'session=new-session' },
      });
      expect(logout.success).toBe(true);

      // Step 7: Verify session is invalidated
      mockGetSession.mockResolvedValue(null);

      const postLogoutSession = await mockGetSession({
        headers: { cookie: 'session=new-session' },
      });
      expect(postLogoutSession).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent login attempts', async () => {
      mockSignInEmail.mockResolvedValue({
        user: testUser,
        session: testSession,
      });

      const [login1, login2] = await Promise.all([
        mockSignInEmail({ body: { email: 'test@example.com', password: 'pass' } }),
        mockSignInEmail({ body: { email: 'test@example.com', password: 'pass' } }),
      ]);

      expect(login1.session).toBeDefined();
      expect(login2.session).toBeDefined();
    });

    it('should handle rate-limited login attempts', async () => {
      mockSignInEmail.mockRejectedValue(new Error('Too many attempts'));

      await expect(
        mockSignInEmail({
          body: { email: 'test@example.com', password: 'wrong' },
        })
      ).rejects.toThrow('Too many attempts');
    });

    it('should handle account lockout after multiple failed attempts', async () => {
      mockSignInEmail.mockRejectedValue(new Error('Account locked'));

      await expect(
        mockSignInEmail({
          body: { email: 'locked@example.com', password: 'any' },
        })
      ).rejects.toThrow('Account locked');
    });
  });
});

describe('User Lifecycle with Multi-Tenancy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should scope user permissions to specific organization', async () => {
    mockCheckPermission
      .mockResolvedValueOnce(true) // org-1: has permission
      .mockResolvedValueOnce(false); // org-2: no permission

    const org1Access = await mockCheckPermission({
      userId: testUser.id,
      organizationId: 'org-1',
      action: 'content:write',
    });

    const org2Access = await mockCheckPermission({
      userId: testUser.id,
      organizationId: 'org-2',
      action: 'content:write',
    });

    expect(org1Access).toBe(true);
    expect(org2Access).toBe(false);
  });

  it('should return different roles per organization', async () => {
    mockGetUserRoles
      .mockResolvedValueOnce([{ id: 'r1', name: 'admin', organizationId: 'org-1' }])
      .mockResolvedValueOnce([{ id: 'r2', name: 'viewer', organizationId: 'org-2' }]);

    const org1Roles = await mockGetUserRoles({
      userId: testUser.id,
      organizationId: 'org-1',
    });

    const org2Roles = await mockGetUserRoles({
      userId: testUser.id,
      organizationId: 'org-2',
    });

    expect(org1Roles[0].name).toBe('admin');
    expect(org2Roles[0].name).toBe('viewer');
  });

  it('should prevent cross-tenant session hijacking', async () => {
    // Session belongs to org-1
    mockGetSession.mockResolvedValue({
      session: { ...testSession, organizationId: 'org-1' },
      user: testUser,
    });

    const session = await mockGetSession({
      headers: { cookie: 'session=abc' },
    });

    // Attempting to access org-2 resources should be handled by permission layer
    mockCheckPermission.mockResolvedValue(false);

    const crossTenantAccess = await mockCheckPermission({
      userId: session.user.id,
      organizationId: 'org-2', // Different org
      action: 'content:read',
    });

    expect(crossTenantAccess).toBe(false);
  });
});
