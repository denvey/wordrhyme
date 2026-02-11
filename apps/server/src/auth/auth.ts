/**
 * Better Auth Configuration
 *
 * Centralized authentication configuration using better-auth with:
 * - Email/password authentication
 * - Organization (multi-tenant) support
 * - Drizzle ORM adapter
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAccessControl } from 'better-auth/plugins/access';
import { admin, organization } from 'better-auth/plugins';
import { db } from '../db';

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
});

// Export type for client
export type Auth = typeof auth;
