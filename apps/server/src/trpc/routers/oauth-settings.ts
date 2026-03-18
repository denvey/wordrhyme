/**
 * OAuth Settings Router
 *
 * Provides API for managing OAuth social login provider configuration.
 * Uses the Settings system for storage with encryption for secrets.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { SettingsService } from '../../settings/settings.service.js';
import { rebuildAuth } from '../../auth/auth.js';

// OAuth provider types
const oauthProviderSchema = z.enum(['google', 'github', 'apple']);
type OAuthProvider = z.infer<typeof oauthProviderSchema>;

// Settings keys for each provider
const OAUTH_SETTINGS_PREFIX = 'auth.oauth';

function getOAuthEnv() {
    return {
        BETTER_AUTH_URL: process.env['BETTER_AUTH_URL'],
        PUBLIC_URL: process.env['PUBLIC_URL'],
        GOOGLE_CLIENT_ID: process.env['GOOGLE_CLIENT_ID'],
        GOOGLE_CLIENT_SECRET: process.env['GOOGLE_CLIENT_SECRET'],
        GITHUB_CLIENT_ID: process.env['GITHUB_CLIENT_ID'],
        GITHUB_CLIENT_SECRET: process.env['GITHUB_CLIENT_SECRET'],
        APPLE_CLIENT_ID: process.env['APPLE_CLIENT_ID'],
        APPLE_CLIENT_SECRET: process.env['APPLE_CLIENT_SECRET'],
        APPLE_TEAM_ID: process.env['APPLE_TEAM_ID'],
        APPLE_KEY_ID: process.env['APPLE_KEY_ID'],
    };
}

export interface ProviderConfig {
    enabled: boolean;
    clientId: string | null;
    clientSecret: string | null;
    // Apple-specific
    teamId?: string | null;
    keyId?: string | null;
}

export interface ProviderInfo {
    provider: OAuthProvider;
    enabled: boolean;
    configured: boolean;
    callbackUrl: string;
}

// Singleton instance
let settingsService: SettingsService;

export function setOAuthSettingsService(service: SettingsService) {
    settingsService = service;
}

/**
 * Get OAuth setting key
 */
function getKey(provider: OAuthProvider, field: string): string {
    return `${OAUTH_SETTINGS_PREFIX}.${provider}.${field}`;
}

/**
 * Get callback URL for a provider
 */
function getCallbackUrl(provider: OAuthProvider): string {
    const { BETTER_AUTH_URL, PUBLIC_URL } = getOAuthEnv();
    const baseUrl = BETTER_AUTH_URL || PUBLIC_URL || 'http://localhost:3000';
    return `${baseUrl}/api/auth/callback/${provider}`;
}

/**
 * Mask a secret value for display
 */
function maskSecret(value: string | null): string | null {
    if (!value) return null;
    if (value.length <= 8) return '••••••••';
    return value.substring(0, 4) + '••••••••' + value.substring(value.length - 4);
}

/**
 * OAuth Settings tRPC Router
 */
export const oauthSettingsRouter = router({
    /**
     * List all OAuth providers with their status
     * Requires: read PlatformOAuth permission
     */
    list: protectedProcedure
        .meta({ permission: { action: 'read', subject: 'PlatformOAuth' } })
        .query(async (): Promise<ProviderInfo[]> => {
            if (!settingsService) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Settings service not initialized',
                });
            }

            const providers: OAuthProvider[] = ['google', 'github', 'apple'];
            const result: ProviderInfo[] = [];

            for (const provider of providers) {
                const enabled = await settingsService.get('global', getKey(provider, 'enabled'), {
                    defaultValue: false,
                }) as boolean;

                const clientId = await settingsService.get('global', getKey(provider, 'clientId'), {
                    defaultValue: null,
                }) as string | null;

                // Check if configured from env vars (fallback)
                const envClientId = getEnvClientId(provider);
                const isConfigured = !!(clientId || envClientId);

                result.push({
                    provider,
                    enabled: enabled || (isConfigured && !clientId), // env-configured providers are implicitly enabled
                    configured: isConfigured,
                    callbackUrl: getCallbackUrl(provider),
                });
            }

            return result;
        }),

    /**
     * Get a single provider's configuration
     * Secrets are masked for security
     */
    get: protectedProcedure
        .meta({ permission: { action: 'read', subject: 'PlatformOAuth' } })
        .input(z.object({ provider: oauthProviderSchema }))
        .query(async ({ input }): Promise<ProviderConfig & { callbackUrl: string; configuredFromEnv: boolean }> => {
            if (!settingsService) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Settings service not initialized',
                });
            }

            const { provider } = input;

            // Get from database
            const enabled = await settingsService.get('global', getKey(provider, 'enabled'), {
                defaultValue: false,
            }) as boolean;

            const clientId = await settingsService.get('global', getKey(provider, 'clientId'), {
                defaultValue: null,
            }) as string | null;

            const clientSecret = await settingsService.get('global', getKey(provider, 'clientSecret'), {
                defaultValue: null,
            }) as string | null;

            // Apple-specific fields
            let teamId: string | null = null;
            let keyId: string | null = null;

            if (provider === 'apple') {
                teamId = await settingsService.get('global', getKey(provider, 'teamId'), {
                    defaultValue: null,
                }) as string | null;

                keyId = await settingsService.get('global', getKey(provider, 'keyId'), {
                    defaultValue: null,
                }) as string | null;
            }

            // Check if configured from env
            const envClientId = getEnvClientId(provider);
            const configuredFromEnv = !!envClientId && !clientId;

            return {
                enabled: enabled || configuredFromEnv,
                clientId: clientId || (configuredFromEnv ? envClientId : null),
                clientSecret: maskSecret(clientSecret) || (configuredFromEnv ? '••••••••' : null),
                teamId,
                keyId,
                callbackUrl: getCallbackUrl(provider),
                configuredFromEnv,
            };
        }),

    /**
     * Update provider configuration
     */
    set: protectedProcedure
        .meta({ permission: { action: 'update', subject: 'PlatformOAuth' } })
        .input(z.object({
            provider: oauthProviderSchema,
            enabled: z.boolean(),
            clientId: z.string().optional(),
            clientSecret: z.string().optional(),
            teamId: z.string().optional(),
            keyId: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            if (!settingsService) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Settings service not initialized',
                });
            }

            const { provider, enabled, clientId, clientSecret, teamId, keyId } = input;

            // Save enabled status
            await settingsService.set('global', getKey(provider, 'enabled'), enabled, {
                valueType: 'boolean',
                description: `Enable ${provider} OAuth login`,
            });

            // Save clientId if provided
            if (clientId !== undefined) {
                await settingsService.set('global', getKey(provider, 'clientId'), clientId, {
                    valueType: 'string',
                    description: `${provider} OAuth Client ID`,
                });
            }

            // Save clientSecret if provided (encrypted)
            if (clientSecret !== undefined && !clientSecret.includes('••••')) {
                await settingsService.set('global', getKey(provider, 'clientSecret'), clientSecret, {
                    valueType: 'string',
                    encrypted: true,
                    description: `${provider} OAuth Client Secret`,
                });
            }

            // Apple-specific fields
            if (provider === 'apple') {
                if (teamId !== undefined) {
                    await settingsService.set('global', getKey(provider, 'teamId'), teamId, {
                        valueType: 'string',
                        description: 'Apple Team ID',
                    });
                }
                if (keyId !== undefined) {
                    await settingsService.set('global', getKey(provider, 'keyId'), keyId, {
                        valueType: 'string',
                        description: 'Apple Key ID',
                    });
                }
            }

            // Rebuild auth instance with updated social providers
            await rebuildAuth();

            return { success: true, provider };
        }),

    /**
     * Get enabled providers (public for login page)
     * Returns only provider names, no secrets
     */
    getEnabledProviders: publicProcedure
        .query(async (): Promise<OAuthProvider[]> => {
            if (!settingsService) {
                // Fallback to env-based detection
                return getEnvEnabledProviders();
            }

            const providers: OAuthProvider[] = ['google', 'github', 'apple'];
            const enabled: OAuthProvider[] = [];

            for (const provider of providers) {
                // Check database first
                const dbEnabled = await settingsService.get('global', getKey(provider, 'enabled'), {
                    defaultValue: null,
                });

                if (dbEnabled === true) {
                    const clientId = await settingsService.get('global', getKey(provider, 'clientId'), {
                        defaultValue: null,
                    });
                    if (clientId) {
                        enabled.push(provider);
                        continue;
                    }
                }

                // Fallback to env vars
                const envClientId = getEnvClientId(provider);
                const envClientSecret = getEnvClientSecret(provider);
                if (envClientId && envClientSecret) {
                    // Check Apple-specific requirements
                    if (provider === 'apple') {
                        const { APPLE_TEAM_ID, APPLE_KEY_ID } = getOAuthEnv();
                        if (APPLE_TEAM_ID && APPLE_KEY_ID) {
                            enabled.push(provider);
                        }
                    } else {
                        enabled.push(provider);
                    }
                }
            }

            return enabled;
        }),
});

/**
 * Get client ID from environment variable
 */
function getEnvClientId(provider: OAuthProvider): string | null {
    const { GOOGLE_CLIENT_ID, GITHUB_CLIENT_ID, APPLE_CLIENT_ID } = getOAuthEnv();
    switch (provider) {
        case 'google':
            return GOOGLE_CLIENT_ID || null;
        case 'github':
            return GITHUB_CLIENT_ID || null;
        case 'apple':
            return APPLE_CLIENT_ID || null;
    }
}

/**
 * Get client secret from environment variable
 */
function getEnvClientSecret(provider: OAuthProvider): string | null {
    const { GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_SECRET, APPLE_CLIENT_SECRET } = getOAuthEnv();
    switch (provider) {
        case 'google':
            return GOOGLE_CLIENT_SECRET || null;
        case 'github':
            return GITHUB_CLIENT_SECRET || null;
        case 'apple':
            return APPLE_CLIENT_SECRET || null;
    }
}

/**
 * Get enabled providers from environment variables only
 */
function getEnvEnabledProviders(): OAuthProvider[] {
    const {
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GITHUB_CLIENT_ID,
        GITHUB_CLIENT_SECRET,
        APPLE_CLIENT_ID,
        APPLE_CLIENT_SECRET,
        APPLE_TEAM_ID,
        APPLE_KEY_ID,
    } = getOAuthEnv();
    const enabled: OAuthProvider[] = [];

    if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
        enabled.push('google');
    }
    if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
        enabled.push('github');
    }
    if (
        APPLE_CLIENT_ID &&
        APPLE_CLIENT_SECRET &&
        APPLE_TEAM_ID &&
        APPLE_KEY_ID
    ) {
        enabled.push('apple');
    }

    return enabled;
}

export type OAuthSettingsRouter = typeof oauthSettingsRouter;
