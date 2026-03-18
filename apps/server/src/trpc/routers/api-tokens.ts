/**
 * API Tokens Router
 *
 * Provides CRUD operations for API tokens using Better Auth API Key plugin.
 * Tokens are tenant-scoped via metadata.organizationId.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, requirePermission } from '../trpc';
import { auth } from '../../auth/auth';

/**
 * Available capability scopes for API tokens
 */
const AVAILABLE_SCOPES = [
    'content:read',
    'content:write',
    'content:delete',
    'media:read',
    'media:write',
    'media:delete',
    'settings:read',
    'settings:write',
] as const;

/**
 * Input schemas
 */
const createTokenInput = z.object({
    name: z.string().min(1).max(100),
    capabilities: z.array(z.string()).min(1),
    expiresIn: z.number().optional(), // seconds
});

const tokenIdInput = z.object({
    id: z.string(),
});

/**
 * API Token Summary (returned from list/get, excludes secret)
 */
export interface ApiTokenSummary {
    id: string;
    name: string | null;
    prefix: string | null;
    capabilities: string[];
    createdAt: Date;
    expiresAt: Date | null;
    lastUsedAt: Date | null;
    enabled: boolean;
}

/**
 * Helper to extract headers from tRPC context
 */
function extractHeaders(ctx: { req: { headers: Record<string, string | string[] | undefined> } }): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(ctx.req.headers)) {
        if (value) {
            headers.set(key, Array.isArray(value) ? value[0] ?? '' : value);
        }
    }
    return headers;
}

/**
 * API Tokens Router
 */
export const apiTokensRouter = router({
    /**
     * List available scopes for UI dropdown
     */
    scopes: protectedProcedure.query(() => {
        return AVAILABLE_SCOPES.map((scope) => ({
            value: scope,
            label: scope.replace(':', ': ').replace(/^\w/, (c) => c.toUpperCase()),
        }));
    }),

    /**
     * List all API tokens for current tenant
     */
    list: protectedProcedure
        .use(requirePermission('Settings:read'))
        .query(async ({ ctx }) => {
            if (!ctx.organizationId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No organization context',
                });
            }

            try {
                // Get all API keys for the current user
                const headers = extractHeaders(ctx as any);
                const result = await auth.api.listApiKeys({
                    headers,
                });

                // Filter by tenant and map to summary format
                const tokens: ApiTokenSummary[] = [];

                for (const key of result.apiKeys ?? []) {
                    const metadata = (key.metadata ?? {}) as Record<string, unknown>;
                    const keyTenantId = metadata['organizationId'] as string | undefined;

                    // Only include tokens for this tenant
                    if (keyTenantId !== ctx.organizationId) {
                        continue;
                    }

                    const permissions = (key.permissions ?? {}) as Record<string, string[]>;
                    const capabilities = permissions['capabilities'] ?? [];

                    tokens.push({
                        id: key.id,
                        name: key.name ?? null,
                        prefix: key.start ?? null,
                        capabilities,
                        createdAt: key.createdAt,
                        expiresAt: key.expiresAt ?? null,
                        lastUsedAt: key.lastRequest ?? null,
                        enabled: key.enabled,
                    });
                }

                return tokens;
            } catch (error) {
                console.error('Failed to list API tokens:', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to list API tokens',
                });
            }
        }),

    /**
     * Get single API token by ID
     */
    get: protectedProcedure
        .use(requirePermission('Settings:read'))
        .input(tokenIdInput)
        .query(async ({ ctx, input }) => {
            if (!ctx.organizationId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No organization context',
                });
            }

            try {
                const headers = extractHeaders(ctx as any);
                const key = await auth.api.getApiKey({
                    query: { id: input.id },
                    headers,
                });

                if (!key) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'API token not found',
                    });
                }

                // Verify tenant ownership
                const metadata = (key.metadata ?? {}) as Record<string, unknown>;
                const keyTenantId = metadata['organizationId'] as string | undefined;

                if (keyTenantId !== ctx.organizationId) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'API token not found',
                    });
                }

                const permissions = (key.permissions ?? {}) as Record<string, string[]>;
                const capabilities = permissions['capabilities'] ?? [];

                const token: ApiTokenSummary = {
                    id: key.id,
                    name: key.name ?? null,
                    prefix: key.start ?? null,
                    capabilities,
                    createdAt: key.createdAt,
                    expiresAt: key.expiresAt ?? null,
                    lastUsedAt: key.lastRequest ?? null,
                    enabled: key.enabled,
                };

                return token;
            } catch (error) {
                if (error instanceof TRPCError) throw error;
                console.error('Failed to get API token:', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to get API token',
                });
            }
        }),

    /**
     * Create new API token
     * Returns full token key (one-time only)
     */
    create: protectedProcedure
        .use(requirePermission('core:api-tokens:manage'))
        .input(createTokenInput)
        .mutation(async ({ ctx, input }) => {
            if (!ctx.organizationId || !ctx.userId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No organization context',
                });
            }

            // Validate capabilities
            for (const cap of input.capabilities) {
                if (!AVAILABLE_SCOPES.includes(cap as typeof AVAILABLE_SCOPES[number])) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Invalid capability: ${cap}`,
                    });
                }
            }

            try {
                const headers = extractHeaders(ctx as any);
                const result = await auth.api.createApiKey({
                    body: {
                        name: input.name,
                        expiresIn: input.expiresIn,
                        permissions: {
                            capabilities: input.capabilities,
                        },
                        metadata: {
                            organizationId: ctx.organizationId,
                            issuedBy: ctx.userId,
                            createdVia: 'admin-ui',
                        },
                    },
                    headers,
                });

                return {
                    id: result.id,
                    key: result.key, // Full key - only returned once!
                    name: result.name ?? null,
                    prefix: result.start ?? null,
                    capabilities: input.capabilities,
                    createdAt: result.createdAt,
                    expiresAt: result.expiresAt ?? null,
                };
            } catch (error) {
                console.error('Failed to create API token:', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to create API token',
                });
            }
        }),

    /**
     * Delete API token
     */
    delete: protectedProcedure
        .use(requirePermission('core:api-tokens:manage'))
        .input(tokenIdInput)
        .mutation(async ({ ctx, input }) => {
            if (!ctx.organizationId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No organization context',
                });
            }

            try {
                // First verify the token belongs to this tenant
                const headers = extractHeaders(ctx as any);
                const key = await auth.api.getApiKey({
                    query: { id: input.id },
                    headers,
                });

                if (!key) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'API token not found',
                    });
                }

                const metadata = (key.metadata ?? {}) as Record<string, unknown>;
                const keyTenantId = metadata['organizationId'] as string | undefined;

                if (keyTenantId !== ctx.organizationId) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'API token not found',
                    });
                }

                // Delete the token
                await auth.api.deleteApiKey({
                    body: { keyId: input.id },
                    headers,
                });

                return { success: true };
            } catch (error) {
                if (error instanceof TRPCError) throw error;
                console.error('Failed to delete API token:', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to delete API token',
                });
            }
        }),

    /**
     * Toggle API token enabled/disabled
     */
    toggle: protectedProcedure
        .use(requirePermission('core:api-tokens:manage'))
        .input(
            z.object({
                id: z.string(),
                enabled: z.boolean(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            if (!ctx.organizationId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No organization context',
                });
            }

            try {
                // First verify the token belongs to this tenant
                const headers = extractHeaders(ctx as any);
                const key = await auth.api.getApiKey({
                    query: { id: input.id },
                    headers,
                });

                if (!key) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'API token not found',
                    });
                }

                const metadata = (key.metadata ?? {}) as Record<string, unknown>;
                const keyTenantId = metadata['organizationId'] as string | undefined;

                if (keyTenantId !== ctx.organizationId) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'API token not found',
                    });
                }

                // Update enabled status
                await auth.api.updateApiKey({
                    body: {
                        keyId: input.id,
                        enabled: input.enabled,
                    },
                    headers,
                });

                return { success: true, enabled: input.enabled };
            } catch (error) {
                if (error instanceof TRPCError) throw error;
                console.error('Failed to toggle API token:', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to toggle API token',
                });
            }
        }),
});
