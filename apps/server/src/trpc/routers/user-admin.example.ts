/**
 * 用户管理 Router - 跨租户查询示例
 *
 * 演示如何使用跨租户权限系统：
 * - 普通用户只能查看当前组织的用户
 * - Platform 组织的管理员可以查看所有组织的用户
 */
import { router, protectedProcedure } from '../trpc';
import { db } from '../db/client';
import { user } from '../db/schema/auth-schema';
import { applyCrossTenantFilter, canCrossTenant, logCrossTenantAccess } from '../permission/cross-tenant';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';

export const userAdminRouter = router({
    /**
     * 列出用户
     *
     * - 普通用户：只能看到当前组织的用户
     * - Platform 管理员：可以看到所有组织的用户
     */
    list: protectedProcedure
        .input(z.object({
            limit: z.number().min(1).max(100).default(20),
            offset: z.number().min(0).default(0),
        }).optional())
        .query(async ({ ctx, input }) => {
            const { limit = 20, offset = 0 } = input || {};

            // 构建查询
            let query = db
                .select({
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    createdAt: user.createdAt,
                    // 注意：跨租户查询时需要显示 organizationId
                    // organizationId: user.organizationId,
                })
                .from(user)
                .limit(limit)
                .offset(offset);

            // 应用跨租户过滤
            const filter = await applyCrossTenantFilter(ctx, 'User', user.organizationId);
            if (filter) {
                query = query.where(filter);
            }

            const users = await query;

            // 记录跨租户访问
            if (await canCrossTenant(ctx, 'User')) {
                await logCrossTenantAccess(ctx, 'read', 'User', users.length);
            }

            return {
                users,
                total: users.length,
                isCrossTenant: await canCrossTenant(ctx, 'User'),
            };
        }),

    /**
     * 获取用户详情
     *
     * - 普通用户：只能查看当前组织的用户
     * - Platform 管理员：可以查看任何组织的用户
     */
    getById: protectedProcedure
        .input(z.object({
            userId: z.string(),
        }))
        .query(async ({ ctx, input }) => {
            // 构建查询
            let query = db
                .select()
                .from(user)
                .where(eq(user.id, input.userId))
                .limit(1);

            // 应用跨租户过滤
            const filter = await applyCrossTenantFilter(ctx, 'User', user.organizationId);
            if (filter) {
                query = query.where(and(
                    eq(user.id, input.userId),
                    filter
                ));
            }

            const users = await query;

            if (users.length === 0) {
                throw new Error('User not found or access denied');
            }

            // 记录跨租户访问
            if (await canCrossTenant(ctx, 'User')) {
                await logCrossTenantAccess(ctx, 'read', 'User', 1, {
                    userId: input.userId,
                });
            }

            return { user: users[0] };
        }),

    /**
     * 统计用户数量
     *
     * - 普通用户：只能统计当前组织的用户
     * - Platform 管理员：可以统计所有组织的用户
     */
    count: protectedProcedure
        .query(async ({ ctx }) => {
            // 构建查询
            let query = db
                .select({ count: sql<number>`count(*)` })
                .from(user);

            // 应用跨租户过滤
            const filter = await applyCrossTenantFilter(ctx, 'User', user.organizationId);
            if (filter) {
                query = query.where(filter);
            }

            const result = await query;
            const count = result[0]?.count || 0;

            // 记录跨租户访问
            if (await canCrossTenant(ctx, 'User')) {
                await logCrossTenantAccess(ctx, 'read', 'User', count, {
                    operation: 'count',
                });
            }

            return {
                count,
                isCrossTenant: await canCrossTenant(ctx, 'User'),
            };
        }),
});
