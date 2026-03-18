/**
 * Organization tRPC Router
 *
 * Provides API for managing multi-tenant organization switching.
 * Enforces membership validation and audit logging for security.
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { rawDb } from '../../db';
import { organization, member, auditLogs } from '@wordrhyme/db';
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
                const memberships = await rawDb
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
                console.error('[Organization] listMine error:', error instanceof Error ? error.message : String(error));
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to load organizations',
                });
            }
        }),

    /**
     * Set active organization
     *
     * Switches the user's active organization context via Better Auth API.
     * Adds ban status check (not covered by Better Auth) and audit logging.
     */
    setActive: protectedProcedure
        .input(setActiveInputSchema)
        .output(z.object({
            activeOrganizationId: z.string(),
            organization: memberOrganizationSchema,
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.userId!;
            const { organizationId: inputOrgId, organizationSlug } = input;

            // Step 1: Resolve slug → ID (needed for ban check before calling Better Auth)
            let organizationId = inputOrgId;
            if (!organizationId && organizationSlug) {
                const [found] = await rawDb
                    .select({ id: organization.id })
                    .from(organization)
                    .where(eq(organization.slug, organizationSlug))
                    .limit(1);

                if (!found) {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
                }
                organizationId = found.id;
            }

            if (!organizationId) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
            }

            // Step 2: Ban check (Better Auth doesn't handle this)
            console.log('[Organization] setActive - Checking membership:', { userId, organizationId });

            const [membershipData] = await rawDb
                .select({
                    role: member.role,
                    status: member.status,
                    banExpires: member.banExpires,
                })
                .from(member)
                .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
                .limit(1);

            console.log('[Organization] setActive - Membership result:', membershipData ?? 'NOT FOUND');

            if (!membershipData) {
                await rawDb.insert(auditLogs).values({
                    actorType: 'user',
                    actorId: userId,
                    organizationId: ctx.organizationId || organizationId,
                    action: 'organization.set_active',
                    resource: `organization:${organizationId}`,
                    result: 'deny',
                    metadata: { reason: 'not_a_member', targetOrgId: organizationId },
                });
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this organization' });
            }

            const now = new Date();
            const isBanned = membershipData.status === 'banned'
                && (!membershipData.banExpires || membershipData.banExpires > now);

            if (isBanned) {
                await rawDb.insert(auditLogs).values({
                    actorType: 'user',
                    actorId: userId,
                    organizationId: ctx.organizationId || organizationId,
                    action: 'organization.set_active',
                    resource: `organization:${organizationId}`,
                    result: 'deny',
                    metadata: { reason: 'banned', targetOrgId: organizationId },
                });
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Organization access is banned' });
            }

            // Step 3: Call Better Auth API (membership validation + session update + cookie)
            const headers = new Headers();
            if (ctx.req?.headers) {
                for (const [key, value] of Object.entries(ctx.req.headers)) {
                    if (value) {
                        headers.set(key, Array.isArray(value) ? value[0] ?? '' : value);
                    }
                }
            }

            try {
                await auth.api.setActiveOrganization({
                    body: { organizationId },
                    headers,
                });
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error('[Organization] setActive - Better Auth error:', errorMsg);
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Unable to switch organization' });
            }

            // Step 4: Audit log
            await rawDb.insert(auditLogs).values({
                actorType: 'user',
                actorId: userId,
                organizationId: ctx.organizationId || organizationId,
                action: 'organization.set_active',
                resource: `organization:${organizationId}`,
                result: 'allow',
                metadata: { previousOrgId: ctx.organizationId, newOrgId: organizationId },
            });

            // Step 5: Get org details for response
            const [orgDetails] = await rawDb
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

            if (!orgDetails) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
            }

            return {
                activeOrganizationId: organizationId,
                organization: {
                    ...orgDetails,
                    role: membershipData.role,
                },
            };
        }),
});

export type OrganizationRouter = typeof organizationRouter;
