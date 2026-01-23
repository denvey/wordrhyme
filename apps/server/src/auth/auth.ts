/**
 * Better Auth Configuration
 *
 * Centralized authentication configuration using better-auth with:
 * - Email/password authentication with email verification
 * - Organization (multi-tenant) support
 * - Drizzle ORM adapter
 * - Audit logging for admin operations
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAccessControl } from 'better-auth/plugins/access';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { admin, organization, apiKey } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { db, member } from '../db';
import { auditLogs } from '../db/schema/audit-logs';
import { seedDefaultRoles } from '../db/seed/seed-roles';
import { notifications, notificationTemplates } from '../db/schema/definitions';
import { verification } from '../db/schema/auth-schema';

/**
 * HTML escape for XSS prevention in email content
 */
function escapeHtml(str: string): string {
    const htmlEscapes: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };
    return str.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
}

/**
 * Send verification email using NotificationService pattern
 *
 * Since better-auth runs outside NestJS DI context, we directly insert
 * the notification record and let the notification system handle delivery.
 */
async function sendVerificationEmailDirect(params: {
    userId: string;
    email: string;
    name: string | null;
    verificationUrl: string;
    token: string;
}): Promise<void> {
    const { userId, email, name, verificationUrl, token } = params;
    // Escape userName to prevent XSS in email content
    const userName = escapeHtml(name || email.split('@')[0] || 'User');

    try {
        // Get template
        const [template] = await db
            .select()
            .from(notificationTemplates)
            .where(eq(notificationTemplates.key, 'auth.email.verify'))
            .limit(1);

        if (!template) {
            console.warn('[Auth] Email verification template not found, skipping notification');
            console.warn('[Auth] Run: npx tsx src/db/seed/seed-auth-templates.ts');
            return;
        }

        // Render template (simple interpolation)
        const locale = 'en-US';
        const titleI18n = template.title as Record<string, string>;
        const messageI18n = template.message as Record<string, string>;

        const variables = {
            userName,
            verificationUrl,
            expiresInHours: 24,
        };

        const interpolate = (text: string, vars: Record<string, unknown>) =>
            text.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));

        const title = interpolate(titleI18n[locale] || titleI18n['en-US'] || '', variables);
        const message = interpolate(messageI18n[locale] || messageI18n['en-US'] || '', variables);

        // Insert notification record
        await db.insert(notifications).values({
            userId,
            organizationId: 'system', // User doesn't have org yet during registration
            templateKey: 'auth.email.verify',
            title,
            message,
            type: 'info', // Use valid NotificationType
            priority: 'high',
            category: 'system',
            source: 'system', // Valid NotificationSource
            channelsSent: ['email'],
            idempotencyKey: `verify-${token}`,
            metadata: {
                verificationUrl,
                email,
            },
        });

        // Note: Verification link is sent via email notification system
    } catch (error) {
        console.error('[Auth] Failed to create verification email notification:', error);
        // Don't throw - we don't want to block registration if notification fails
    }
}

const statement = {
    user: ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"],
    session: ["list", "revoke", "delete"]
} as const;

const ac = createAccessControl(statement);

const adminRole = ac.newRole({
    user: ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"],
    session: ["list", "revoke", "delete"]
});

const userRole = ac.newRole({
    user: [],
    session: []
});

/**
 * Paths that should be audit logged
 */
const AUDITED_PATHS: Record<string, string> = {
    // Admin operations
    '/admin/ban-user': 'admin.ban_user',
    '/admin/unban-user': 'admin.unban_user',
    '/admin/set-role': 'admin.set_role',
    '/admin/set-user-password': 'admin.set_password',
    '/admin/remove-user': 'admin.remove_user',
    '/admin/impersonate-user': 'admin.impersonate_start',
    '/admin/stop-impersonating': 'admin.impersonate_stop',
    '/admin/revoke-user-session': 'admin.revoke_session',
    '/admin/revoke-user-sessions': 'admin.revoke_all_sessions',
    '/admin/create-user': 'admin.create_user',
    // Organization operations
    '/organization/invite-member': 'organization.invite_member',
    '/organization/remove-member': 'organization.remove_member',
    '/organization/update-member-role': 'organization.update_role',
    '/organization/cancel-invitation': 'organization.cancel_invitation',
    '/organization/create': 'organization.create',
    '/organization/delete': 'organization.delete',
};

/**
 * Log audit entry to database (non-blocking)
 */
async function logAuditEntry(params: {
    action: string;
    success: boolean;
    actorId?: string | undefined;
    organizationId?: string | undefined;
    targetUserId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}): Promise<void> {
    try {
        const organizationId = params.organizationId ?? 'unknown';
        await db.insert(auditLogs).values({
            actorType: 'user',
            actorId: params.actorId ?? 'anonymous',
            organizationId,
            action: params.action,
            resource: params.targetUserId ? `user:${params.targetUserId}` : undefined,
            result: params.success ? 'allow' : 'deny',
            metadata: params.metadata,
        });
    } catch (error) {
        console.error('Failed to write audit log:', error);
    }
}

export const auth = betterAuth({
    // Database adapter
    database: drizzleAdapter(db, {
        provider: 'pg',
    }),

    // Email/password authentication
    emailAndPassword: {
        enabled: true,
        // Email verification required in production, optional in development
        requireEmailVerification: process.env.NODE_ENV === 'production',
    },

    // Email verification configuration
    emailVerification: {
        sendOnSignUp: true, // Send verification email on registration
        autoSignInAfterVerification: true, // Auto login after verification
        sendVerificationEmail: async ({ user, url, token }) => {
            await sendVerificationEmailDirect({
                userId: user.id,
                email: user.email,
                name: user.name,
                verificationUrl: url,
                token,
            });
        },
    },

    // Session configuration
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // Update session every 24 hours
    },

    // Database hooks - create default organization for new users
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    // Create a default personal organization for the new user
                    const email = user.email ?? '';
                    const emailPrefix = email.split('@')[0] ?? '';
                    const slug = emailPrefix.toLowerCase().replace(/[^a-z0-9]/g, '-');
                    try {
                        await auth.api.createOrganization({
                            body: {
                                name: `${user.name || emailPrefix}'s Organization`,
                                slug: `${slug}-${Date.now().toString(36)}`,
                                userId: user.id,
                            },
                        });
                    } catch (error) {
                        console.error('Failed to create default organization for user:', user.id, error);
                    }
                },
            },
        },
        session: {
            create: {
                before: async (session) => {
                    // Auto-set active organization on login if not already set
                    if (session['activeOrganizationId']) {
                        return { data: session };
                    }
                    // Find user's first organization
                    const userMemberships = await db.select()
                        .from(member)
                        .where(eq(member.userId, session.userId))
                        .limit(1);

                    const firstMembership = userMemberships[0];
                    if (firstMembership) {
                        return {
                            data: {
                                ...session,
                                activeOrganizationId: firstMembership.organizationId,
                            },
                        };
                    }
                    return { data: session };
                },
            },
        },
    },

    // Plugins
    plugins: [
        organization({
            // Organization settings
            allowUserToCreateOrganization: true,
            // NOTE: Better Auth teams disabled - we use lbac-teams plugin instead
            // The lbac-teams plugin provides hierarchical team support with ltree
            // teams: {
            //     enabled: false,
            // },
            // Extend member schema with role field for permission assignment
            schema: {
                member: {
                    additionalFields: {
                        // Role name assigned to this member (references roles table)
                        role: {
                            type: 'string',
                            required: false,
                            defaultValue: 'member',
                            input: true,
                        },
                    },
                },
            },
        }),
        admin({
            // Default role for new users
            defaultRole: 'user',
            // Roles that can perform admin operations
            adminRoles: ['admin', 'super-admin'],
            // Impersonation session expires after 1 hour
            impersonationSessionDuration: 60 * 60,
            roles: {
                admin: adminRole,
                user: userRole,
                "super-admin": adminRole,
            }
        }),
        apiKey({
            // API Key prefix for identification
            defaultPrefix: 'wr_',
            // Default expiration: 90 days
            keyExpiration: {
                defaultExpiresIn: 60 * 60 * 24 * 90 * 1000, // 90 days in ms
                minExpiresIn: 1, // 1 day minimum
                maxExpiresIn: 365, // 1 year maximum
            },
            // Enable rate limiting
            rateLimit: {
                enabled: true,
                timeWindow: 60 * 1000, // 1 minute
                maxRequests: 100, // 100 requests per minute
            },
            // Enable metadata for tenant binding
            enableMetadata: true,
        }),
    ],

    // Trust host for development
    trustedOrigins: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3004',
        'http://localhost:3005',
        'http://localhost:5173', // Admin UI (Playwright test port)
    ],

    // Audit logging hooks for admin and organization operations
    hooks: {
        after: createAuthMiddleware(async (ctx) => {
            // Handle organization creation - seed default roles
            if (ctx.path === '/organization/create') {
                const returned = ctx.context.returned;
                const isError = returned instanceof APIError ||
                    (returned && typeof returned === 'object' && 'error' in returned);

                if (!isError && returned && typeof returned === 'object') {
                    // Extract organization ID from response
                    const response = returned as Record<string, unknown>;
                    const orgId = (response['id'] ?? (response['organization'] as { id?: string } | undefined)?.id) as string | undefined;

                    if (orgId) {
                        // Seed default roles for the new organization (non-blocking)
                        seedDefaultRoles(orgId, db).catch((error) => {
                            console.error('Failed to seed default roles for org:', orgId, error);
                        });
                    }
                }
            }

            const auditAction = AUDITED_PATHS[ctx.path];
            if (!auditAction) return;

            // Get session info from context
            const session = ctx.context.session;
            const returned = ctx.context.returned;

            // Determine if operation was successful
            // APIError instances or error responses indicate failure
            const isError = returned instanceof APIError ||
                (returned && typeof returned === 'object' && 'error' in returned);
            const success = !isError;

            // Extract relevant info from request body
            const body = ctx.body as Record<string, unknown> | undefined;
            const targetUserId = body?.['userId'] as string | undefined;
            const bodyOrgId = body?.['organizationId'] as string | undefined;
            const activeOrgId = session?.session?.['activeOrganizationId'] as string | undefined;

            // Build audit params
            const actorId = session?.user?.id;
            const organizationId = bodyOrgId ?? activeOrgId;

            // Log the audit entry (non-blocking)
            logAuditEntry({
                action: auditAction,
                success,
                actorId: actorId ?? undefined,
                organizationId: organizationId ?? undefined,
                targetUserId: targetUserId ?? undefined,
                metadata: {
                    path: ctx.path,
                    method: ctx.method,
                    ip: ctx.request?.headers?.get('x-forwarded-for') ??
                        ctx.request?.headers?.get('x-real-ip'),
                    userAgent: ctx.request?.headers?.get('user-agent'),
                },
            }).catch(() => {
                // Silently ignore audit log failures
            });
        }),
    },
});

// Export type for client
export type Auth = typeof auth;
