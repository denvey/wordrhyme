/**
 * Better Auth Configuration
 *
 * Centralized authentication configuration using better-auth with:
 * - Email/password authentication
 * - Organization (multi-tenant) support
 * - Drizzle ORM adapter
 * - Audit logging for admin operations
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAccessControl } from 'better-auth/plugins/access';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { admin, organization } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { db, member } from '../db';
import { auditLogs } from '../db/schema/audit-logs';

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
    tenantId?: string | undefined;
    targetUserId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}): Promise<void> {
    try {
        await db.insert(auditLogs).values({
            actorType: 'user',
            actorId: params.actorId ?? 'anonymous',
            tenantId: params.tenantId ?? 'system',
            organizationId: params.tenantId ?? null,
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
        requireEmailVerification: false, // MVP: skip email verification
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
        }),
        admin({
            // Default role for new users
            defaultRole: 'user',
            // Roles that can perform admin operations
            adminRoles: ['admin', 'super-admin', 'platform-admin'],
            // Impersonation session expires after 1 hour
            impersonationSessionDuration: 60 * 60,
            roles: {
                admin: adminRole,
                user: userRole,
                "super-admin": adminRole,
                "platform-admin": adminRole,
            }
        }),
    ],

    // Trust host for development
    trustedOrigins: [
        'http://localhost:3000',
        'http://localhost:3001',
    ],

    // Audit logging hooks for admin and organization operations
    hooks: {
        after: createAuthMiddleware(async (ctx) => {
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
            const organizationId = body?.['organizationId'] as string | undefined;
            const activeOrgId = session?.session?.['activeOrganizationId'] as string | undefined;

            // Build audit params
            const actorId = session?.user?.id;
            const tenantId = organizationId ?? activeOrgId;

            // Log the audit entry (non-blocking)
            logAuditEntry({
                action: auditAction,
                success,
                actorId: actorId ?? undefined,
                tenantId: tenantId ?? undefined,
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
