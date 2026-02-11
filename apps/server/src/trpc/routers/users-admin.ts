/**
 * Users Admin Router - 示例: 字段过滤
 *
 * 展示权限系统的字段级访问控制:
 * - 普通用户: 只能看到 name, email
 * - 管理员: 可以看到所有字段 (包括 password_hash, api_keys)
 * - 字段过滤在 DB 层自动应用,无需手动过滤
 *
 * 配置示例 (数据库):
 * ```sql
 * -- Viewer 角色: 只能读取基础字段
 * INSERT INTO role_permissions (role_id, action, subject, fields) VALUES
 * ('viewer', 'read', 'User', '["id", "name", "email", "createdAt"]');
 *
 * -- Admin 角色: 可以读取所有字段
 * INSERT INTO role_permissions (role_id, action, subject, fields) VALUES
 * ('admin', 'read', 'User', NULL); -- NULL = 所有字段
 * ```
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { Actions, Subjects } from '../../permission/constants';
import { user } from '@wordrhyme/db';
import { eq } from 'drizzle-orm';

/**
 * Input Schemas
 */
const userIdInput = z.object({
    userId: z.string(),
});

const updateUserInput = z.object({
    userId: z.string(),
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    role: z.enum(['viewer', 'editor', 'admin']).optional(),
});

/**
 * Users Admin Router
 *
 * 重点展示: 字段级权限控制的自动化
 */
export const usersAdminRouter = router({
    /**
     * 列出用户 - 字段自动过滤
     *
     * Before (手动字段过滤 - 23 行):
     * ```typescript
     * list: protectedProcedure
     *   .query(async ({ ctx }) => {
     *     await permissionKernel.require('read', 'User', undefined, ctx);
     *
     *     // 1. 查询所有字段
     *     const users = await db.select().from(usersTable).where(...);
     *
     *     // 2. 获取允许的字段列表
     *     const allowedFields = await permissionKernel.permittedFields('read', 'User', ctx);
     *
     *     // 3. 手动过滤每个用户的字段
     *     return users.map(user => {
     *       const filtered: any = {};
     *       for (const field of allowedFields || Object.keys(user)) {
     *         filtered[field] = user[field];
     *       }
     *       return filtered;
     *     });
     *   });
     * ```
     *
     * After (自动字段过滤 - 5 行) ✅:
     */
    list: protectedProcedure
        .meta({ permission: { action: Actions.read, subject: Subjects.User } })
        .query(async ({ ctx }) => {
            // ✅ ScopedDb 自动应用字段过滤
            // Viewer 角色: 只返回 id, name, email, createdAt
            // Admin 角色: 返回所有字段 (包括 password_hash, api_keys)

            const users = await db
                .select()
                .from(user)
                .where(eq(user.organizationId, ctx.organizationId!));

            return users; // ← 字段已根据角色自动过滤 ✅
        }),

    /**
     * 获取单个用户 - 字段自动过滤
     */
    getById: protectedProcedure
        .input(userIdInput)
        .meta({ permission: { action: Actions.read, subject: Subjects.User } })
        .query(async ({ input }) => {
            const [foundUser] = await db
                .select()
                .from(user)
                .where(eq(user.id, input.userId))
                .limit(1);

            if (!foundUser) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'User not found',
                });
            }

            // ✅ 返回的对象字段已自动过滤
            // 例如: Viewer 角色不会看到 password_hash
            return foundUser;
        }),

    /**
     * 更新用户 - 字段自动过滤 (输入和输出)
     *
     * Before (手动字段过滤 - 35 行):
     * ```typescript
     * update: protectedProcedure
     *   .input(updateUserInput)
     *   .mutation(async ({ ctx, input }) => {
     *     // 1. RBAC 检查
     *     await permissionKernel.require('update', 'User', undefined, ctx);
     *
     *     // 2. 查询现有用户
     *     const [existingUser] = await db.select().from(usersTable).where(eq(...));
     *     if (!existingUser) throw new TRPCError({ code: 'NOT_FOUND' });
     *
     *     // 3. ABAC 检查
     *     const allowed = await permissionKernel.can('update', 'User', existingUser, ctx);
     *     if (!allowed) throw new TRPCError({ code: 'FORBIDDEN' });
     *
     *     // 4. 获取可更新字段列表
     *     const allowedFields = await permissionKernel.permittedFields('update', 'User', ctx);
     *
     *     // 5. 过滤输入字段
     *     const filteredData: any = {};
     *     for (const [key, value] of Object.entries(input)) {
     *       if (allowedFields?.includes(key)) {
     *         filteredData[key] = value;
     *       }
     *     }
     *
     *     // 6. 执行更新
     *     const [updated] = await db.update(usersTable).set(filteredData).where(eq(...)).returning();
     *
     *     // 7. 过滤输出字段
     *     const outputFields = await permissionKernel.permittedFields('read', 'User', ctx);
     *     return filterFields(updated, outputFields);
     *   });
     * ```
     *
     * After (自动双向字段过滤 - 8 行) ✅:
     */
    update: protectedProcedure
        .input(updateUserInput)
        .meta({ permission: { action: Actions.update, subject: Subjects.User } })
        .mutation(async ({ input }) => {
            // ✅ INPUT 字段自动过滤:
            //    例如: editor 角色尝试更新 'role' 字段 → 自动忽略
            // ✅ ABAC 自动执行:
            //    例如: 只能更新自己的用户资料
            // ✅ OUTPUT 字段自动过滤:
            //    返回的对象只包含角色允许读取的字段

            const { userId, ...data } = input;

            const [updated] = await db
                .update(user)
                .set(data) // ← ScopedDb 自动过滤不允许的字段
                .where(eq(user.id, userId))
                .returning();

            if (!updated) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'User not found',
                });
            }

            return updated; // ← 输出字段也自动过滤
        }),

    /**
     * 获取当前用户信息 - 无需权限检查
     *
     * 展示: 即使是 "自己的信息",字段过滤仍然生效
     */
    me: protectedProcedure
        .query(async ({ ctx }) => {
            // 不需要 .meta({ permission }) 因为用户总是可以读取自己的信息

            const [currentUser] = await db
                .select()
                .from(user)
                .where(eq(user.id, ctx.userId!))
                .limit(1);

            if (!currentUser) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'User not found',
                });
            }

            // ⚠️ 注意: 即使是查询自己,字段仍然会被过滤
            // 这是故意的设计 - 防止低权限用户看到敏感字段
            return currentUser;
        }),
});

/**
 * 字段过滤示例:
 *
 * 假设数据库配置:
 * ```sql
 * -- Viewer: 只能读取基础字段
 * role_permissions: { role: 'viewer', action: 'read', subject: 'User', fields: ['id', 'name', 'email'] }
 *
 * -- Editor: 可以读取更多字段
 * role_permissions: { role: 'editor', action: 'read', subject: 'User', fields: ['id', 'name', 'email', 'role', 'createdAt'] }
 *
 * -- Admin: 所有字段
 * role_permissions: { role: 'admin', action: 'read', subject: 'User', fields: null }
 * ```
 *
 * 查询结果:
 *
 * **Viewer 角色查询用户列表**:
 * ```json
 * [
 *   { "id": "1", "name": "Alice", "email": "alice@example.com" }
 * ]
 * ```
 * ⚠️ password_hash, api_keys, role 字段被自动移除
 *
 * **Admin 角色查询用户列表**:
 * ```json
 * [
 *   {
 *     "id": "1",
 *     "name": "Alice",
 *     "email": "alice@example.com",
 *     "role": "editor",
 *     "password_hash": "$2b$...",
 *     "api_keys": ["key1", "key2"],
 *     "createdAt": "2025-01-30T10:00:00Z"
 *   }
 * ]
 * ```
 * ✅ 所有字段都可见
 *
 * **代码统计**:
 * | 操作 | Before (手动) | After (自动) | 减少 |
 * |------|--------------|-------------|------|
 * | list | 23 行 | 5 行 | 78% |
 * | update | 35 行 | 8 行 | 77% |
 * | **平均** | **29 行** | **6.5 行** | **78%** ✅ |
 */
