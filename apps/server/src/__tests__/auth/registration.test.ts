/**
 * User Registration Tests
 *
 * Tests the complete registration flow including:
 * - Email/password signup
 * - Input validation
 * - Email verification notification creation
 * - Organization creation for new users
 * - Default role assignment
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// Registration schema (mirrors frontend validation)
const registerSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

// Mock user storage
interface MockUser {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
}

interface MockOrganization {
    id: string;
    name: string;
    slug: string;
    createdBy: string;
}

interface MockMember {
    id: string;
    userId: string;
    organizationId: string;
    role: string;
}

interface MockNotification {
    id: string;
    userId: string;
    templateKey: string;
    channelsSent: string[];
}

let mockUsers: MockUser[] = [];
let mockOrganizations: MockOrganization[] = [];
let mockMembers: MockMember[] = [];
let mockNotifications: MockNotification[] = [];
let idCounter = 0;

/**
 * Mock Auth Service
 */
class MockAuthService {
    async signUp(input: { name: string; email: string; password: string }) {
        // Validate input
        const validation = registerSchema.safeParse(input);
        if (!validation.success) {
            return {
                error: {
                    code: 'VALIDATION_ERROR',
                    message: validation.error.errors[0]?.message || 'Invalid input',
                },
            };
        }

        // Check for existing user
        const existingUser = mockUsers.find(u => u.email === input.email);
        if (existingUser) {
            return {
                error: {
                    code: 'USER_ALREADY_EXISTS',
                    message: 'User with this email already exists',
                },
            };
        }

        // Create user
        const userId = `user-${++idCounter}`;
        const user: MockUser = {
            id: userId,
            name: input.name,
            email: input.email,
            emailVerified: false,
            createdAt: new Date(),
        };
        mockUsers.push(user);

        // Create default organization
        const orgId = `org-${++idCounter}`;
        const org: MockOrganization = {
            id: orgId,
            name: `${input.name}'s Workspace`,
            slug: input.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            createdBy: userId,
        };
        mockOrganizations.push(org);

        // Create membership with owner role
        const member: MockMember = {
            id: `member-${++idCounter}`,
            userId,
            organizationId: orgId,
            role: 'owner',
        };
        mockMembers.push(member);

        // Create verification email notification
        const notification: MockNotification = {
            id: `notif-${++idCounter}`,
            userId,
            templateKey: 'auth.email.verify',
            channelsSent: ['email'],
        };
        mockNotifications.push(notification);

        return {
            data: {
                user,
                organization: org,
            },
        };
    }

    async verifyEmail(userId: string): Promise<boolean> {
        const user = mockUsers.find(u => u.id === userId);
        if (!user) return false;

        user.emailVerified = true;
        return true;
    }

    getUser(email: string): MockUser | undefined {
        return mockUsers.find(u => u.email === email);
    }

    getOrganizationsForUser(userId: string): MockOrganization[] {
        const memberOrgIds = mockMembers
            .filter(m => m.userId === userId)
            .map(m => m.organizationId);
        return mockOrganizations.filter(o => memberOrgIds.includes(o.id));
    }

    getMembership(userId: string, orgId: string): MockMember | undefined {
        return mockMembers.find(
            m => m.userId === userId && m.organizationId === orgId
        );
    }

    getNotificationsForUser(userId: string): MockNotification[] {
        return mockNotifications.filter(n => n.userId === userId);
    }
}

describe('User Registration', () => {
    let authService: MockAuthService;

    beforeEach(() => {
        mockUsers = [];
        mockOrganizations = [];
        mockMembers = [];
        mockNotifications = [];
        idCounter = 0;
        authService = new MockAuthService();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Input Validation', () => {
        it('should reject empty name', async () => {
            const result = await authService.signUp({
                name: '',
                email: 'test@example.com',
                password: 'password123',
            });

            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe('VALIDATION_ERROR');
        });

        it('should reject name shorter than 2 characters', async () => {
            const result = await authService.signUp({
                name: 'A',
                email: 'test@example.com',
                password: 'password123',
            });

            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('2 characters');
        });

        it('should reject invalid email format', async () => {
            const result = await authService.signUp({
                name: 'Test User',
                email: 'invalid-email',
                password: 'password123',
            });

            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('email');
        });

        it('should reject password shorter than 8 characters', async () => {
            const result = await authService.signUp({
                name: 'Test User',
                email: 'test@example.com',
                password: '1234567',
            });

            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('8 characters');
        });

        it('should accept valid registration input', async () => {
            const result = await authService.signUp({
                name: 'Test User',
                email: 'test@example.com',
                password: 'password123',
            });

            expect(result.error).toBeUndefined();
            expect(result.data).toBeDefined();
        });
    });

    describe('User Creation', () => {
        it('should create user with correct data', async () => {
            const result = await authService.signUp({
                name: 'John Doe',
                email: 'john@example.com',
                password: 'securepass123',
            });

            expect(result.data?.user).toBeDefined();
            expect(result.data?.user.name).toBe('John Doe');
            expect(result.data?.user.email).toBe('john@example.com');
            expect(result.data?.user.emailVerified).toBe(false);
        });

        it('should reject duplicate email registration', async () => {
            // First registration
            await authService.signUp({
                name: 'First User',
                email: 'duplicate@example.com',
                password: 'password123',
            });

            // Second registration with same email
            const result = await authService.signUp({
                name: 'Second User',
                email: 'duplicate@example.com',
                password: 'password456',
            });

            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe('USER_ALREADY_EXISTS');
        });

        it('should allow different emails with same name', async () => {
            const result1 = await authService.signUp({
                name: 'John Doe',
                email: 'john1@example.com',
                password: 'password123',
            });

            const result2 = await authService.signUp({
                name: 'John Doe',
                email: 'john2@example.com',
                password: 'password456',
            });

            expect(result1.error).toBeUndefined();
            expect(result2.error).toBeUndefined();
            expect(mockUsers.length).toBe(2);
        });
    });

    describe('Organization Creation', () => {
        it('should create default organization for new user', async () => {
            const result = await authService.signUp({
                name: 'Jane Smith',
                email: 'jane@example.com',
                password: 'password123',
            });

            expect(result.data?.organization).toBeDefined();
            expect(result.data?.organization.name).toBe("Jane Smith's Workspace");
        });

        it('should set user as owner of created organization', async () => {
            const result = await authService.signUp({
                name: 'Jane Smith',
                email: 'jane@example.com',
                password: 'password123',
            });

            const userId = result.data?.user.id;
            const orgId = result.data?.organization.id;

            const membership = authService.getMembership(userId!, orgId!);
            expect(membership).toBeDefined();
            expect(membership?.role).toBe('owner');
        });

        it('should generate organization slug from user name', async () => {
            const result = await authService.signUp({
                name: 'John Doe',
                email: 'john@example.com',
                password: 'password123',
            });

            expect(result.data?.organization.slug).toBe('john-doe');
        });
    });

    describe('Email Verification', () => {
        it('should create verification notification on signup', async () => {
            const result = await authService.signUp({
                name: 'Test User',
                email: 'test@example.com',
                password: 'password123',
            });

            const userId = result.data?.user.id;
            const notifications = authService.getNotificationsForUser(userId!);

            expect(notifications.length).toBe(1);
            expect(notifications[0]?.templateKey).toBe('auth.email.verify');
            expect(notifications[0]?.channelsSent).toContain('email');
        });

        it('should have emailVerified = false initially', async () => {
            const result = await authService.signUp({
                name: 'Test User',
                email: 'test@example.com',
                password: 'password123',
            });

            expect(result.data?.user.emailVerified).toBe(false);
        });

        it('should set emailVerified = true after verification', async () => {
            const result = await authService.signUp({
                name: 'Test User',
                email: 'test@example.com',
                password: 'password123',
            });

            const userId = result.data?.user.id;
            await authService.verifyEmail(userId!);

            const user = authService.getUser('test@example.com');
            expect(user?.emailVerified).toBe(true);
        });
    });

    describe('Data Integrity', () => {
        it('should properly link user, organization, and membership', async () => {
            const result = await authService.signUp({
                name: 'Test User',
                email: 'test@example.com',
                password: 'password123',
            });

            const userId = result.data?.user.id!;

            // Check user exists
            const user = authService.getUser('test@example.com');
            expect(user).toBeDefined();
            expect(user?.id).toBe(userId);

            // Check organization exists and is linked
            const orgs = authService.getOrganizationsForUser(userId);
            expect(orgs.length).toBe(1);
            expect(orgs[0]?.createdBy).toBe(userId);

            // Check membership exists
            const membership = authService.getMembership(userId, orgs[0]!.id);
            expect(membership).toBeDefined();
            expect(membership?.role).toBe('owner');
        });
    });
});
