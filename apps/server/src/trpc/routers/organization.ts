/**
 * Organization tRPC Router
 *
 * Provides API for managing multi-tenant organization switching.
 * Enforces membership validation and audit logging for security.
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { db } from '../../db';
import { organization, member, session } from '../../db/schema/auth-schema.js';
import { auditLogs } from '../../db/schema/audit-logs.js';
import { eq, and } from 'drizzle-orm';
import { auth } from '../../auth/auth.js';

/**
 * Organization summary type
 */
const organizationSummarySchema = z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    logo: z.string().nullable(),
    createdAt: z.date(),
});

/**
 * Member organization with role
 */
const memberOrganizationSchema = organizationSummarySchema.extend({
    role: z.string(),
});

/**
 * Input for setActive
 */
const setActiveInputSchema = z.object({
    organizationId: z.string().min(1, 'Organization ID is required').optional(),
    organizationSlug: z.string().min(1, 'Organization slug is required').optional(),
}).refine(
    data => !!data.organizationId || !!data.organizationSlug,
    {
        message: 'organizationId or organizationSlug is required',
        path: ['organizationId'],
    }
);

export const organizationRouter = router({
    /**
     * List user's organizations
     *
     * Returns all organizations the current user is a member of.
     * Filters out banned memberships for security.
     */
    listMine: protectedProcedure
        .output(z.object({
            organizations: z.array(memberOrganizationSchema),
        }))
        .query(async ({ ctx }) => {
            const userId = ctx.userId;

            if (!userId) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required',
                });
            }

            try {
                // Query organizations where user is a member
                // Join member + organization tables
                const memberships = await db
                    .select({
                        id: organization.id,
                        name: organization.name,
                        slug: organization.slug,
                        logo: organization.logo,
                        createdAt: organization.createdAt,
                        role: member.role,
                        status: member.status,
                        banExpires: member.banExpires,
                    })
                    .from(member)
                    .innerJoin(organization, eq(member.organizationId, organization.id))
                    .where(eq(member.userId, userId));

                console.log('[Organization] listMine - Found memberships:', memberships.length);

                // Filter out banned memberships
                const now = new Date();
                const activeOrgs = memberships.filter(m => {
                    // Exclude if permanently banned
                    if (m.status === 'banned' && !m.banExpires) {
                        return false;
                    }
                    // Exclude if temporarily banned and not expired
                    if (m.status === 'banned' && m.banExpires && m.banExpires > now) {
                        return false;
                    }
                    return true;
                });

                console.log('[Organization] listMine - Active organizations:', activeOrgs.length);

                // Map to response format
                const organizations = activeOrgs.map(org => ({
                    id: org.id,
                    name: org.name,
                    slug: org.slug,
                    logo: org.logo,
                    role: org.role,
                    createdAt: org.createdAt,
                }));

                return { organizations };
            } catch (error) {
                console.error('[Organization] listMine error:', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to load organizations',
                });
            }
        }),

    /**
     * Set active organization
     *
     * Switches the user's active organization context.
     * Validates membership and ban status before switching.
     * Records audit log for security tracking.
     */
    setActive: protectedProcedure
        .input(setActiveInputSchema)
        .output(z.object({
            activeOrganizationId: z.string(),
            organization: memberOrganizationSchema,
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.userId;
            const { organizationId: inputOrgId, organizationSlug } = input;

            let organizationId = inputOrgId;
            let orgDetails:
                | {
                    id: string;
                    name: string;
                    slug: string;
                    logo: string | null;
                    createdAt: Date;
                }
                | undefined;

            if (!userId) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required',
                });
            }

            console.log('[Organization] setActive - userId:', userId, 'orgId:', organizationId, 'orgSlug:', organizationSlug);

            try {
                // Resolve organization by slug if id not provided
                if (!organizationId && organizationSlug) {
                    const foundBySlug = await db
                        .select({
                            id: organization.id,
                            name: organization.name,
                            slug: organization.slug,
                            logo: organization.logo,
                            createdAt: organization.createdAt,
                        })
                        .from(organization)
                        .where(eq(organization.slug, organizationSlug))
                        .limit(1);

                    if (foundBySlug.length === 0) {
                        throw new TRPCError({
                            code: 'NOT_FOUND',
                            message: 'Organization not found',
                        });
                    }

                    organizationId = foundBySlug[0]!.id;
                    orgDetails = foundBySlug[0]!;
                }

                if (!organizationId) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'Organization not found',
                    });
                }

                // Step 1: Verify membership
                const membership = await db
                    .select({
                        id: member.id,
                        role: member.role,
                        status: member.status,
                        banExpires: member.banExpires,
                        organizationId: member.organizationId,
                    })
                    .from(member)
                    .where(
                        and(
                            eq(member.userId, userId),
                            eq(member.organizationId, organizationId)
                        )
                    )
                    .limit(1);

                if (membership.length === 0) {
                    console.warn(`[Organization] setActive - Not a member: userId=${userId}, orgId=${organizationId}`);

                    // Audit failed attempt
                    await db.insert(auditLogs).values({
                        actorType: 'user',
                        actorId: userId,
                        organizationId: organizationId,
                        organizationId: organizationId,
                        action: 'organization.set_active',
                        resource: `organization:${organizationId}`,
                        result: 'deny',
                        metadata: { reason: 'not_a_member' },
                    });

                    throw new TRPCError({
                        code: 'FORBIDDEN',
                        message: 'Not a member of this organization',
                    });
                }

                const membershipData = membership[0]!; // Safe: we checked length above

                // Step 2: Check ban status
                const now = new Date();
                const isBanned =
                    membershipData.status === 'banned' &&
                    (!membershipData.banExpires || membershipData.banExpires > now);

                if (isBanned) {
                    console.warn(`[Organization] setActive - Banned member: userId=${userId}, orgId=${organizationId}`);

                    // Audit failed attempt
                    await db.insert(auditLogs).values({
                        actorType: 'user',
                        actorId: userId,
                        organizationId: organizationId,
                        organizationId: organizationId,
                        action: 'organization.set_active',
                        resource: `organization:${organizationId}`,
                        result: 'deny',
                        metadata: { reason: 'banned' },
                    });

                    throw new TRPCError({
                        code: 'FORBIDDEN',
                        message: 'Organization access is banned',
                    });
                }

                // Step 3: Get organization details
                if (!orgDetails) {
                    const orgResult = await db
                        .select({
                            id: organization.id,
                            name: organization.name,
                            slug: organization.slug,
                            logo: organization.logo,
                            createdAt: organization.createdAt,
                        })
                        .from(organization)
                        .where(eq(organization.id, organizationId))
                        .limit(1);

                    if (orgResult.length === 0) {
                        throw new TRPCError({
                            code: 'NOT_FOUND',
                            message: 'Organization not found',
                        });
                    }

                    orgDetails = orgResult[0]!;
                }

                // Step 4: Update session in database directly
                // This is more reliable than Better Auth API for tRPC context
                const headers = new Headers();
                if (ctx.req?.headers) {
                    for (const [key, value] of Object.entries(ctx.req.headers)) {
                        if (value) {
                            headers.set(key, Array.isArray(value) ? value[0] ?? '' : value);
                        }
                    }
                }

                // Get current session
                const currentSession = await auth.api.getSession({ headers });
                if (currentSession?.session?.id) {
                    // Update session's activeOrganizationId directly in database
                    await db
                        .update(session)
                        .set({ activeOrganizationId: organizationId })
                        .where(eq(session.id, currentSession.session.id));

                    console.log('[Organization] setActive - Session updated in database');
                } else {
                    console.warn('[Organization] setActive - No session found, skipping session update');
                }

                // Step 5: Record successful audit log
                await db.insert(auditLogs).values({
                    actorType: 'user',
                    actorId: userId,
                    organizationId: organizationId,
                    organizationId: organizationId,
                    action: 'organization.set_active',
                    resource: `organization:${organizationId}`,
                    result: 'allow',
                    metadata: {
                        previousOrgId: ctx.organizationId,
                        newOrgId: organizationId,
                    },
                });

                console.log(`[Organization] setActive - Success: userId=${userId}, orgId=${organizationId}`);

                // Step 6: Return new active organization
                return {
                    activeOrganizationId: organizationId,
                    organization: {
                        id: orgDetails.id,
                        name: orgDetails.name,
                        slug: orgDetails.slug,
                        logo: orgDetails.logo,
                        role: membershipData.role,
                        createdAt: orgDetails.createdAt,
                    },
                };
            } catch (error) {
                // Re-throw TRPCError as-is
                if (error instanceof TRPCError) {
                    throw error;
                }

                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error('[Organization] setActive - Unexpected error:', errorMsg);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Unable to switch organization',
                });
            }
        }),
});

export type OrganizationRouter = typeof organizationRouter;
