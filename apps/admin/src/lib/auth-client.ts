/**
 * Better Auth Client
 *
 * Client-side authentication using better-auth.
 * Connects to the server's /api/auth/* endpoints.
 *
 * Plugins:
 * - organizationClient: Multi-tenant organization support
 * - adminClient: Admin operations (ban, impersonate, sessions, etc.)
 */
import { createAuthClient } from 'better-auth/react';
import { organizationClient, adminClient } from 'better-auth/client/plugins';

// Create auth client - connects to same origin by default
export const authClient = createAuthClient({
    baseURL: import.meta.env.DEV ? 'http://localhost:3000' : undefined,
    plugins: [
        organizationClient(),
        adminClient(),
    ],
});

// Export hooks for easy use
export const {
    useSession,
    signIn,
    signUp,
    signOut,
    useActiveOrganization,
} = authClient;

// Export organization methods
export const organization = authClient.organization;

// Export admin methods
export const admin = authClient.admin;
