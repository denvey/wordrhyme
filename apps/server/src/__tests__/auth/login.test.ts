/**
 * User Login Tests
 *
 * Tests the complete login flow including:
 * - Email/password authentication
 * - Session creation
 * - Email verification enforcement
 * - Invalid credentials handling
 * - Multi-tenant session context
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock types
interface MockUser {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    emailVerified: boolean;
}

interface MockSession {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    organizationId: string | undefined;
}

interface MockMember {
    userId: string;
    organizationId: string;
    role: string;
}

// Mock data stores
let mockUsers: MockUser[] = [];
let mockSessions: MockSession[] = [];
let mockMembers: MockMember[] = [];
let idCounter = 0;

/**
 * Simple password hashing mock
 */
function hashPassword(password: string): string {
    return `hashed_${password}`;
}

function verifyPassword(password: string, hash: string): boolean {
    return hash === `hashed_${password}`;
}

/**
 * Mock Auth Service for Login
 */
class MockLoginService {
    async signIn(input: { email: string; password: string; requireEmailVerification?: boolean }) {
        const { email, password, requireEmailVerification = false } = input;

        // Find user by email
        const user = mockUsers.find(u => u.email === email);
        if (!user) {
            return {
                error: {
                    code: 'INVALID_CREDENTIALS',
                    message: 'Invalid email or password',
                },
            };
        }

        // Verify password
        if (!verifyPassword(password, user.passwordHash)) {
            return {
                error: {
                    code: 'INVALID_CREDENTIALS',
                    message: 'Invalid email or password',
                },
            };
        }

        // Check email verification if required
        if (requireEmailVerification && !user.emailVerified) {
            return {
                error: {
                    code: 'EMAIL_NOT_VERIFIED',
                    message: 'Please verify your email before logging in',
                },
            };
        }

        // Get user's organizations
        const memberships = mockMembers.filter(m => m.userId === user.id);
        const defaultOrgId = memberships[0]?.organizationId;

        // Create session
        const session: MockSession = {
            id: `session-${++idCounter}`,
            userId: user.id,
            token: `token_${Date.now()}_${Math.random().toString(36)}`,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            organizationId: defaultOrgId,
        };
        mockSessions.push(session);

        return {
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    emailVerified: user.emailVerified,
                },
                session: {
                    id: session.id,
                    token: session.token,
                    expiresAt: session.expiresAt,
                },
                organizationId: defaultOrgId,
            },
        };
    }

    async signOut(sessionId: string): Promise<boolean> {
        const index = mockSessions.findIndex(s => s.id === sessionId);
        if (index === -1) return false;

        mockSessions.splice(index, 1);
        return true;
    }

    async validateSession(token: string): Promise<MockSession | null> {
        const session = mockSessions.find(s => s.token === token);
        if (!session) return null;

        // Check expiration
        if (new Date() > session.expiresAt) {
            // Remove expired session
            const index = mockSessions.findIndex(s => s.id === session.id);
            if (index !== -1) mockSessions.splice(index, 1);
            return null;
        }

        return session;
    }

    async switchOrganization(sessionId: string, organizationId: string): Promise<boolean> {
        const session = mockSessions.find(s => s.id === sessionId);
        if (!session) return false;

        // Verify user is member of organization
        const membership = mockMembers.find(
            m => m.userId === session.userId && m.organizationId === organizationId
        );
        if (!membership) return false;

        session.organizationId = organizationId;
        return true;
    }

    getActiveSessionsCount(userId: string): number {
        return mockSessions.filter(s => s.userId === userId).length;
    }
}

describe('User Login', () => {
    let loginService: MockLoginService;

    beforeEach(() => {
        mockUsers = [];
        mockSessions = [];
        mockMembers = [];
        idCounter = 0;
        loginService = new MockLoginService();

        // Seed test users
        mockUsers.push(
            {
                id: 'user-1',
                name: 'Verified User',
                email: 'verified@example.com',
                passwordHash: hashPassword('password123'),
                emailVerified: true,
            },
            {
                id: 'user-2',
                name: 'Unverified User',
                email: 'unverified@example.com',
                passwordHash: hashPassword('password456'),
                emailVerified: false,
            }
        );

        // Seed memberships
        mockMembers.push(
            { userId: 'user-1', organizationId: 'org-1', role: 'owner' },
            { userId: 'user-1', organizationId: 'org-2', role: 'member' },
            { userId: 'user-2', organizationId: 'org-3', role: 'owner' }
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Valid Login', () => {
        it('should login with correct credentials', async () => {
            const result = await loginService.signIn({
                email: 'verified@example.com',
                password: 'password123',
            });

            expect(result.error).toBeUndefined();
            expect(result.data).toBeDefined();
            expect(result.data?.user.email).toBe('verified@example.com');
        });

        it('should create session on successful login', async () => {
            const result = await loginService.signIn({
                email: 'verified@example.com',
                password: 'password123',
            });

            expect(result.data?.session).toBeDefined();
            expect(result.data?.session.token).toBeDefined();
            expect(result.data?.session.expiresAt).toBeInstanceOf(Date);
        });

        it('should set default organization context', async () => {
            const result = await loginService.signIn({
                email: 'verified@example.com',
                password: 'password123',
            });

            expect(result.data?.organizationId).toBe('org-1');
        });

        it('should allow login for unverified user when verification not required', async () => {
            const result = await loginService.signIn({
                email: 'unverified@example.com',
                password: 'password456',
                requireEmailVerification: false,
            });

            expect(result.error).toBeUndefined();
            expect(result.data?.user.emailVerified).toBe(false);
        });
    });

    describe('Invalid Login', () => {
        it('should reject non-existent email', async () => {
            const result = await loginService.signIn({
                email: 'nonexistent@example.com',
                password: 'password123',
            });

            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe('INVALID_CREDENTIALS');
        });

        it('should reject wrong password', async () => {
            const result = await loginService.signIn({
                email: 'verified@example.com',
                password: 'wrongpassword',
            });

            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe('INVALID_CREDENTIALS');
        });

        it('should return generic error message (no email enumeration)', async () => {
            const result1 = await loginService.signIn({
                email: 'nonexistent@example.com',
                password: 'password123',
            });

            const result2 = await loginService.signIn({
                email: 'verified@example.com',
                password: 'wrongpassword',
            });

            // Same error message for both cases
            expect(result1.error?.message).toBe('Invalid email or password');
            expect(result2.error?.message).toBe('Invalid email or password');
        });
    });

    describe('Email Verification Enforcement', () => {
        it('should reject unverified user when verification required', async () => {
            const result = await loginService.signIn({
                email: 'unverified@example.com',
                password: 'password456',
                requireEmailVerification: true,
            });

            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe('EMAIL_NOT_VERIFIED');
        });

        it('should allow verified user when verification required', async () => {
            const result = await loginService.signIn({
                email: 'verified@example.com',
                password: 'password123',
                requireEmailVerification: true,
            });

            expect(result.error).toBeUndefined();
            expect(result.data?.user.emailVerified).toBe(true);
        });
    });

    describe('Session Management', () => {
        it('should validate active session', async () => {
            const loginResult = await loginService.signIn({
                email: 'verified@example.com',
                password: 'password123',
            });

            const token = loginResult.data?.session.token!;
            const session = await loginService.validateSession(token);

            expect(session).toBeDefined();
            expect(session?.userId).toBe('user-1');
        });

        it('should reject invalid session token', async () => {
            const session = await loginService.validateSession('invalid-token');
            expect(session).toBeNull();
        });

        it('should invalidate session on logout', async () => {
            const loginResult = await loginService.signIn({
                email: 'verified@example.com',
                password: 'password123',
            });

            const sessionId = loginResult.data?.session.id!;
            const token = loginResult.data?.session.token!;

            // Logout
            await loginService.signOut(sessionId);

            // Session should be invalid
            const session = await loginService.validateSession(token);
            expect(session).toBeNull();
        });

        it('should support multiple concurrent sessions', async () => {
            // Login twice
            await loginService.signIn({
                email: 'verified@example.com',
                password: 'password123',
            });

            await loginService.signIn({
                email: 'verified@example.com',
                password: 'password123',
            });

            const count = loginService.getActiveSessionsCount('user-1');
            expect(count).toBe(2);
        });
    });

    describe('Multi-Tenant Context', () => {
        it('should switch organization context', async () => {
            const loginResult = await loginService.signIn({
                email: 'verified@example.com',
                password: 'password123',
            });

            const sessionId = loginResult.data?.session.id!;

            // Switch to org-2
            const success = await loginService.switchOrganization(sessionId, 'org-2');
            expect(success).toBe(true);

            // Verify session updated
            const session = mockSessions.find(s => s.id === sessionId);
            expect(session?.organizationId).toBe('org-2');
        });

        it('should reject switch to non-member organization', async () => {
            const loginResult = await loginService.signIn({
                email: 'verified@example.com',
                password: 'password123',
            });

            const sessionId = loginResult.data?.session.id!;

            // Try to switch to org-3 (not a member)
            const success = await loginService.switchOrganization(sessionId, 'org-3');
            expect(success).toBe(false);
        });
    });
});
