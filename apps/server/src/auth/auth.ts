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
import { organization } from 'better-auth/plugins';
import { db } from '../db';

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
    ],

    // Trust host for development
    trustedOrigins: [
        'http://localhost:3000',
        'http://localhost:3001',
    ],
});

// Export type for client
export type Auth = typeof auth;
