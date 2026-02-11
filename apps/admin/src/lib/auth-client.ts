/**
 * Better Auth Client
 *
 * Client-side authentication using better-auth.
 * Connects to the server's /api/auth/* endpoints.
 */
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

// Create auth client - connects to same origin by default
export const authClient = createAuthClient({
    baseURL: import.meta.env.DEV ? 'http://localhost:3000' : undefined,
    plugins: [
        organizationClient(),
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
