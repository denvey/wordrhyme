import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';
import { PermissionKernel, PermissionDeniedError } from '../permission';

/**
 * Initialize tRPC with context
 */
const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;

/**
 * Permission Kernel instance for middleware
 */
const permissionKernel = new PermissionKernel();

/**
 * Middleware to require a specific permission
 * 
 * Usage:
 * ```ts
 * router({
 *   sensitiveAction: protectedProcedure
 *     .use(requirePermission('core:users:manage'))
 *     .mutation(async ({ ctx }) => { ... })
 * })
 * ```
 */
export const requirePermission = (capability: string) => {
    return middleware(async ({ ctx, next }) => {
        try {
            await permissionKernel.require(capability);
            return next({ ctx });
        } catch (error) {
            if (error instanceof PermissionDeniedError) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: `Permission denied: ${capability}`,
                    cause: error,
                });
            }
            throw error;
        }
    });
};

/**
 * Protected procedure - requires authentication
 * Throws UNAUTHORIZED if no userId in context
 */
export const protectedProcedure = t.procedure.use(
    middleware(async ({ ctx, next }) => {
        if (!ctx.userId) {
            throw new TRPCError({
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
            });
        }
        return next({ ctx });
    })
);
